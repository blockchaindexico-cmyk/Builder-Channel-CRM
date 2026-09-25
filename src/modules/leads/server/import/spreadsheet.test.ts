import { describe, expect, it } from "vitest";

import { ValidationError } from "@/platform/errors";

import { csvSafe, readSheet, writeCsv, writeXlsx } from "./spreadsheet";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("readSheet", () => {
  it("reads CSV with a byte-order mark, quotes and blank lines", async () => {
    const sheet = await readSheet(
      bytes(
        '﻿Name,Mobile,Note\r\n"Sharma, Priya",+91 98200 12345,"said ""call me"""\r\n\r\n,,\r\nRavi,9820000001,\r\n',
      ),
    );
    expect(sheet.headers).toEqual(["Name", "Mobile", "Note"]);
    expect(sheet.rows).toEqual([
      ["Sharma, Priya", "+91 98200 12345", 'said "call me"'],
      ["Ravi", "9820000001", ""],
    ]);
  });

  it("detects semicolon separators and ANSI encoded files", async () => {
    const latin1 = Uint8Array.from([
      ...bytes("Name;City\n"),
      0x4a,
      0x6f,
      0x73,
      0xe9, // "José" in windows-1252
      ...bytes(";Pune\n"),
    ]);
    const sheet = await readSheet(latin1);
    expect(sheet.headers).toEqual(["Name", "City"]);
    expect(sheet.rows).toEqual([["José", "Pune"]]);
  });

  it("reads the first sheet of an XLSX file, numbers and dates as text", async () => {
    const file = await writeXlsx(
      "Leads",
      [{ header: "Name" }, { header: "Mobile" }, { header: "Budget" }],
      [
        ["Priya", 919820012345, 8500000],
        ["Ravi", "+91 98200 00001", null],
      ],
    );
    const sheet = await readSheet(file);
    expect(sheet.headers).toEqual(["Name", "Mobile", "Budget"]);
    expect(sheet.rows).toEqual([
      ["Priya", "919820012345", "8500000"],
      ["Ravi", "+91 98200 00001", ""],
    ]);
  });

  it("names blank headers and pads short rows", async () => {
    const sheet = await readSheet(bytes("Name,,City\nPriya,x\n"));
    expect(sheet.headers).toEqual(["Name", "Column 2", "City"]);
    expect(sheet.rows).toEqual([["Priya", "x", ""]]);
  });

  it("rejects empty files, header-only files and old .xls files", async () => {
    await expect(readSheet(bytes("\n\n"))).rejects.toBeInstanceOf(ValidationError);
    await expect(readSheet(bytes("Name,Mobile\n"))).rejects.toThrow(/no rows below the header/);
    await expect(readSheet(Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0, 0]))).rejects.toThrow(
      /\.xls files are not supported/,
    );
  });

  it("limits the number of rows", async () => {
    const csv = `Name\n${Array.from({ length: 10_001 }, (_, i) => `Lead ${i}`).join("\n")}`;
    await expect(readSheet(bytes(csv))).rejects.toThrow(/at most 10,000 rows/);
  });
});

describe("writing", () => {
  it("neutralises spreadsheet formulas but keeps phone numbers", () => {
    expect(csvSafe('=HYPERLINK("x")')).toBe('\'=HYPERLINK("x")');
    expect(csvSafe("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvSafe("+cmd|' /C calc'!A0")).toBe("'+cmd|' /C calc'!A0");
    expect(csvSafe("-2+3")).toBe("'-2+3");
    expect(csvSafe("+91 98200 12345")).toBe("+91 98200 12345");
    expect(csvSafe("Priya")).toBe("Priya");
  });

  it("writes CSV that reads back identically", async () => {
    const csv = writeCsv(
      ["Name", "Budget"],
      [
        ["Sharma, Priya", 8500000],
        ["=1+1", null],
      ],
    );
    expect(csv.startsWith("﻿")).toBe(true);
    const sheet = await readSheet(bytes(csv));
    expect(sheet.rows).toEqual([
      ["Sharma, Priya", "8500000"],
      ["'=1+1", ""],
    ]);
  });
});
