import { expect, test } from "@playwright/test";

test.describe("smoke", () => {
  test("redirects the root to the dashboard and renders the app shell", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(nav.getByRole("link", { name: "Settings" })).toBeVisible();
  });

  test("sets security headers, CSP nonce and a request id", async ({ request }) => {
    const response = await request.get("/dashboard");
    expect(response.ok()).toBe(true);
    const headers = response.headers();
    expect(headers["x-request-id"]).toMatch(/[0-9a-f-]{36}/);
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["content-security-policy"]).toMatch(
      /script-src 'self' 'nonce-[^']+' 'strict-dynamic'/,
    );
    expect(headers["x-powered-by"]).toBeUndefined();
  });

  test("reports health of database, storage and worker", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.checks.database.status).toBe("ok");
    expect(["ok", "degraded"]).toContain(body.status);
  });

  test("shows a friendly 404 page", async ({ page }) => {
    const response = await page.goto("/this-page-does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.getByText("Page not found")).toBeVisible();
    await page.getByRole("link", { name: "Go to dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("loads pages without console errors", async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") problems.push(message.text());
    });
    page.on("pageerror", (error) => problems.push(error.message));
    const paths = [
      "/dashboard",
      "/settings",
      "/settings/organization",
      "/settings/system",
      // M02
      "/team",
      "/team?view=list",
      "/profile",
      "/profile?tab=security",
      "/settings/users",
      "/settings/roles",
      "/settings/audit-log",
      // M03
      "/projects",
      "/builders",
      "/projects/new",
      "/settings/catalog/property-types",
      "/settings/catalog/configuration-types",
      "/settings/catalog/amenities",
      // M04
      "/leads",
      "/leads?view=unassigned",
      "/leads/new",
      "/leads/duplicates",
      "/settings/leads/statuses",
      "/settings/leads/sources",
      "/settings/leads/campaigns",
      "/settings/leads/duplicates",
      "/leads/import",
      "/leads/import/new",
      "/settings/api-keys",
      // M05
      "/leads/unassigned",
      "/team/workload",
      "/settings/assignment/rules",
      "/settings/assignment/reasons",
      "/settings/assignment/options",
      // M06
      "/notifications",
      "/announcements",
      "/profile?tab=notifications",
      "/settings/notifications",
      "/settings/announcements",
      // M07
      "/agenda",
      "/calls",
      "/team/follow-ups",
      "/settings/activities/outcomes",
      "/settings/activities/purposes",
      "/settings/activities/options",
      // M08
      "/visits",
      "/visits?tab=calendar",
      "/visits?tab=team",
      "/bookings",
      "/agenda?tab=visits",
      "/settings/deals/outcomes",
      "/settings/deals/reasons",
      "/settings/deals/stages",
      "/settings/deals/options",
      // M09
      "/billing",
      "/billing/deals",
      "/billing/invoices",
      "/billing/invoices/new",
      "/billing/payments",
      "/billing/expenses",
      "/reports/profit-loss?by=executive",
      "/reports/lost-opportunities",
      "/settings/billing",
      "/settings/commission",
    ];
    for (const path of paths) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
    }
    expect(problems).toEqual([]);
  });
});
