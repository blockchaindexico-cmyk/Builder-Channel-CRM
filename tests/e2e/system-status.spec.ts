import { expect, test } from "@playwright/test";

test.describe("system status (M01-17, M01-22)", () => {
  test("shows service health", async ({ page }) => {
    await page.goto("/settings/system");
    await expect(page.getByRole("heading", { name: "System status", level: 1 })).toBeVisible();
    await expect(page.getByText("Database", { exact: true })).toBeVisible();
    await expect(page.getByText("File storage", { exact: true })).toBeVisible();
    await expect(page.getByText("Background worker", { exact: true })).toBeVisible();
    await expect(page.getByText("Operational").first()).toBeVisible();
  });

  test("filters the event log through the URL", async ({ page }) => {
    await page.goto("/settings/system");
    const search = page.getByLabel("Search", { exact: true });
    await search.fill("no-such-event-xyz");
    await expect(page.getByText("No events yet")).toBeVisible();
    await expect(page).toHaveURL(/q=no-such-event-xyz/);

    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(page).not.toHaveURL(/q=/);

    await page.getByRole("button", { name: "Sort by Occurred" }).click();
    await expect(page).toHaveURL(/sort=occurredAt\.asc/);

    await page.getByRole("button", { name: "Any date" }).click();
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(page).toHaveURL(/from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/);
  });
});
