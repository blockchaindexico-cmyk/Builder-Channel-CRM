import { createLoader, parseAsInteger, parseAsString } from "nuqs/server";

export { PAGE_SIZES, type TableQuery, toTableQuery } from "@/lib/table-query";

/**
 * URL state shared by every server-side paginated list (M01-22): `?page=2&pageSize=25&sort=createdAt.desc&q=…`.
 * Pages add their own filter parsers next to these.
 */
export const tableSearchParams = {
  page: parseAsInteger.withDefault(1),
  pageSize: parseAsInteger.withDefault(25),
  sort: parseAsString.withDefault(""),
  q: parseAsString.withDefault(""),
};

export const loadTableSearchParams = createLoader(tableSearchParams);
