import type {
  DownloadUrlOptions,
  PresignedUpload,
  StorageProvider,
  StoredObjectInfo,
} from "./provider";

/** In-memory storage for unit tests. Presigned URLs use a fake `memory://` scheme. */
export class MemoryStorageProvider implements StorageProvider {
  readonly driver = "memory" as const;
  readonly objects = new Map<string, { body: Uint8Array; contentType: string }>();

  async ensureBucket(): Promise<void> {}

  async putObject(key: string, body: Uint8Array | string, contentType: string): Promise<void> {
    const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
    this.objects.set(key, { body: bytes, contentType });
  }

  async getObject(key: string): Promise<Uint8Array | null> {
    return this.objects.get(key)?.body ?? null;
  }

  async headObject(key: string): Promise<StoredObjectInfo | null> {
    const object = this.objects.get(key);
    return object ? { size: object.body.byteLength, contentType: object.contentType } : null;
  }

  async deleteObject(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async createUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds: number,
  ): Promise<PresignedUpload> {
    return {
      url: `memory://upload/${encodeURIComponent(key)}`,
      method: "PUT",
      headers: { "Content-Type": contentType },
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    };
  }

  async createDownloadUrl(key: string, options: DownloadUrlOptions): Promise<string> {
    return `memory://download/${encodeURIComponent(key)}?disposition=${options.disposition ?? "attachment"}`;
  }

  async ping(): Promise<void> {}
}
