import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { UnconfiguredStorageAdapter } from "./storage/adapter.js";
import { createPrismaClient } from "./db/prisma.js";
import { PhotoRepository } from "./db/photos.js";
import { SupabaseStorageAdapter } from "./storage/supabase.js";
import { SeaweedStorageAdapter } from "./storage/seaweedfs.js";
import { CleanupWorker } from "./storage/cleanup.js";
import { GalleryRepository } from "./db/gallery.js";
import { UserRepository } from "./db/users.js";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

const config = loadConfig();
console.log(`Storage backend: ${config.storageBackend}`);
const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 5 });
const prisma = createPrismaClient(config.databaseUrl);
const repository = new PhotoRepository(prisma);
const users = new UserRepository(prisma);
const gallery = new GalleryRepository(prisma, (bucket, key) => storage.getUrl(bucket, key));
const storage = config.storageBackend === "seaweedfs" && config.seaweed
  ? new SeaweedStorageAdapter(config.seaweed.endpoint, config.seaweed.publicUrl, config.seaweed.region, config.seaweed.accessKey, config.seaweed.secretKey, config.variantsBucket)
  : config.supabaseUrl && config.supabaseServerKey
    ? new SupabaseStorageAdapter(config.supabaseUrl, config.supabaseServerKey)
    : new UnconfiguredStorageAdapter();
const app = createApp(pool, {
  storage,
  repository,
  users,
  secureCookies: process.env.NODE_ENV === "production",
  originalsBucket: config.originalsBucket,
  variantsBucket: config.variantsBucket,
  gallery,
});
const cleanupWorker = new CleanupWorker(repository, storage);
const stopCleanupWorker = cleanupWorker.start();
const server = app.listen(config.port, () => {
  console.log(`API listening on port ${config.port}`);
});

function shutdown() {
  stopCleanupWorker();
  server.close(() => void pool.end().finally(() => process.exit(0)));
  void prisma.$disconnect();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
