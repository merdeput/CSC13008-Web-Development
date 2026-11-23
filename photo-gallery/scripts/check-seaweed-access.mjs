import dotenv from "dotenv";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";

dotenv.config();
const endpoint = process.env.SEAWEED_S3_ENDPOINT;
const client = new S3Client({ endpoint, region: process.env.SEAWEED_S3_REGION || "us-east-1", forcePathStyle: true, credentials: { accessKeyId: process.env.SEAWEED_S3_ACCESS_KEY, secretAccessKey: process.env.SEAWEED_S3_SECRET_KEY } });
const key = `checks/${randomUUID()}.txt`;
const buckets = [process.env.ORIGINALS_BUCKET || "photo-originals", process.env.VARIANTS_BUCKET || "photo-variants"];
try {
  for (const bucket of buckets) await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: "storage access check", ContentType: "text/plain" }));
  const base = (process.env.SEAWEED_PUBLIC_URL || endpoint).replace(/\/$/, "");
  const [original, variant, list, write] = await Promise.all([
    fetch(`${base}/${buckets[0]}/${key}`),
    fetch(`${base}/${buckets[1]}/${key}`),
    fetch(`${base}/${buckets[1]}?list-type=2`),
    fetch(`${base}/${buckets[1]}/checks/anonymous-write.txt`, { method: "PUT", body: "denied" }),
  ]);
  if (original.status !== 403 || variant.status !== 200 || list.status !== 403 || write.status !== 403) {
    throw new Error(`Access check failed: original=${original.status}, variant=${variant.status}, list=${list.status}, write=${write.status}`);
  }
  console.log("SeaweedFS access check passed: private originals; public variant GET; no anonymous list or write.");
} finally {
  for (const bucket of buckets) await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
