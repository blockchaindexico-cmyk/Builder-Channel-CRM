import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy, storageOriginsFromEnv } from "./csp";

describe("content security policy", () => {
  it("locks scripts to the nonce and allows the storage origin", () => {
    const csp = buildContentSecurityPolicy({
      nonce: "abc",
      isDev: false,
      storageOrigins: ["https://files.example.com"],
      upgradeInsecureRequests: true,
    });
    expect(csp).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).toContain("img-src 'self' blob: data: https://files.example.com");
    expect(csp).toContain("connect-src 'self' https://files.example.com");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("allows eval and websockets only in development, and no upgrade over plain http", () => {
    const csp = buildContentSecurityPolicy({ nonce: "n", isDev: true });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).toContain("ws:");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });

  it("derives storage origins from the environment", () => {
    expect(storageOriginsFromEnv({ S3_PUBLIC_ENDPOINT: "http://localhost:9000/x" })).toEqual([
      "http://localhost:9000",
    ]);
    expect(storageOriginsFromEnv({ S3_BUCKET: "crm", S3_REGION: "ap-south-1" })).toEqual([
      "https://crm.s3.ap-south-1.amazonaws.com",
    ]);
    expect(storageOriginsFromEnv({ STORAGE_DRIVER: "memory", S3_ENDPOINT: "http://x" })).toEqual(
      [],
    );
  });
});
