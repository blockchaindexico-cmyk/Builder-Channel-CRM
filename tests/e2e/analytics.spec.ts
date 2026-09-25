import { type Browser, expect, type Page, test } from "@playwright/test";

import { type Persona, storageStateFor } from "./support/auth";

async function pageAs(browser: Browser, persona: Persona): Promise<Page> {
  const context = await browser.newContext({ storageState: storageStateFor(persona) });
  return context.newPage();
}

/** Dashboards, reports and exports (M10). */
test.describe("dashboards and reports", () => {
  test("each role lands on its own dashboard", async ({ browser }) => {
    const executive = await pageAs(browser, "executive");
    await executive.goto("/dashboard");
    await expect(executive.getByRole("heading", { level: 1, name: "My day" })).toBeVisible();
    await expect(executive.getByRole("button", { name: "Today", pressed: true })).toBeVisible();
    for (const label of [
      "Leads assigned",
      "Calls",
      "Follow-ups done",
      "Site visits",
      "Bookings",
      "Closed / won",
    ]) {
      await expect(executive.getByText(label, { exact: true }).first()).toBeVisible();
    }
    await expect(
      executive.locator('[data-slot="card-title"]', { hasText: /^Today$/ }),
    ).toBeVisible();
    await expect(
      executive.locator('[data-slot="card-title"]', { hasText: /^My team$/ }),
    ).toHaveCount(0);
    await executive.getByRole("button", { name: "This week" }).click();
    await expect(executive).toHaveURL(/period=this_week/);
    await expect(executive.getByRole("button", { name: "This week", pressed: true })).toBeVisible();

    const manager = await pageAs(browser, "manager");
    await manager.goto("/dashboard");
    await expect(manager.getByRole("heading", { level: 1, name: "Team dashboard" })).toBeVisible();
    await expect(
      manager.locator('[data-slot="card-title"]', { hasText: /^My team$/ }),
    ).toBeVisible();
    await expect(manager.getByRole("link", { name: "Rahul Executive" }).first()).toBeVisible();
    await expect(manager.getByText("Finance", { exact: true })).toHaveCount(0);

    const admin = await pageAs(browser, "admin");
    await admin.goto("/dashboard?period=last_30_days");
    await expect(admin.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    await expect(admin.getByText("Lead sources", { exact: true })).toBeVisible();
    await expect(admin.getByText("Finance", { exact: true })).toBeVisible();

    await admin.goto("/profile?tab=performance");
    await expect(
      admin.getByText("Your last 30 days, compared with the 30 days before."),
    ).toBeVisible();
  });

  test("reports: hub by role, filters, saved views and a CSV export", async ({ browser }) => {
    const manager = await pageAs(browser, "manager");
    await manager.goto("/reports");
    await expect(manager.getByRole("link", { name: /Executives & teams/ })).toBeVisible();
    await expect(manager.getByRole("link", { name: /Profit & loss/ })).toHaveCount(0);
    await manager.getByRole("link", { name: /Calling/ }).click();
    await expect(manager.getByRole("heading", { level: 1, name: "Calling" })).toBeVisible();
    await manager.getByRole("button", { name: "Last 30 days" }).click();
    await expect(manager).toHaveURL(/period=last_30_days/);
    await expect(manager.getByRole("columnheader", { name: "Connect %" })).toBeVisible();

    // Save the filters as a view and come back to them.
    await manager.getByRole("button", { name: "Views" }).click();
    await manager.getByRole("menuitem", { name: "Save the current filters…" }).click();
    const name = `Last month ${Date.now().toString().slice(-4)}`;
    await manager.getByLabel("Name").fill(name);
    await manager.getByRole("button", { name: "Save view" }).click();
    await expect(manager.getByText(`View "${name}" saved`)).toBeVisible();
    await manager.goto("/reports/calls");
    await manager.getByRole("button", { name: "Views" }).click();
    await manager.getByRole("link", { name }).click();
    await expect(manager).toHaveURL(/period=last_30_days/);

    const download = manager.waitForEvent("download");
    await manager.getByRole("link", { name: "CSV" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^calls-.*\.csv$/);

    const executive = await pageAs(browser, "executive");
    await executive.goto("/reports/calls");
    await expect(executive.getByRole("heading", { level: 1, name: "Calling" })).toBeVisible();
    await expect(executive.getByRole("link", { name: "CSV" })).toHaveCount(0);
    await executive.goto("/reports/exports");
    await expect(executive.getByText("You don't have access to this page")).toBeVisible();
    await executive.goto("/reports/profit-loss");
    await expect(executive.getByText("You don't have access to this page")).toBeVisible();
  });

  test("the lead database is exported in the background", async ({ browser }) => {
    const admin = await pageAs(browser, "admin");
    await admin.goto("/reports/leads?period=last_30_days");
    await expect(admin.getByRole("heading", { level: 1, name: "Lead database" })).toBeVisible();
    await admin.getByRole("link", { name: "Excel" }).click();
    await expect(admin).toHaveURL(/\/reports\/exports\?queued=/);
    await expect(admin.getByRole("status")).toContainText("being prepared");
    const row = admin.getByRole("row").filter({ hasText: "Lead database" }).first();
    await expect(async () => {
      await admin.reload();
      await expect(row).toContainText("Ready", { timeout: 2_000 });
    }).toPass({ timeout: 60_000 });
    const download = admin.waitForEvent("download");
    await row.getByRole("link", { name: "Download" }).click();
    expect((await download).suggestedFilename()).toMatch(/^leads-.*\.xlsx$/);
  });
});
