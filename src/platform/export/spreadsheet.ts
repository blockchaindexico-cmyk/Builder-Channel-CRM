import ExcelJS from "exceljs";
import Papa from "papaparse";

/** Writing CSV/XLSX downloads (lead export M04-19, billing registers M09-14). Files are built on request. */
export const CSV_TYPE = "text/csv";
export const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

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
