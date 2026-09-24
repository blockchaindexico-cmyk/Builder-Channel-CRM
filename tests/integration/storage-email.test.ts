import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { renderEmail } from "@/platform/email";
import { TestEmail } from "@/platform/email/templates/test-email";
import { S3StorageProvider } from "@/platform/storage/s3";

/**
 * Talks to the real local services from docker-compose (RustFS on :9000, Mailpit on :1025/:8025).
 * Skipped automatically when they are not running (e.g. in a CI job without those services).
 */
const S3_ENDPOINT = process.env.S3_ENDPOINT ?? "http://localhost:9000";
const MAILPIT_API = process.env.MAILPIT_API ?? "http://localhost:8025/api/v1";

async function reachable(url: string): Promise<boolean> {
  try {
    await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return true;
  } catch {
    return false;
  }
}

const s3Available = await reachable(S3_ENDPOINT);
const mailpitAvailable = await reachable(`${MAILPIT_API}/info`);

describe.skipIf(!s3Available)("S3 storage provider against RustFS (M01-14)", () => {
  const bucket = `crm-test-${randomUUID().slice(0, 8)}`;
  const origin = "http://localhost:3000";
  let storage: S3StorageProvider;

  beforeAll(async () => {
    storage = new S3StorageProvider({
      endpoint: S3_ENDPOINT,
      publicEndpoint: S3_ENDPOINT,
      region: "us-east-1",
      bucket,
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "crm-access-key",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "crm-secret-key",
      forcePathStyle: true,
    });
    await storage.ensureBucket({ corsOrigins: [origin] });
  });

  it("puts, heads, gets and deletes objects", async () => {
    const key = `orgs/test/${randomUUID()}/hello.txt`;
    await storage.putObject(key, "hello world", "text/plain");
    expect(await storage.headObject(key)).toEqual({ size: 11, contentType: "text/plain" });
    expect(new TextDecoder().decode((await storage.getObject(key))!)).toBe("hello world");
    await storage.deleteObject(key);
    expect(await storage.headObject(key)).toBeNull();
    expect(await storage.getObject(key)).toBeNull();
  });

  it("accepts browser-style uploads through a presigned PUT URL", async () => {
    const key = `orgs/test/${randomUUID()}/logo.png`;
    const upload = await storage.createUploadUrl(key, "image/png", 300);
    const body = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const response = await fetch(upload.url, { method: "PUT", headers: upload.headers, body });
    expect(response.status).toBe(200);
    expect(await storage.headObject(key)).toEqual({ size: 8, contentType: "image/png" });

    const downloadUrl = await storage.createDownloadUrl(key, {
      expiresInSeconds: 60,
      fileName: "Company Logo.png",
      disposition: "attachment",
    });
    const download = await fetch(downloadUrl);
    expect(download.status).toBe(200);
    expect(download.headers.get("content-disposition")).toContain("attachment");
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(body);
  });

  it("rejects a presigned upload whose content type differs from the signed one", async () => {
    const key = `orgs/test/${randomUUID()}/evil.html`;
    const upload = await storage.createUploadUrl(key, "image/png", 300);
    const response = await fetch(upload.url, {
      method: "PUT",
      headers: { "Content-Type": "text/html" },
      body: "<script>alert(1)</script>",
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(await storage.headObject(key)).toBeNull();
  });

  it("answers CORS preflight requests from the app origin", async () => {
    const key = `orgs/test/${randomUUID()}/cors.txt`;
    const upload = await storage.createUploadUrl(key, "text/plain", 300);
    const preflight = await fetch(upload.url, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    expect(preflight.status).toBeLessThan(300);
    expect(preflight.headers.get("access-control-allow-origin")).toMatch(/localhost:3000|\*/);
  });
});

describe("e-mail rendering (M01-15)", () => {
  it("renders React Email templates to HTML and plain text", async () => {
    const { html, text } = await renderEmail(
      TestEmail({ organizationName: "Acme Realty", sentAt: "now" }),
    );
    expect(html).toContain("<html");
    expect(html).toContain("Acme Realty");
    expect(text.toLowerCase()).toContain("e-mail delivery works");
    expect(text).not.toContain("<");
  });
});

describe.skipIf(!mailpitAvailable)("SMTP delivery through Mailpit (M01-15)", () => {
  afterAll(async () => {
    await fetch(`${MAILPIT_API}/messages`, { method: "DELETE" }).catch(() => undefined);
  });

  it("delivers an e-mail over SMTP", async () => {
    const { default: nodemailer } = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: "localhost",
      port: 1025,
      secure: false,
    });
    const subject = `Integration ${randomUUID()}`;
    const { html, text } = await renderEmail(
      TestEmail({ organizationName: "Acme Realty", sentAt: "now" }),
    );
    await transporter.sendMail({
      from: "crm@test.local",
      to: "owner@test.local",
      subject,
      html,
      text,
    });

    let found = false;
    for (let attempt = 0; attempt < 20 && !found; attempt += 1) {
      const response = await fetch(
        `${MAILPIT_API}/search?query=${encodeURIComponent(`subject:"${subject}"`)}`,
      );
      const result = (await response.json()) as { messages_count: number };
      found = result.messages_count > 0;
      if (!found) await new Promise((resolve) => setTimeout(resolve, 250));
    }
    expect(found).toBe(true);
  });
});
