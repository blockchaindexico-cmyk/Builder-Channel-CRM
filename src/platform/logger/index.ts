import { createRequire } from "node:module";

import pino, { type DestinationStream, type Logger as PinoLogger } from "pino";

import { env } from "@/config/env";

export type Logger = PinoLogger;

function createDevStream(): DestinationStream | undefined {
  if (env.NODE_ENV !== "development") return undefined;
  try {
    // pino-pretty is a dev dependency: load it lazily so production builds never require it.
    const require = createRequire(import.meta.url);
    const pretty = require("pino-pretty") as (
      options: Record<string, unknown>,
    ) => DestinationStream;
    return pretty({
      colorize: true,
      translateTime: "SYS:HH:MM:ss",
      ignore: "pid,hostname,service",
    });
  } catch {
    return undefined;
  }
}

function createLogger(): Logger {
  return pino(
    {
      level: env.LOG_LEVEL,
      base: { service: process.env.SERVICE_NAME ?? "web" },
      timestamp: pino.stdTimeFunctions.isoTime,
      redact: {
        paths: [
          "password",
          "*.password",
          "token",
          "*.token",
          "secret",
          "*.secret",
          "authorization",
          "*.authorization",
          "cookie",
          "*.cookie",
        ],
        censor: "[redacted]",
      },
    },
    createDevStream(),
  );
}

const globalForLogger = globalThis as unknown as { __crmLogger?: Logger };

/** Structured application logger (M01-17). Use `logger.child({ requestId })` to correlate entries. */
export const logger: Logger = globalForLogger.__crmLogger ?? createLogger();
globalForLogger.__crmLogger = logger;
