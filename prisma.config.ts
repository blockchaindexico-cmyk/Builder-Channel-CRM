import "dotenv/config";

import { defineConfig, env } from "prisma/config";

export default defineConfig({
  // Multi-file schema: one file per module (BUILD_PLAN §2.3).
  schema: "prisma/schema",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed/index.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
