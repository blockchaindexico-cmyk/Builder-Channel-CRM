export interface StoredObjectInfo {
  size: number;
  contentType: string | null;
}

export interface PresignedUpload {
  url: string;
  method: "PUT";
  /** Headers the client must send with the upload request. */
  headers: Record<string, string>;
  expiresAt: string;
}

export interface DownloadUrlOptions {
  expiresInSeconds: number;
  fileName?: string;
  disposition?: "inline" | "attachment";
}

/** Object storage abstraction (M01-14). Implementations: S3-compatible and in-memory (tests). */
export interface StorageProvider {
  readonly driver: "s3" | "memory";
  /** Creates the bucket if needed and applies CORS rules for browser uploads. */
  ensureBucket(options: { corsOrigins: string[] }): Promise<void>;
  putObject(key: string, body: Uint8Array | string, contentType: string): Promise<void>;
  getObject(key: string): Promise<Uint8Array | null>;
  headObject(key: string): Promise<StoredObjectInfo | null>;
  deleteObject(key: string): Promise<void>;
  createUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds: number,
  ): Promise<PresignedUpload>;
  createDownloadUrl(key: string, options: DownloadUrlOptions): Promise<string>;
  /** Cheap connectivity check used by /api/health. */
  ping(): Promise<void>;
}
