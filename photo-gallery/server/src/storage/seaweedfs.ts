import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { StorageAdapter, StoredObject } from "./adapter.js";

export class SeaweedStorageAdapter implements StorageAdapter {
  private readonly client: S3Client;

  constructor(endpoint: string, private readonly publicUrl: string, region: string, accessKey: string, secretKey: string, private readonly variantsBucket: string) {
    this.client = new S3Client({ endpoint, region, forcePathStyle: true, credentials: { accessKeyId: accessKey, secretAccessKey: secretKey } });
  }

  async put(object: StoredObject): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: object.bucket, Key: object.key, Body: object.bytes,
      ContentType: object.contentType,
      CacheControl: object.bucket === this.variantsBucket ? `public, max-age=${object.cacheControl}, immutable` : `private, max-age=${object.cacheControl}`,
      IfNoneMatch: "*",
    }));
  }

  async delete(bucket: string, keys: string[]): Promise<void> {
    for (const key of keys) await this.client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  }

  async get(bucket: string, key: string): Promise<Buffer> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!result.Body) throw new Error("SeaweedFS object has no body.");
    return Buffer.from(await result.Body.transformToByteArray());
  }

  getUrl(bucket: string, key: string): string {
    if (bucket !== this.variantsBucket) throw new Error("Original image URLs are private.");
    return `${this.publicUrl.replace(/\/$/, "")}/${encodeURIComponent(bucket)}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }
}
