import { describe, expect, it, vi } from "vitest";
import { CleanupWorker } from "./cleanup.js";

describe("CleanupWorker", () => {
  it("deletes all expected keys and finalizes the metadata cleanup", async () => {
    const repository = {
      claimCleanupJob: vi.fn().mockResolvedValue({ id: "job-1", photoId: "photo-1", attempts: 1 }),
      getCleanupObjects: vi.fn().mockResolvedValue([
        { bucket: "photo-originals", key: "original.jpg" },
        { bucket: "photo-variants", key: "variant.jpg" },
      ]),
      completeCleanup: vi.fn().mockResolvedValue(undefined),
      failCleanup: vi.fn(),
    };
    const storage = { delete: vi.fn().mockResolvedValue(undefined) };
    const worker = new CleanupWorker(repository as never, storage as never);
    await expect(worker.runOne()).resolves.toBe(true);
    expect(storage.delete).toHaveBeenCalledTimes(2);
    expect(repository.completeCleanup).toHaveBeenCalledWith("photo-1");
    expect(repository.failCleanup).not.toHaveBeenCalled();
  });

  it("keeps the job retryable when object removal fails", async () => {
    const repository = {
      claimCleanupJob: vi.fn().mockResolvedValue({ id: "job-2", photoId: "photo-2", attempts: 3 }),
      getCleanupObjects: vi.fn().mockResolvedValue([{ bucket: "photo-originals", key: "original.jpg" }]),
      completeCleanup: vi.fn(),
      failCleanup: vi.fn().mockResolvedValue(undefined),
    };
    const storage = { delete: vi.fn().mockRejectedValue(new Error("provider details are private")) };
    const worker = new CleanupWorker(repository as never, storage as never);
    await expect(worker.runOne()).resolves.toBe(true);
    expect(repository.failCleanup).toHaveBeenCalledWith("job-2", 3, "Storage cleanup failed; will retry.");
    expect(repository.completeCleanup).not.toHaveBeenCalled();
  });
});
