import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { SeaweedStorageAdapter } from "../server/dist/storage/seaweedfs.js";

dotenv.config({ quiet: true });
const variantBucket = process.env.VARIANTS_BUCKET || "photo-variants";
const adapter = new SeaweedStorageAdapter(process.env.SEAWEED_S3_ENDPOINT, process.env.SEAWEED_PUBLIC_URL, process.env.SEAWEED_S3_REGION || "us-east-1", process.env.SEAWEED_S3_ACCESS_KEY, process.env.SEAWEED_S3_SECRET_KEY, variantBucket);
const key = `checks/${randomUUID()}.txt`;
try {
  await adapter.put({ bucket: variantBucket, key, bytes: Buffer.from("SeaweedFS adapter check"), contentType: "text/plain", cacheControl: "31536000" });
  const response = await fetch(adapter.getUrl(variantBucket, key));
  if (!response.ok || response.headers.get("content-type") !== "text/plain" || !response.headers.get("cache-control")?.includes("31536000")) {
    throw new Error(`Variant delivery failed: HTTP ${response.status}, type=${response.headers.get("content-type")}, cache=${response.headers.get("cache-control")}`);
  }
  console.log("SeaweedFS adapter write and public headers passed.");
} finally {
  await adapter.delete(variantBucket, [key]);
}
