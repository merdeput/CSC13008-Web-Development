import { createHash } from "node:crypto";
import { Prisma } from "../generated/prisma/client.js";
import type { PrismaClient } from "../generated/prisma/client.js";

export type UploadMetadata = {
  title: string;
  caption?: string;
  altText?: string;
  category?: string;
  tags?: string[];
  photographerCredit?: string;
  locationName?: string;
  locationContinent?: string;
  locationRegion?: string;
  locationCountry?: string;
  competition?: string;
  award?: string;
  photoYear?: number;
  speciesCommon?: string;
  speciesLatin?: string;
  story?: string;
  permissionConfirmed?: boolean;
};

export type ExpectedObject = {
  bucket: string;
  key: string;
  kind: "original" | "variant";
  widthTarget?: number;
  width?: number;
  height?: number;
  mimeType: string;
  bytes: Buffer;
};

export type CreatePhotoInput = {
  id: string;
  ownerId: string | null;
  metadata: UploadMetadata;
  width: number;
  height: number;
  original: ExpectedObject & { checksum: string };
  variants: Array<ExpectedObject & { checksum: string }>;
};

export type DeleteResult = "deleted" | "pending" | "forbidden" | "not_found";

export interface PhotoRepositoryContract {
  createPending(input: CreatePhotoInput): Promise<void>;
  markObjectUploaded(bucket: string, key: string): Promise<unknown>;
  markReady(id: string): Promise<unknown>;
  scheduleCleanup(id: string, reason: string): Promise<unknown>;
  beginDelete(id: string, ownerId: string): Promise<DeleteResult>;
  claimCleanupJob(): Promise<{ id: string; photoId: string; attempts: number } | null>;
  getCleanupObjects(photoId: string): Promise<Array<{ bucket: string; key: string }>>;
  completeCleanup(photoId: string): Promise<unknown>;
  failCleanup(jobId: string, attempt: number, safeError: string): Promise<unknown>;
  editableSource(id: string, ownerId: string): Promise<{ id: string; originalBucket: string; originalKey: string; currentVersion: number; currentEdit: unknown; width: number; height: number } | null>;
  publishEditedVersion(id: string, ownerId: string, version: number, edit: { crop: { left: number; top: number; width: number; height: number }; rotation: number; flipX: boolean; flipY: boolean }, variants: Array<{ bucket: string; key: string; widthTarget: number; width: number; height: number; mimeType: string; bytes: number; checksum: string }>): Promise<boolean>;
  restoreOriginalVersion(id: string, ownerId: string): Promise<boolean>;
}

const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export class PhotoRepository implements PhotoRepositoryContract {
  constructor(private readonly prisma: PrismaClient) {}

  async createPending(input: CreatePhotoInput): Promise<void> {
    const now = new Date();
    const expected = [input.original, ...input.variants];
    const tags = [...new Set((input.metadata.tags ?? []).map((name) => name.trim()).filter(Boolean))];
    await this.prisma.photo.create({
      data: {
        id: input.id,
        ownerId: input.ownerId,
        title: input.metadata.title.trim(),
        caption: input.metadata.caption?.trim() || null,
        altText: input.metadata.altText?.trim() || null,
        category: input.metadata.category?.trim() || null,
        photographerCredit: input.metadata.photographerCredit?.trim() || null,
        locationName: input.metadata.locationName?.trim() || null,
        locationContinent: input.metadata.locationContinent?.trim() || null,
        locationRegion: input.metadata.locationRegion?.trim() || null,
        locationCountry: input.metadata.locationCountry?.trim() || null,
        competition: input.metadata.competition?.trim() || null,
        award: input.metadata.award?.trim() || null,
        photoYear: input.metadata.photoYear ?? null,
        speciesCommon: input.metadata.speciesCommon?.trim() || null,
        speciesLatin: input.metadata.speciesLatin?.trim() || null,
        story: input.metadata.story?.trim() || null,
        permissionConfirmedAt: input.metadata.permissionConfirmed ? now : null,
        originalBucket: input.original.bucket,
        originalKey: input.original.key,
        originalMimeType: input.original.mimeType,
        originalBytes: BigInt(input.original.bytes.length),
        originalChecksum: input.original.checksum,
        storedObjects: { create: expected.map((object) => ({ bucket: object.bucket, key: object.key, kind: object.kind })) },
        variants: { create: input.variants.map((variant) => ({
          widthTarget: variant.widthTarget!,
          width: variant.width!,
          height: variant.height!,
          bucket: variant.bucket,
          key: variant.key,
          mimeType: variant.mimeType,
          bytes: BigInt(variant.bytes.length),
          checksum: variant.checksum,
        })) },
        tags: { create: tags.map((name) => ({
          tag: {
            connectOrCreate: {
              where: { slug: slugify(name) },
              create: { name: name.trim(), slug: slugify(name) },
            },
          },
        })) },
        // A lease makes a crash during the upload recoverable after it expires.
        cleanupJob: { create: { status: "running", leaseUntil: new Date(now.getTime() + 10 * 60_000) } },
      },
    });
  }

  markObjectUploaded(bucket: string, key: string) {
    return this.prisma.storedObject.update({
      where: { bucket_key: { bucket, key } },
      data: { uploadedAt: new Date() },
    });
  }

  async markReady(id: string) {
    return this.prisma.$transaction(async (transaction) => {
      const photo = await transaction.photo.findUnique({ where: { id }, include: { storedObjects: true } });
      if (!photo || photo.status !== "pending" || photo.storedObjects.some((object) => !object.uploadedAt)) {
        throw new Error("Cannot finalize a photo before every storage object is confirmed.");
      }
      await transaction.photo.update({ where: { id }, data: { status: "ready" } });
      await transaction.cleanupJob.deleteMany({ where: { photoId: id } });
    });
  }

  async scheduleCleanup(id: string, reason: string) {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.photo.updateMany({ where: { id }, data: { status: "pending_delete" } });
      await transaction.cleanupJob.upsert({
        where: { photoId: id },
        create: { photoId: id, status: "queued", lastError: reason.slice(0, 200) },
        update: { status: "queued", leaseUntil: null, nextAttemptAt: new Date(), lastError: reason.slice(0, 200) },
      });
    });
  }

  async beginDelete(id: string, ownerId: string): Promise<DeleteResult> {
    return this.prisma.$transaction(async (transaction) => {
      const photo = await transaction.photo.findUnique({ where: { id }, select: { id: true, ownerId: true, status: true } });
      if (!photo) return "not_found";
      if (photo.ownerId !== ownerId) return "forbidden";
      if (photo.status === "pending_delete") return "pending";
      await transaction.photo.update({ where: { id }, data: { status: "pending_delete" } });
      await transaction.cleanupJob.upsert({
        where: { photoId: id },
        create: { photoId: id, status: "queued", nextAttemptAt: new Date() },
        update: { status: "queued", leaseUntil: null, nextAttemptAt: new Date(), lastError: null },
      });
      return "pending";
    });
  }

  async claimCleanupJob() {
    return this.prisma.$transaction(async (transaction) => {
      const [job] = await transaction.$queryRaw<Array<{ id: string; photo_id: string; attempts: number }>>`
        SELECT id, photo_id, attempts FROM storage_cleanup_jobs
        WHERE next_attempt_at <= NOW()
          AND (status IN ('queued', 'failed') OR (status = 'running' AND lease_until < NOW()))
        ORDER BY next_attempt_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      `;
      if (!job) return null;
      await transaction.cleanupJob.update({
        where: { id: job.id },
        data: { status: "running", attempts: { increment: 1 }, leaseUntil: new Date(Date.now() + 60_000) },
      });
      return { id: job.id, photoId: job.photo_id, attempts: job.attempts + 1 };
    });
  }

  async getCleanupObjects(photoId: string) {
    return this.prisma.storedObject.findMany({ where: { photoId }, select: { bucket: true, key: true } });
  }

  async completeCleanup(photoId: string) {
    await this.prisma.photo.deleteMany({ where: { id: photoId, status: "pending_delete" } });
  }

  async failCleanup(jobId: string, attempt: number, safeError: string) {
    const backoffMs = Math.min(60 * 60_000, 2 ** Math.min(attempt, 10) * 1000);
    await this.prisma.cleanupJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        leaseUntil: null,
        nextAttemptAt: new Date(Date.now() + backoffMs),
        lastError: safeError.slice(0, 200),
      },
    });
  }

  async editableSource(id: string, ownerId: string) {
    const photo = await this.prisma.photo.findFirst({ where: { id, ownerId, status: "ready" }, select: { id: true, originalBucket: true, originalKey: true, currentVersion: true, currentEdit: true } });
    if (!photo) return null;
    const variant = await this.prisma.photoVariant.findFirst({ where: { photoId: id, version: photo.currentVersion }, orderBy: { width: "asc" }, select: { width: true, height: true } });
    return { id: photo.id, originalBucket: photo.originalBucket, originalKey: photo.originalKey, currentVersion: photo.currentVersion, currentEdit: photo.currentEdit, width: variant?.width ?? 0, height: variant?.height ?? 0 };
  }

  async publishEditedVersion(id: string, ownerId: string, version: number, edit: { crop: { left: number; top: number; width: number; height: number }; rotation: number; flipX: boolean; flipY: boolean }, variants: Array<{ bucket: string; key: string; widthTarget: number; width: number; height: number; mimeType: string; bytes: number; checksum: string }>) {
    return this.prisma.$transaction(async (tx) => {
      const photo = await tx.photo.findFirst({ where: { id, ownerId, status: "ready" }, select: { currentVersion: true } });
      if (!photo || version !== photo.currentVersion + 1) return false;
      await tx.photoVariant.createMany({ data: variants.map((variant) => ({ photoId: id, version, ...variant, bytes: BigInt(variant.bytes) })) });
      await tx.storedObject.createMany({ data: variants.map((variant) => ({ photoId: id, bucket: variant.bucket, key: variant.key, kind: "variant" as const, uploadedAt: new Date() })) });
      await tx.photo.update({ where: { id }, data: { currentVersion: version, currentEdit: edit } });
      return true;
    });
  }

  async restoreOriginalVersion(id: string, ownerId: string) {
    return this.prisma.$transaction(async (tx) => {
      const photo = await tx.photo.findFirst({ where: { id, ownerId, status: "ready" }, select: { id: true } });
      const originalVariants = await tx.photoVariant.count({ where: { photoId: id, version: 1 } });
      if (!photo || originalVariants === 0) return false;
      await tx.photo.update({ where: { id }, data: { currentVersion: 1, currentEdit: Prisma.DbNull } });
      return true;
    });
  }
}

export class UnconfiguredPhotoRepository implements PhotoRepositoryContract {
  private unavailable(): never { throw new Error("Database persistence is not configured."); }
  async createPending(): Promise<void> { this.unavailable(); }
  async markObjectUploaded(): Promise<never> { return this.unavailable(); }
  async markReady(): Promise<never> { return this.unavailable(); }
  async scheduleCleanup(): Promise<never> { return this.unavailable(); }
  async beginDelete(): Promise<DeleteResult> { return this.unavailable(); }
  async claimCleanupJob(): Promise<null> { return this.unavailable(); }
  async getCleanupObjects(): Promise<Array<{ bucket: string; key: string }>> { return this.unavailable(); }
  async completeCleanup(): Promise<never> { return this.unavailable(); }
  async failCleanup(): Promise<never> { return this.unavailable(); }
  async editableSource(): Promise<null> { return this.unavailable(); }
  async publishEditedVersion(): Promise<boolean> { return this.unavailable(); }
  async restoreOriginalVersion(): Promise<boolean> { return this.unavailable(); }
}

export const checksum = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
