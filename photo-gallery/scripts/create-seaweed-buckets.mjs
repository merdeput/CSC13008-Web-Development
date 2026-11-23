import dotenv from "dotenv";
import { S3Client, CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";

dotenv.config({ quiet: true });
dotenv.config({ path: "seaweedfs/admin.env", quiet: true });
const { SEAWEED_S3_ENDPOINT, SEAWEED_S3_REGION = "us-east-1", SEAWEED_S3_ACCESS_KEY, SEAWEED_S3_SECRET_KEY } = process.env;
if (!SEAWEED_S3_ENDPOINT || !SEAWEED_S3_ACCESS_KEY || !SEAWEED_S3_SECRET_KEY) throw new Error("SeaweedFS credentials are missing from .env");
if (!process.env.SEAWEED_ADMIN_ACCESS_KEY || !process.env.SEAWEED_ADMIN_SECRET_KEY) throw new Error("Bootstrap credentials are missing from seaweedfs/admin.env");
const client = new S3Client({ endpoint: SEAWEED_S3_ENDPOINT, region: SEAWEED_S3_REGION, forcePathStyle: true, credentials: { accessKeyId: process.env.SEAWEED_ADMIN_ACCESS_KEY, secretAccessKey: process.env.SEAWEED_ADMIN_SECRET_KEY } });
for (const bucket of [process.env.ORIGINALS_BUCKET || "photo-originals", process.env.VARIANTS_BUCKET || "photo-variants"]) {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch (error) {
    if (![403, 404].includes(error?.$metadata?.httpStatusCode)) throw error;
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }
  console.log(`Ready: ${bucket}`);
}
