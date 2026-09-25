/** Fiscal years (invoice numbering, volume slabs). `startMonth` 4 = April (India), 1 = calendar year. */
export interface FiscalYear {
  /** "2026-27", or "2026" for calendar years. */
  label: string;
  /** First and last day, yyyy-MM-dd. */
  start: string;
  end: string;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** The fiscal year a calendar date (yyyy-MM-dd) falls in. */
export function fiscalYearOf(date: string, startMonth = 4): FiscalYear {
  const [year, month] = date.split("-").map(Number) as [number, number];
  if (startMonth === 1)
    return { label: String(year), start: `${year}-01-01`, end: `${year}-12-31` };
  const first = month >= startMonth ? year : year - 1;
  const endMonth = startMonth - 1;
  const lastDay = new Date(Date.UTC(first + 1, endMonth, 0)).getUTCDate();
  return {
    label: `${first}-${String(first + 1).slice(-2)}`,
    start: `${first}-${pad(startMonth)}-01`,
    end: `${first + 1}-${pad(endMonth)}-${pad(lastDay)}`,
  };
}
