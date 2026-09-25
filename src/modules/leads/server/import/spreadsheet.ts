import ExcelJS from "exceljs";
import Papa from "papaparse";

import { ValidationError } from "@/platform/errors";

import { MAX_IMPORT_ROWS } from "../../import-fields";

/**
 * Reading and writing CSV/XLSX files for lead import and export (M04-18, M04-19). Everything is handled as text:
 * cells are trimmed strings, the first non-empty row is the header.
 */
export interface Sheet {
  headers: string[];
  rows: string[][];
}

export const CSV_TYPE = "text/csv";
export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((byte, index) => bytes[index] === byte);
}

function decodeText(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // Excel on Windows saves "CSV" in the ANSI code page.
    text = new TextDecoder("windows-1252").decode(bytes);
  }
  return text.replace(/^﻿/, "");
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
    if ("error" in value) return "";
    if ("formula" in value || "sharedFormula" in value) {
      return cellText((value as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    }
    if ("text" in value) {
      const text = (value as ExcelJS.CellHyperlinkValue).text as unknown;
      return typeof text === "string" ? text : cellText(text as ExcelJS.CellValue);
    }
  }
  return "";
}

async function readXlsx(bytes: Uint8Array): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  } catch {
    throw new ValidationError("This Excel file could not be read. Save it again as .xlsx or .csv.");
  }
  const sheet =
    workbook.worksheets.find((worksheet) => worksheet.actualRowCount > 0) ?? workbook.worksheets[0];
  if (!sheet) return [];
  if (sheet.actualRowCount > MAX_IMPORT_ROWS + 1) throw tooManyRows(sheet.actualRowCount - 1);
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const cells: string[] = [];
    for (let column = 1; column <= row.cellCount; column += 1) {
      cells.push(cellText(row.getCell(column).value));
    }
    rows.push(cells);
  });
  return rows;
}

function readCsv(bytes: Uint8Array): string[][] {
  const result = Papa.parse<string[]>(decodeText(bytes), { skipEmptyLines: "greedy" });
  return result.data;
}

function tooManyRows(count: number) {
  return new ValidationError(
    `The file has ${count.toLocaleString("en-IN")} rows. Import at most ${MAX_IMPORT_ROWS.toLocaleString("en-IN")} rows at a time.`,
  );
}

/** Parses an uploaded CSV or XLSX file (detected from its content, not its name). */
export async function readSheet(bytes: Uint8Array): Promise<Sheet> {
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])) {
    throw new ValidationError("Old .xls files are not supported. Save the sheet as .xlsx or .csv.");
  }
  const raw = startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]) ? await readXlsx(bytes) : readCsv(bytes);
  const rows = raw
    .map((cells) => cells.map((cell) => (cell ?? "").toString().trim()))
    .filter((cells) => cells.some((cell) => cell !== ""));
  if (rows.length === 0) throw new ValidationError("The file is empty.");
  const [headerRow, ...dataRows] = rows;
  if (dataRows.length === 0) throw new ValidationError("The file has no rows below the header.");
  if (dataRows.length > MAX_IMPORT_ROWS) throw tooManyRows(dataRows.length);
  const width = Math.max(...rows.map((cells) => cells.length));
  const headers = Array.from(
    { length: width },
    (_, index) => headerRow![index] || `Column ${index + 1}`,
  );
  return {
    headers,
    rows: dataRows.map((cells) => Array.from({ length: width }, (_, index) => cells[index] ?? "")),
  };
}

/**
 * Spreadsheet programs run cells starting with =, +, -, @ as formulas ("CSV injection"). Such text gets a leading
 * apostrophe; phone numbers such as "+91 98200 12345" are left alone.
 */
export function csvSafe(value: string): string {
  if (/^[=@\t\r]/.test(value)) return `'${value}`;
  if (/^[+-]/.test(value) && !/^[+-][\d\s().-]*$/.test(value)) return `'${value}`;
  return value;
}

/** CSV with a byte-order mark so Excel opens UTF-8 (₹, names in Indian scripts) correctly. */
export function writeCsv(headers: string[], rows: (string | number | null)[][]): string {
  const safe = rows.map((cells) =>
    cells.map((cell) => (typeof cell === "string" ? csvSafe(cell) : (cell ?? ""))),
  );
  return `﻿${Papa.unparse({ fields: headers.map(csvSafe), data: safe }, { newline: "\r\n" })}`;
}

export interface XlsxColumn {
  header: string;
  width?: number;
  /** Excel number format for numeric columns, e.g. "#,##0". */
  numFmt?: string;
}

/** A one-sheet workbook with a bold, frozen header row. */
export async function writeXlsx(
  sheetName: string,
  columns: XlsxColumn[],
  rows: (string | number | null)[][],
): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Builder Channel CRM";
  const sheet = workbook.addWorksheet(sheetName, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = columns.map((column) => ({
    header: column.header,
    width: column.width ?? Math.min(40, Math.max(12, column.header.length + 4)),
    style: column.numFmt ? { numFmt: column.numFmt } : {},
  }));
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) sheet.addRow(row.map((cell) => cell ?? null));
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}
