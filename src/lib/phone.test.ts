import { describe, expect, it } from "vitest";

import { formatPhone, normalizePhone } from "./phone";

describe("phone numbers", () => {
  it("normalizes local and international input to E.164", () => {
    expect(normalizePhone("98200 12345", "IN")).toBe("+919820012345");
    expect(normalizePhone("+91-98200-12345", "IN")).toBe("+919820012345");
    expect(normalizePhone("098200 12345", "IN")).toBe("+919820012345");
    expect(normalizePhone("(212) 555-0123", "US")).toBe("+12125550123");
    expect(normalizePhone("12345", "IN")).toBeNull();
    expect(normalizePhone("", "IN")).toBeNull();
  });

  it("formats stored numbers for display", () => {
    expect(formatPhone("+919820012345")).toBe("+91 98200 12345");
    expect(formatPhone(null)).toBe("—");
  });
});
