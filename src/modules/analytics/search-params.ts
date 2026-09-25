import { parseAsInteger, parseAsString } from "nuqs/server";

/** URL parameters of report pages (M10-08); the export route reads the same ones. */
export const reportSearchParams = {
  period: parseAsString,
  from: parseAsString,
  to: parseAsString,
  by: parseAsString,
  executive: parseAsString,
  manager: parseAsString,
  builder: parseAsString,
  project: parseAsString,
  source: parseAsString,
  status: parseAsString,
  group: parseAsString,
  page: parseAsInteger,
};
