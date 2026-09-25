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

export {
  CSV_TYPE,
  csvSafe,
  writeCsv,
  writeXlsx,
  XLSX_TYPE,
  type XlsxColumn,
} from "@/platform/export/spreadsheet";

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
