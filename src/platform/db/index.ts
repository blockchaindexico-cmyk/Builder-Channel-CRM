/**
 * Public database API for feature code. Exposes Prisma types/enums and the tenant-scoped client types —
 * but not the raw client (rule T3).
 */
export {
  createTenantDb,
  TENANT_MODELS,
  type TenantDb,
  type TenantDbOrTx,
  type TenantTx,
} from "./tenant-scope";
export { Prisma } from "@/generated/prisma/client";
export * from "@/generated/prisma/enums";
export type * from "@/generated/prisma/models";
