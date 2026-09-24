import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type {
  DownloadUrlOptions,
  PresignedUpload,
  StorageProvider,
  StoredObjectInfo,
} from "./provider";

export interface S3StorageConfig {
  endpoint?: string;
  publicEndpoint?: string;
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle: boolean;
}

function isNotFound(error: unknown): boolean {
  if (error instanceof S3ServiceException) {
    return (
      error.$metadata.httpStatusCode === 404 ||
      error.name === "NotFound" ||
      error.name === "NoSuchKey"
    );
  }
  return false;
}

function contentDisposition(fileName: string | undefined, disposition: "inline" | "attachment") {
  if (!fileName) return disposition;
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export class S3StorageProvider implements StorageProvider {
  readonly driver = "s3" as const;
  private readonly client: S3Client;
  /** Signs URLs with the browser-reachable endpoint (host is part of the signature). */
  private readonly signingClient: S3Client;
  private readonly bucket: string;

  constructor(config: S3StorageConfig) {
    const base: S3ClientConfig = {
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      // Presigned URLs must not carry SDK-computed checksums (breaks browser uploads and S3-compatible stores).
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      credentials:
        config.accessKeyId && config.secretAccessKey
          ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
          : undefined,
    };
    this.client = new S3Client({ ...base, endpoint: config.endpoint });
    this.signingClient = new S3Client({
      ...base,
      endpoint: config.publicEndpoint ?? config.endpoint,
    });
    this.bucket = config.bucket;
  }

  async ensureBucket({ corsOrigins }: { corsOrigins: string[] }): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      if (
        !isNotFound(error) &&
        !(error instanceof S3ServiceException && error.$metadata.httpStatusCode === 403)
      ) {
        throw error;
      }
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
    if (corsOrigins.length > 0) {
      await this.client.send(
        new PutBucketCorsCommand({
          Bucket: this.bucket,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedOrigins: corsOrigins,
                AllowedMethods: ["GET", "PUT", "HEAD"],
                AllowedHeaders: ["*"],
                ExposeHeaders: ["ETag"],
                MaxAgeSeconds: 3600,
              },
            ],
          },
        }),
      );
    }
  }

  async putObject(key: string, body: Uint8Array | string, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async getObject(key: string): Promise<Uint8Array | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return result.Body ? await result.Body.transformToByteArray() : new Uint8Array();
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async headObject(key: string): Promise<StoredObjectInfo | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return { size: result.ContentLength ?? 0, contentType: result.ContentType ?? null };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async createUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds: number,
  ): Promise<PresignedUpload> {
    const url = await getSignedUrl(
      this.signingClient,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      { expiresIn: expiresInSeconds, signableHeaders: new Set(["content-type"]) },
    );
    return {
      url,
      method: "PUT",
      headers: { "Content-Type": contentType },
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    };
  }

  async createDownloadUrl(key: string, options: DownloadUrlOptions): Promise<string> {
    return getSignedUrl(
      this.signingClient,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: contentDisposition(
          options.fileName,
          options.disposition ?? "attachment",
        ),
      }),
      { expiresIn: options.expiresInSeconds },
    );
  }

  async ping(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }
}
