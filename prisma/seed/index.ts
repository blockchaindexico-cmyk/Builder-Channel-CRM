/**
 * Bootstrap/development seed (idempotent). Run with `pnpm db:seed` — also after every release, because it
 * syncs system-role permissions for new modules.
 *
 * 1. Default organization + settings.
 * 2. System roles (admin, manager, executive) with default permissions, and the default catalogue masters
 *    (property types, configurations, amenities) for every organization.
 * 3. First administrator from SEED_ADMIN_* (M02-19).
 * 4. Demo manager, executives, builders and projects when SEED_DEMO_USERS=true (never in production).
 */
import { env } from "@/config/env";
import { seedCatalogMasters } from "@/modules/catalog/server/masters";
import { syncSystemRoles } from "@/modules/identity/server/roles";
import { seedLeadMasters } from "@/modules/leads/server/masters";
import { auth } from "@/platform/auth/auth";
import { prisma } from "@/platform/db/client";
import { createTenantDb } from "@/platform/db/tenant-scope";
import { getStorage } from "@/platform/storage";

import { seedDemoCatalog } from "./demo-catalog";

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
  console.log(`✔ organization "${organization.name}" (${organization.slug})`);
  return organization;
}

async function syncRolesForAllOrganizations() {
  const organizations = await prisma.organization.findMany({ select: { id: true, slug: true } });
  for (const organization of organizations) {
    const db = createTenantDb(organization.id);
    await syncSystemRoles(db, organization.id);
    await seedCatalogMasters(db, organization.id);
    await seedLeadMasters(db, organization.id);
  }
  console.log(
    `✔ system roles, catalogue and lead masters synced for ${organizations.length} organization(s)`,
  );
}

async function ensureUser(input: {
  organizationId: string;
  name: string;
  email: string;
  password: string;
  roleKey: string;
  reportsToId?: string | null;
  designation?: string;
  employeeCode?: string;
  phone?: string;
}) {
  const email = input.email.toLowerCase();
  const role = await prisma.role.findUniqueOrThrow({
    where: { organizationId_key: { organizationId: input.organizationId, key: input.roleKey } },
  });

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: { name: input.name, email, emailVerified: true, phone: input.phone ?? null },
    });
    const context = await auth.$context;
    await prisma.account.create({
      data: {
        userId: user.id,
        providerId: "credential",
        accountId: user.id,
        password: await context.password.hash(input.password),
      },
    });
  }

  const existing = await prisma.membership.findUnique({
    where: { organizationId_userId: { organizationId: input.organizationId, userId: user.id } },
  });
  if (existing) return existing;
  return prisma.membership.create({
    data: {
      organizationId: input.organizationId,
      userId: user.id,
      roleId: role.id,
      reportsToId: input.reportsToId ?? null,
      designation: input.designation ?? null,
      employeeCode: input.employeeCode ?? null,
      status: "ACTIVE",
      joinedAt: new Date(),
    },
  });
}

async function seedUsers(organizationId: string) {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    console.log(
      "ℹ SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — skipping the first administrator",
    );
    return;
  }
  const admin = await ensureUser({
    organizationId,
    name: process.env.SEED_ADMIN_NAME ?? "Administrator",
    email,
    password,
    roleKey: "admin",
    designation: "Director",
    employeeCode: "EMP-001",
  });
  console.log(`✔ admin ${email}`);

  if (process.env.SEED_DEMO_USERS !== "true" || env.NODE_ENV === "production") return;
  const manager = await ensureUser({
    organizationId,
    name: "Meera Manager",
    email: "manager@demo-realty.test",
    password,
    roleKey: "manager",
    reportsToId: admin.id,
    designation: "Sales Manager",
    employeeCode: "EMP-002",
    phone: "+919820000002",
  });
  await ensureUser({
    organizationId,
    name: "Esha Executive",
    email: "esha@demo-realty.test",
    password,
    roleKey: "executive",
    reportsToId: manager.id,
    designation: "Sales Executive",
    employeeCode: "EMP-003",
    phone: "+919820000003",
  });
  await ensureUser({
    organizationId,
    name: "Rahul Executive",
    email: "rahul@demo-realty.test",
    password,
    roleKey: "executive",
    reportsToId: manager.id,
    designation: "Sales Executive",
    employeeCode: "EMP-004",
    phone: "+919820000004",
  });
  console.log("✔ demo users: manager@, esha@, rahul@demo-realty.test (same password as the admin)");
  if (await seedDemoCatalog(organizationId)) console.log("✔ demo builders and projects");
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
  const organization = await seedOrganization();
  await syncRolesForAllOrganizations();
  await seedUsers(organization.id);
  await ensureStorage();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
