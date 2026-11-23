export type StoredObject = {
  bucket: string;
  key: string;
  bytes: Buffer;
  contentType: string;
  cacheControl: string;
};

export interface StorageAdapter {
  put(object: StoredObject): Promise<void>;
  get(bucket: string, key: string): Promise<Buffer>;
  delete(bucket: string, keys: string[]): Promise<void>;
  getUrl(bucket: string, key: string): string;
}

export class StorageUnavailableError extends Error {
  constructor() {
    super("Storage is not configured yet.");
    this.name = "StorageUnavailableError";
  }
}

export class UnconfiguredStorageAdapter implements StorageAdapter {
  async put(): Promise<void> {
    throw new StorageUnavailableError();
  }
  async delete(): Promise<void> {
    throw new StorageUnavailableError();
  }
  async get(): Promise<never> { throw new StorageUnavailableError(); }
  getUrl(): string {
    throw new StorageUnavailableError();
  }
}

/** Test-only adapter. Never wire this adapter into the running application. */
export class MemoryStorageAdapter implements StorageAdapter {
  readonly objects = new Map<string, StoredObject>();

  async put(object: StoredObject): Promise<void> {
    const id = `${object.bucket}/${object.key}`;
    if (this.objects.has(id)) throw new Error("Object already exists");
    this.objects.set(id, object);
  }

  async delete(bucket: string, keys: string[]): Promise<void> {
    for (const key of keys) this.objects.delete(`${bucket}/${key}`);
  }
  async get(bucket: string, key: string): Promise<Buffer> {
    const object = this.objects.get(`${bucket}/${key}`);
    if (!object) throw new Error("Object not found.");
    return Buffer.from(object.bytes);
  }

  getUrl(bucket: string, key: string): string {
    return `https://test.invalid/${bucket}/${key}`;
  }
}
