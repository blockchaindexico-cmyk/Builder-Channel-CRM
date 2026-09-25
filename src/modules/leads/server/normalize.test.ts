import { describe, expect, it } from "vitest";

import { leadNumberSearch, mobileSearchDigits, normalizeEmail, normalizeMobile } from "./normalize";

describe("lead contact normalization", () => {
  it("normalizes mobiles to E.164 with the organization's country", () => {
    expect(normalizeMobile("98200 12345", "IN")).toBe("+919820012345");
    expect(normalizeMobile("+91-98200-12345", "IN")).toBe("+919820012345");
    expect(normalizeMobile("098200 12345", "IN")).toBe("+919820012345");
    expect(normalizeMobile("(212) 555-0142", "US")).toBe("+12125550142");
  });

  it("keeps digits of numbers that do not parse and ignores empty values", () => {
    expect(normalizeMobile("555-0000", "IN")).toBe("5550000");
    expect(normalizeMobile("12", "IN")).toBeNull();
    expect(normalizeMobile("  ", "IN")).toBeNull();
  });

  it("lower-cases e-mails", () => {
    expect(normalizeEmail("  Priya@Example.COM ")).toBe("priya@example.com");
    expect(normalizeEmail("")).toBeNull();
  });

  it("recognises phone-like and lead-number searches", () => {
    expect(mobileSearchDigits("+91 98200-12345")).toBe("9820012345");
    expect(mobileSearchDigits("098200 12345")).toBe("9820012345");
    expect(mobileSearchDigits("12345")).toBe("12345");
    expect(mobileSearchDigits("priya")).toBeNull();
    expect(mobileSearchDigits("12")).toBeNull();
    expect(leadNumberSearch("LD-000123")).toBe("123");
    expect(leadNumberSearch("ld123")).toBe("123");
    expect(leadNumberSearch("123")).toBe("123");
    expect(leadNumberSearch("Priya")).toBeNull();
  });
});
