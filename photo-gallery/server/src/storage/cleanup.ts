import type { PhotoRepositoryContract } from "../db/photos.js";
import type { StorageAdapter } from "./adapter.js";

export class CleanupWorker {
  private running = false;

  constructor(private readonly repository: PhotoRepositoryContract, private readonly storage: StorageAdapter) {}

  async runOne(): Promise<boolean> {
    if (this.running) return false;
    this.running = true;
    try {
      const job = await this.repository.claimCleanupJob();
      if (!job) return false;
      try {
        const objects = await this.repository.getCleanupObjects(job.photoId);
        const buckets = [...new Set(objects.map((object) => object.bucket))];
        for (const bucket of buckets) {
          const keys = objects.filter((object) => object.bucket === bucket).map((object) => object.key);
          await this.storage.delete(bucket, keys);
        }
        await this.repository.completeCleanup(job.photoId);
      } catch {
        await this.repository.failCleanup(job.id, job.attempts, "Storage cleanup failed; will retry.");
      }
      return true;
    } finally {
      this.running = false;
    }
  }

  start(intervalMs = 5_000) {
    const timer = setInterval(() => void this.runOne().catch(() => undefined), intervalMs);
    timer.unref();
    return () => clearInterval(timer);
  }
}
