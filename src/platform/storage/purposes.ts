import type { FileObject } from "@/generated/prisma/client";
import type { ServiceContext } from "@/platform/tenant/context";

/**
 * A kind of file the application stores (e.g. `organization.logo`, `lead.attachment`). Declared by modules in
 * their server manifest; defines limits and who may upload/read such files.
 */
export interface FilePurpose {
  key: string;
  label: string;
  maxBytes: number;
  /** Allowed MIME types; `image/*` style wildcards are supported. */
  allowedTypes: readonly string[];
  /** Permission required to upload. Omit to allow any member of the organization. */
  uploadPermission?: string;
  /** Extra read authorization beyond tenant membership. Default: any member of the organization. */
  canRead?: (ctx: ServiceContext, file: FileObject) => boolean | Promise<boolean>;
}

export function isAllowedContentType(purpose: FilePurpose, contentType: string): boolean {
  const normalized = contentType.toLowerCase().split(";")[0]?.trim() ?? "";
  return purpose.allowedTypes.some((allowed) => {
    if (allowed.endsWith("/*")) return normalized.startsWith(allowed.slice(0, -1));
    return normalized === allowed;
  });
}

export const MB = 1024 * 1024;
