import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/** Parses "true"/"false"/"1"/"0" environment strings into booleans. */
const booleanString = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

/**
 * Type-safe, validated environment variables (M01-05).
 * Server variables are only readable on the server; client variables must start with NEXT_PUBLIC_.
 * See `.env.example` for documentation of every variable.
 */
export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url().default("http://localhost:3000"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),

    DATABASE_URL: z.url(),
    /** Single-tenant mode: slug of the organization used until authentication (M02) resolves it. */
    DEFAULT_ORGANIZATION_SLUG: z.string().min(1).default("default"),

    STORAGE_DRIVER: z.enum(["s3", "memory"]).default("s3"),
    S3_ENDPOINT: z.url().optional(),
    /** Endpoint used in presigned URLs handed to browsers. Defaults to S3_ENDPOINT. */
    S3_PUBLIC_ENDPOINT: z.url().optional(),
    S3_REGION: z.string().min(1).default("us-east-1"),
    S3_BUCKET: z.string().min(1).default("crm-files"),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    S3_FORCE_PATH_STYLE: booleanString.default(true),

    EMAIL_TRANSPORT: z.enum(["smtp", "console", "memory"]).default("console"),
    EMAIL_FROM: z.string().min(3).default("Builder Channel CRM <no-reply@localhost>"),
    SMTP_HOST: z.string().min(1).default("localhost"),
    SMTP_PORT: z.coerce.number().int().positive().default(1025),
    SMTP_SECURE: booleanString.default(false),
    SMTP_USER: z.string().min(1).optional(),
    SMTP_PASSWORD: z.string().min(1).optional(),

    /** Signs session cookies and tokens. Generate with `openssl rand -base64 32`. */
    BETTER_AUTH_SECRET: z.string().min(32),
    /** Rate limiting of sign-in / password-reset endpoints (keep enabled outside local debugging). */
    AUTH_RATE_LIMIT_ENABLED: booleanString.default(true),

    JOBS_SCHEMA: z.string().min(1).default("pgboss"),
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(50).default(5),
  },
  client: {
    NEXT_PUBLIC_APP_NAME: z.string().min(1).default("Builder Channel CRM"),
  },
  experimental__runtimeEnv: {
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
  },
  skipValidation: Boolean(process.env.SKIP_ENV_VALIDATION),
  emptyStringAsUndefined: true,
});
