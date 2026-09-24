/**
 * Development/bootstrap seed (idempotent). Run with `pnpm db:seed`.
 * Creates the default organization and its settings; later modules add their own seed steps here.
 */
import { env } from "@/config/env";
import { prisma } from "@/platform/db/client";
import { getStorage } from "@/platform/storage";

async function seedOrganization() {
  const slug = process.env.SEED_ORGANIZATION_SLUG ?? env.DEFAULT_ORGANIZATION_SLUG;
  const name = process.env.SEED_ORGANIZATION_NAME ?? "Demo Realty Partners";

  const organization = await prisma.organization.upsert({
    where: { slug },
    create: { slug, name },
    update: {},
  });
  await prisma.organizationSetting.upsert({
    where: { organizationId: organization.id },
    create: { organizationId: organization.id },
    update: {},
  });
  console.log(`✔ organization "${organization.name}" (${organization.slug}) — ${organization.id}`);
  return organization;
}

async function ensureStorage() {
  if (env.STORAGE_DRIVER !== "s3") return;
  try {
    await getStorage().ensureBucket({ corsOrigins: [env.APP_URL] });
    console.log(`✔ storage bucket "${env.S3_BUCKET}" ready`);
  } catch (error) {
    console.warn(`⚠ could not prepare storage bucket: ${(error as Error).message}`);
  }
}

async function main() {
  await seedOrganization();
  await ensureStorage();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
