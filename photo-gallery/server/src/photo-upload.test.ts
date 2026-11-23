import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import sharp from "sharp";
import { uploadLimits } from "@wildlife-gallery/shared";
import { createApp } from "./app.js";
import { MemoryStorageAdapter, type StorageAdapter, UnconfiguredStorageAdapter } from "./storage/adapter.js";
import type { CreatePhotoInput, PhotoRepositoryContract } from "./db/photos.js";
import { createHash } from "node:crypto";

const testUserId = "11111111-1111-4111-8111-111111111111";
const otherUserId = "44444444-4444-4444-8444-444444444444";
const sessionToken = "a".repeat(64);
const csrfToken = "b".repeat(64);
const otherSessionToken = "c".repeat(64);
const otherCsrfToken = "d".repeat(64);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const testUsers = {
  async findSession(tokenHash: string) {
    if (tokenHash === hash(sessionToken)) return { id: "22222222-2222-4222-8222-222222222222", csrfToken, user: { id: testUserId, username: "tester", displayName: null, bio: null, avatarUrl: null, isSystem: false } };
    if (tokenHash === hash(otherSessionToken)) return { id: "55555555-5555-4555-8555-555555555555", csrfToken: otherCsrfToken, user: { id: otherUserId, username: "other", displayName: null, bio: null, avatarUrl: null, isSystem: false } };
    return null;
  },
} as never;

const pool = { query: async () => ({ rows: [{ ok: 1 }] }) };
class TestPhotoRepository implements PhotoRepositoryContract {
  photos = new Map<string, { input: CreatePhotoInput; status: string; uploaded: Set<string> }>();
  cleanupJobs = new Map<string, string>();
  async createPending(input: CreatePhotoInput) { this.photos.set(input.id, { input, status: "pending", uploaded: new Set() }); this.cleanupJobs.set(input.id, "running"); }
  async markObjectUploaded(bucket: string, key: string) {
    for (const photo of this.photos.values()) photo.uploaded.add(`${bucket}/${key}`);
  }
  async markReady(id: string) {
    const photo = this.photos.get(id)!;
    const expected = [photo.input.original, ...photo.input.variants].length;
    if (photo.uploaded.size !== expected) throw new Error("Missing object");
    photo.status = "ready";
  }
  async scheduleCleanup(id: string) { const photo = this.photos.get(id); if (photo) photo.status = "pending_delete"; this.cleanupJobs.set(id, "queued"); }
  async beginDelete(id: string, ownerId: string) {
    const photo = this.photos.get(id);
    if (!photo) return "not_found";
    if (photo.input.ownerId !== ownerId) return "forbidden";
    photo.status = "pending_delete";
    this.cleanupJobs.set(id, "queued");
    return "pending";
  }
  async claimCleanupJob() { return null; }
  async getCleanupObjects() { return []; }
  async completeCleanup(id: string) { this.photos.delete(id); }
  async failCleanup() {}
  async editableSource() { return null; }
  async publishEditedVersion() { return false; }
  async restoreOriginalVersion() { return false; }
}

function testApp(storage: StorageAdapter = new MemoryStorageAdapter(), repository = new TestPhotoRepository()) {
  return { app: createApp(pool as never, { storage, repository, users: testUsers }), repository };
}

function withTestAuth<T extends { set(name: string, value: string): T }>(call: T) {
  return call.set("Cookie", `gallery_session=${sessionToken}`).set("x-csrf-token", csrfToken);
}
function withOtherTestAuth<T extends { set(name: string, value: string): T }>(call: T) {
  return call.set("Cookie", `gallery_session=${otherSessionToken}`).set("x-csrf-token", otherCsrfToken);
}

let jpeg: Buffer;
let png: Buffer;

beforeAll(async () => {
  jpeg = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#387a55" } }).jpeg().toBuffer();
  png = await sharp({ create: { width: 600, height: 900, channels: 4, background: "#4a815d" } }).png().toBuffer();
});

function metadata(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    title: `Wildlife ${index}`,
    caption: "In the field",
    altText: `Wildlife photo ${index}`,
    category: "Birds",
    tags: ["wildlife"],
    photographerCredit: "Test Photographer",
    permissionConfirmed: true,
  }));
}

function upload(app: ReturnType<typeof createApp>, files: Array<{ bytes: Buffer; name: string; type: string }>, entries: unknown[] = metadata(files.length)) {
  let call = withTestAuth(request(app).post("/api/photos/batch"));
  for (const file of files) call = call.attach("files", file.bytes, { filename: file.name, contentType: file.type });
  return call.field("metadata", JSON.stringify(entries));
}

describe("POST /api/photos/batch", () => {
  it("requires a signed-in session before parsing an upload", async () => {
    const { app } = testApp();
    const response = await request(app).post("/api/photos/batch").field("metadata", "[]");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("UNAUTHORIZED");
  });
  it("returns independent ordered outcomes for mixed valid and invalid images", async () => {
    const storage = new MemoryStorageAdapter();
    const { app } = testApp(storage);
    const response = await upload(app, [
      { bytes: jpeg, name: "one.jpg", type: "text/plain" },
      { bytes: png, name: "two.png", type: "image/jpeg" },
      { bytes: Buffer.from("not an image"), name: "forged.jpg", type: "image/jpeg" },
    ]);
    expect(response.status).toBe(207);
    expect(response.body.summary).toEqual({ received: 3, succeeded: 2, failed: 1 });
    expect(response.body.results.map((result: { status: string }) => result.status)).toEqual(["succeeded", "succeeded", "failed"]);
    expect(response.body.results[2].error.code).toBe("UNSUPPORTED_FORMAT");
    const uploadedPhoto = response.body.results[0].photo;
    expect(uploadedPhoto).not.toHaveProperty("original");
    expect(uploadedPhoto.variants.length).toBeGreaterThan(0);
    for (const variant of uploadedPhoto.variants) {
      expect(variant.width).toBeGreaterThan(0);
      expect(variant.height).toBeGreaterThan(0);
      expect(variant.url).toContain("/photo-variants/photos/");
    }
    expect(storage.objects.size).toBeGreaterThan(2);
    expect([...storage.objects.keys()].every((key) => !key.includes("one.jpg"))).toBe(true);
    for (const object of storage.objects.values()) {
      if (object.bucket === "photo-variants") {
        expect(object.contentType).toBe("image/jpeg");
        expect(object.cacheControl).toBe("31536000");
        const metadata = await sharp(object.bytes).metadata();
        expect(metadata.exif).toBeUndefined();
        expect(metadata.orientation).toBeUndefined();
        expect(metadata.width).toBeLessThanOrEqual(960);
      }
    }
  });

  it("rejects missing files and missing titles at the request level", async () => {
    const { app } = testApp(new UnconfiguredStorageAdapter());
    const noFiles = await withTestAuth(request(app).post("/api/photos/batch")).field("metadata", "[]");
    expect(noFiles.status).toBe(400);
    expect(noFiles.body.error.code).toBe("INVALID_FILE_COUNT");

    const entries = metadata(1);
    delete (entries[0] as Partial<typeof entries[number]>).title;
    const missingTitle = await upload(app, [{ bytes: jpeg, name: "one.jpg", type: "image/jpeg" }], entries);
    expect(missingTitle.status).toBe(422);
    expect(missingTitle.body.error.code).toBe("MISSING_REQUIRED_FIELD");
    expect(missingTitle.body.results).toBeUndefined();
  });

  it("accepts a title without other metadata or permission confirmation", async () => {
    const { app } = testApp();
    const response = await upload(app, [{ bytes: jpeg, name: "one.jpg", type: "image/jpeg" }], [{ title: "Heron" }]);
    expect(response.status).toBe(201);
    expect(response.body.summary.succeeded).toBe(1);
  });

  it("rejects six files at the request level", async () => {
    const { app } = testApp();
    let call = withTestAuth(request(app).post("/api/photos/batch"));
    for (let index = 0; index < 6; index += 1) {
      call = call.attach("files", jpeg, { filename: `photo-${index}.jpg`, contentType: "image/jpeg" });
    }
    const response = await call.field("metadata", JSON.stringify(metadata(6)));
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_FILE_COUNT");
  });

  it("rejects detectable data after the image payload", async () => {
    const { app } = testApp();
    const response = await upload(app, [{ bytes: Buffer.concat([jpeg, Buffer.from("trailing")]), name: "tail.jpg", type: "image/jpeg" }]);
    expect(response.status).toBe(422);
    expect(response.body.results[0].error.code).toBe("TRAILING_DATA_DETECTED");
  });

  it("keeps a valid image when another file exceeds the per-file byte limit", async () => {
    const { app } = testApp();
    const response = await upload(app, [
      { bytes: jpeg, name: "valid.jpg", type: "image/jpeg" },
      { bytes: Buffer.alloc(uploadLimits.maxFileBytes + 1), name: "large.jpg", type: "image/jpeg" },
    ]);
    expect(response.status).toBe(207);
    expect(response.body.results[0].status).toBe("succeeded");
    expect(response.body.results[1].error.code).toBe("FILE_TOO_LARGE");
  });

  it("rejects an image over the pixel dimension limit without storing objects", async () => {
    const storage = new MemoryStorageAdapter();
    const repository = new TestPhotoRepository();
    const { app } = testApp(storage, repository);
    const oversized = await sharp({ create: { width: uploadLimits.maxDimension + 1, height: 1, channels: 3, background: "#387a55" } }).jpeg().toBuffer();
    const response = await upload(app, [{ bytes: oversized, name: "too-wide.jpg", type: "image/jpeg" }]);
    expect(response.status).toBe(422);
    expect(response.body.results[0].error.code).toBe("PIXEL_LIMIT_EXCEEDED");
    expect(repository.photos.size).toBe(0);
    expect(storage.objects.size).toBe(0);
  });

  it("does not expose local persistence when Storage is not configured", async () => {
    const { app } = testApp(new UnconfiguredStorageAdapter());
    const response = await upload(app, [{ bytes: jpeg, name: "one.jpg", type: "image/jpeg" }]);
    expect(response.status).toBe(503);
    expect(response.body.results[0].error.code).toBe("STORAGE_UNAVAILABLE");
  });

  it("tracks a pending delete when a later object upload fails", async () => {
    class FailingStorage extends MemoryStorageAdapter {
      private puts = 0;
      override async put(object: Parameters<MemoryStorageAdapter["put"]>[0]) {
        this.puts += 1;
        if (this.puts === 3) throw new Error("simulated variant failure");
        await super.put(object);
      }
    }
    const repository = new TestPhotoRepository();
    const { app } = testApp(new FailingStorage(), repository);
    const response = await upload(app, [{ bytes: jpeg, name: "one.jpg", type: "image/jpeg" }]);
    expect(response.status).toBe(503);
    const [photo] = [...repository.photos.values()];
    expect(photo.status).toBe("pending_delete");
    expect(repository.cleanupJobs.get(photo.input.id)).toBe("queued");
    expect(photo.uploaded.size).toBe(2);
  });

  it("queues cleanup when the database fails after object upload", async () => {
    class FailingReadyRepository extends TestPhotoRepository {
      override async markReady(_id: string) { throw new Error("simulated database failure"); }
    }
    const repository = new FailingReadyRepository();
    const storage = new MemoryStorageAdapter();
    const { app } = testApp(storage, repository);
    const response = await upload(app, [{ bytes: jpeg, name: "one.jpg", type: "image/jpeg" }]);
    expect(response.status).toBe(503);
    expect(response.body.results[0].error.code).toBe("DATABASE_WRITE_FAILED");
    const [photo] = [...repository.photos.values()];
    expect(photo.status).toBe("pending_delete");
    expect(repository.cleanupJobs.get(photo.input.id)).toBe("queued");
    expect(storage.objects.size).toBeGreaterThan(0);
  });

  it("hides a photo and queues cleanup when delete is requested", async () => {
    const repository = new TestPhotoRepository();
    const { app } = testApp(new MemoryStorageAdapter(), repository);
    const uploaded = await upload(app, [{ bytes: jpeg, name: "one.jpg", type: "image/jpeg" }]);
    const id = uploaded.body.results[0].photo.id as string;
    const otherUserDelete = await withOtherTestAuth(request(app).delete(`/api/photos/${id}`));
    expect(otherUserDelete.status).toBe(403);
    const deleted = await withTestAuth(request(app).delete(`/api/photos/${id}`));
    expect(deleted.status).toBe(202);
    expect(repository.photos.get(id)?.status).toBe("pending_delete");
    expect(repository.cleanupJobs.get(id)).toBe("queued");
  });
});
