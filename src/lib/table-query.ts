/** Normalized paging/sorting/search for server-side lists (shared by pages and services). */
export const PAGE_SIZES = [10, 25, 50, 100] as const;

export interface TableQuery {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
  sort: { field: string; direction: "asc" | "desc" } | null;
  q: string;
}

/**
 * Clamps page/pageSize and accepts only whitelisted sort fields (never pass raw user input to `orderBy`).
 */
export function toTableQuery(
  params: { page: number; pageSize: number; sort: string; q: string },
  options: { sortable: readonly string[]; defaultSort?: TableQuery["sort"] },
): TableQuery {
  const pageSize = (PAGE_SIZES as readonly number[]).includes(params.pageSize)
    ? params.pageSize
    : 25;
  const page = Math.max(1, Math.min(Math.trunc(params.page) || 1, 10_000));
  let sort: TableQuery["sort"] = options.defaultSort ?? null;
  const [field, direction] = params.sort.split(".");
  if (field && options.sortable.includes(field) && (direction === "asc" || direction === "desc")) {
    sort = { field, direction };
  }
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
    sort,
    q: params.q.trim().slice(0, 100),
  };
}
