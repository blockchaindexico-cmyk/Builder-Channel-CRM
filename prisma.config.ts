import "dotenv/config";

import { defineConfig } from "prisma/config";

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  // Multi-file schema: one file per module (BUILD_PLAN §2.3).
  schema: "prisma/schema",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed/index.ts",
  },
  // Optional so `prisma generate` works without a database (e.g. Docker builds); migrate commands need it.
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
});
