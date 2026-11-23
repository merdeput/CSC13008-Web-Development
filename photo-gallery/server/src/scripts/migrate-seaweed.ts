import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createPrismaClient } from "../db/prisma.js";
import { loadConfig } from "../config.js";

dotenv.config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });
const config = loadConfig();
if (!config.supabaseUrl || !config.supabaseServerKey || !config.seaweed) throw new Error("Both Supabase Storage and SeaweedFS credentials are required for migration.");
const copy = process.argv.includes("--copy");
const retireSource = process.argv.includes("--retire-supabase-source");
if (copy && retireSource) throw new Error("Copy and source retirement must be separate runs.");
const prisma = createPrismaClient(config.databaseUrl);
const supabase = createClient(config.supabaseUrl, config.supabaseServerKey, { auth: { persistSession: false } });
const s3 = new S3Client({ endpoint: config.seaweed.endpoint, region: config.seaweed.region, forcePathStyle: true, credentials: { accessKeyId: config.seaweed.accessKey, secretAccessKey: config.seaweed.secretKey } });
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
type Entry = { bucket: string; key: string; checksum: string; contentType: string; cacheControl: string };

async function targetBytes(entry: Entry): Promise<Buffer | null> {
  try {
    const result = await s3.send(new GetObjectCommand({ Bucket: entry.bucket, Key: entry.key }));
    return result.Body ? Buffer.from(await result.Body.transformToByteArray()) : null;
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
}

try {
  const photos = await prisma.photo.findMany({
    where: { status: "ready" },
    select: { id: true, originalBucket: true, originalKey: true, originalChecksum: true, originalMimeType: true,
      variants: { select: { bucket: true, key: true, checksum: true, mimeType: true } } },
  });
  const pending = await prisma.photo.count({ where: { status: { not: "ready" } } });
  if (pending) console.log(`Non-ready photo rows excluded from cutover audit: ${pending}`);
  const entries: Entry[] = photos.flatMap((photo) => [
    { bucket: photo.originalBucket, key: photo.originalKey, checksum: photo.originalChecksum, contentType: photo.originalMimeType, cacheControl: "private, max-age=3600" },
    ...photo.variants.map((variant) => ({ bucket: variant.bucket, key: variant.key, checksum: variant.checksum, contentType: variant.mimeType, cacheControl: "public, max-age=31536000, immutable" })),
  ]);
  const byBucket = Object.fromEntries([config.originalsBucket, config.variantsBucket].map((bucket) => [bucket, entries.filter((entry) => entry.bucket === bucket).length]));
  let verified = 0; let copied = 0; let missing = 0; let failed = 0;
  for (const entry of entries) {
    try {
      const existing = await targetBytes(entry);
      if (existing) {
        if (hash(existing) !== entry.checksum) throw new Error("SeaweedFS checksum mismatch");
        verified++; continue;
      }
      if (!copy) { missing++; continue; }
      const { data, error } = await supabase.storage.from(entry.bucket).download(entry.key);
      if (error || !data) throw new Error(error?.message ?? "Supabase object missing");
      const bytes = Buffer.from(await data.arrayBuffer());
      if (hash(bytes) !== entry.checksum) throw new Error("Supabase checksum mismatch");
      await s3.send(new PutObjectCommand({ Bucket: entry.bucket, Key: entry.key, Body: bytes, ContentType: entry.contentType, CacheControl: entry.cacheControl }));
      if (hash((await targetBytes(entry)) ?? Buffer.alloc(0)) !== entry.checksum) throw new Error("Copied object checksum mismatch");
      copied++;
    } catch (error) {
      failed++;
      console.error(`${entry.bucket}/${entry.key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log(JSON.stringify({ photos: photos.length, objects: entries.length, byBucket, nonReadyPhotos: pending, verified, copied, missing, failed, mode: copy ? "copy" : "audit" }));
  if (failed || (copy && missing)) process.exitCode = 1;
  if (retireSource) {
    if (config.storageBackend !== "seaweedfs" || pending || failed || missing || verified !== entries.length) {
      throw new Error("Source retirement requires SeaweedFS cutover, no non-ready photos, and a complete checksum audit.");
    }
    for (const bucket of [config.originalsBucket, config.variantsBucket]) {
      const keys = entries.filter((entry) => entry.bucket === bucket).map((entry) => entry.key);
      for (let offset = 0; offset < keys.length; offset += 100) {
        const { error } = await supabase.storage.from(bucket).remove(keys.slice(offset, offset + 100));
        if (error) throw new Error(`Could not retire ${bucket}: ${error.message}`);
      }
      console.log(`Retired ${keys.length} source objects from ${bucket}`);
    }
  }
} finally {
  await prisma.$disconnect();
  s3.destroy();
}
