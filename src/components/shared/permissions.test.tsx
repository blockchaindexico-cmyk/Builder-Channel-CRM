import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Can, PermissionsProvider } from "./permissions";

function renderWith(keys: string[], ui: ReactNode): string {
  return renderToStaticMarkup(
    <PermissionsProvider value={{ keys, scopes: {} }}>{ui}</PermissionsProvider>,
  );
}

describe("<Can>", () => {
  it("renders children only when the permission is held", () => {
    const html = renderWith(
      ["users.view"],
      <>
        <Can permission="users.view">visible</Can>
        <Can permission="users.manage" fallback={<span>fallback</span>}>
          hidden
        </Can>
      </>,
    );
    expect(html).toContain("visible");
    expect(html).not.toContain("hidden");
    expect(html).toContain("fallback");
  });

  it("supports anyOf and the wildcard", () => {
    expect(renderWith(["b"], <Can anyOf={["a", "b"]}>any</Can>)).toContain("any");
    expect(renderWith(["c"], <Can anyOf={["a", "b"]}>any</Can>)).toBe("");
    expect(renderWith(["*"], <Can permission="anything">wild</Can>)).toContain("wild");
  });
});
