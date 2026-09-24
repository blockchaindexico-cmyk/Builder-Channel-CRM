import { env } from "@/config/env";

import { MemoryStorageProvider } from "./memory";
import type { StorageProvider } from "./provider";
import { S3StorageProvider } from "./s3";

export type {
  DownloadUrlOptions,
  PresignedUpload,
  StorageProvider,
  StoredObjectInfo,
} from "./provider";

const globalForStorage = globalThis as unknown as { __crmStorage?: StorageProvider };

function createStorage(): StorageProvider {
  if (env.STORAGE_DRIVER === "memory") {
    return new MemoryStorageProvider();
  }
  return new S3StorageProvider({
    endpoint: env.S3_ENDPOINT,
    publicEndpoint: env.S3_PUBLIC_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
  });
}

/** Process-wide storage provider selected by `STORAGE_DRIVER`. */
export function getStorage(): StorageProvider {
  globalForStorage.__crmStorage ??= createStorage();
  return globalForStorage.__crmStorage;
}

/** Test helper: replace the storage provider. */
export function setStorageForTesting(provider: StorageProvider | undefined): void {
  globalForStorage.__crmStorage = provider;
}
