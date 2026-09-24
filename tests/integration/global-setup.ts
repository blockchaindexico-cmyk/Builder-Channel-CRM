import { execSync } from "node:child_process";

import { Client } from "pg";

/**
 * Prepares the integration-test database (`TEST_DATABASE_URL`): applies migrations and empties all tables.
 * Tests create their own organizations, so they never depend on each other's data.
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set");

  execSync("pnpm exec prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
    );
    if (rows.length > 0) {
      const tables = rows.map((row) => `"public"."${row.tablename}"`).join(", ");
      await client.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
    }
    await client.query(`DROP SCHEMA IF EXISTS pgboss CASCADE`);
  } finally {
    await client.end();
  }
}
