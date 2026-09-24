import { describe, expect, it } from "vitest";

import { toTableQuery } from "./table-query";

describe("toTableQuery", () => {
  const sortable = ["createdAt", "name"];

  it("computes offsets and keeps whitelisted sorts", () => {
    expect(
      toTableQuery({ page: 3, pageSize: 50, sort: "name.asc", q: "  ravi " }, { sortable }),
    ).toEqual({
      page: 3,
      pageSize: 50,
      skip: 100,
      take: 50,
      sort: { field: "name", direction: "asc" },
      q: "ravi",
    });
  });

  it("rejects unknown sort fields, odd page sizes and negative pages", () => {
    const query = toTableQuery(
      { page: -4, pageSize: 999, sort: "password.desc", q: "" },
      { sortable, defaultSort: { field: "createdAt", direction: "desc" } },
    );
    expect(query).toMatchObject({
      page: 1,
      pageSize: 25,
      skip: 0,
      sort: { field: "createdAt", direction: "desc" },
    });
    expect(
      toTableQuery({ page: 1, pageSize: 25, sort: "name.sideways", q: "" }, { sortable }).sort,
    ).toBeNull();
  });
});
