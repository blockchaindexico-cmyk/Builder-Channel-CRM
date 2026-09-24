import { describe, expect, it } from "vitest";

import { buildObjectKey, sanitizeFileName } from "./files";
import { isAllowedContentType } from "./purposes";

describe("file naming", () => {
  it("sanitizes user supplied file names", () => {
    expect(sanitizeFileName("Brochure Final (v2).PDF")).toBe("Brochure-Final-v2.pdf");
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("C:\\Users\\me\\site plan.final.JPG")).toBe("site-plan.final.jpg");
    expect(sanitizeFileName(".env")).toBe("env");
    expect(sanitizeFileName("   ")).toBe("file");
    expect(sanitizeFileName("प्रोजेक्ट.png")).toMatch(/\.png$/);
    expect(sanitizeFileName(`${"a".repeat(300)}.jpeg`).length).toBeLessThanOrEqual(85);
  });

  it("builds tenant-prefixed object keys (T8)", () => {
    const key = buildObjectKey(
      "org-1",
      "lead.attachment",
      "Site Plan.pdf",
      new Date("2026-03-05T10:00:00Z"),
    );
    expect(key).toMatch(/^orgs\/org-1\/lead\/attachment\/2026\/03\/[0-9a-f-]{36}\/Site-Plan\.pdf$/);
  });
});

describe("isAllowedContentType", () => {
  const purpose = {
    key: "p",
    label: "p",
    maxBytes: 1,
    allowedTypes: ["image/*", "application/pdf"],
  };
  it("matches exact types and wildcards", () => {
    expect(isAllowedContentType(purpose, "image/png")).toBe(true);
    expect(isAllowedContentType(purpose, "application/pdf; charset=binary")).toBe(true);
    expect(isAllowedContentType(purpose, "text/html")).toBe(false);
    expect(isAllowedContentType(purpose, "imagex/png")).toBe(false);
  });
});
