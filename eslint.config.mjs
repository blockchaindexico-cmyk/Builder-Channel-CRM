import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";
import simpleImportSort from "eslint-plugin-simple-import-sort";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: { "simple-import-sort": simpleImportSort },
    rules: {
      "simple-import-sort/imports": "warn",
      "simple-import-sort/exports": "warn",
      "@typescript-eslint/consistent-type-imports": ["warn", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Tenancy rule T3 + module boundaries (BUILD_PLAN §2.2, §2.4).
    files: ["src/modules/**/*.{ts,tsx}", "src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/platform/db/client",
              message:
                "Feature code must not use the raw Prisma client. Use ctx.db (tenant-scoped) from the request context.",
            },
            {
              name: "@/generated/prisma/client",
              importNames: ["PrismaClient"],
              message: "Do not instantiate Prisma clients in feature code.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/modules/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/platform/db/client",
              message:
                "Feature code must not use the raw Prisma client. Use ctx.db (tenant-scoped) from the request context.",
            },
            {
              name: "@/generated/prisma/client",
              importNames: ["PrismaClient"],
              message: "Do not instantiate Prisma clients in feature code.",
            },
          ],
          patterns: [
            {
              group: ["@/modules/*/*", "!@/modules/*/index"],
              message:
                "Import other modules only through their public API (`@/modules/<name>`). Use relative imports inside a module.",
            },
          ],
        },
      ],
    },
  },
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "dist/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    "src/generated/**",
  ]),
]);

export default eslintConfig;
