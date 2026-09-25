import { describe, expect, it } from "vitest";

import { normalizeHeader, suggestImportMapping } from "./import-fields";

describe("import column matching", () => {
  it("normalizes headers", () => {
    expect(normalizeHeader("  E-mail Address ")).toBe("e mail address");
    expect(normalizeHeader("Mobile No.")).toBe("mobile no");
  });

  it("matches common header names to lead fields, each column once", () => {
    const mapping = suggestImportMapping([
      "Customer Name",
      "Phone Number",
      "Email ID",
      "Lead Source",
      "Budget",
      "BHK",
      "Project",
      "Remarks",
      "Something else",
    ]);
    expect(mapping).toEqual({
      name: 0,
      mobile: 1,
      email: 2,
      source: 3,
      budgetMax: 4,
      configurations: 5,
      projects: 6,
      note: 7,
    });
  });

  it("maps the CRM's own export back to the same fields", () => {
    const mapping = suggestImportMapping([
      "Lead number",
      "Name",
      "Mobile",
      "Alternate mobile",
      "E-mail",
      "Owner",
      "Owner e-mail",
      "Budget from",
      "Budget up to",
      "Projects of interest",
    ]);
    expect(mapping).toMatchObject({
      name: 1,
      mobile: 2,
      alternateMobile: 3,
      email: 4,
      owner: 6,
      budgetMin: 7,
      budgetMax: 8,
      projects: 9,
    });
  });
});
