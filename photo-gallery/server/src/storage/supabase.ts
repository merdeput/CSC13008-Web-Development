import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { StorageAdapter, StoredObject } from "./adapter.js";
import { StorageUnavailableError } from "./adapter.js";

export class SupabaseStorageAdapter implements StorageAdapter {
  private readonly client: SupabaseClient;

  constructor(url?: string, secretKey?: string) {
    if (!url || !secretKey) throw new StorageUnavailableError();
    this.client = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async put(object: StoredObject): Promise<void> {
    const { error } = await this.client.storage.from(object.bucket).upload(object.key, object.bytes, {
      contentType: object.contentType,
      cacheControl: object.cacheControl,
      upsert: false,
    });
    if (error) throw new Error(error.message);
  }

  async delete(bucket: string, keys: string[]): Promise<void> {
    for (const key of keys) {
      const { error } = await this.client.storage.from(bucket).remove([key]);
      if (!error) continue;
      const details = error as typeof error & { statusCode?: string; error?: string };
      if (details.statusCode === "404" || details.error === "NotFound") continue;
      throw new Error("Supabase Storage delete failed.");
    }
  }

  async get(bucket: string, key: string): Promise<Buffer> {
    const { data, error } = await this.client.storage.from(bucket).download(key);
    if (error || !data) throw new Error("Supabase Storage read failed.");
    return Buffer.from(await data.arrayBuffer());
  }

  getUrl(bucket: string, key: string): string {
    const { data } = this.client.storage.from(bucket).getPublicUrl(key);
    return data.publicUrl;
  }
}
