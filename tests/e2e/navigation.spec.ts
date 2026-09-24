import { expect, test } from "@playwright/test";

test.describe("navigation", () => {
  test("uses the slide-over menu on tablets and the sidebar on desktop", async ({
    page,
  }, testInfo) => {
    await page.goto("/settings");
    const viewportWidth = page.viewportSize()?.width ?? 0;

    if (viewportWidth < 1024) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      const menu = page.getByRole("dialog");
      await menu.getByRole("link", { name: "Dashboard" }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(page.getByRole("dialog")).toHaveCount(0);
    } else {
      await page.getByRole("button", { name: "Collapse sidebar" }).click();
      await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
      await page.reload();
      // The collapsed state survives reloads (cookie).
      await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
      await page.getByRole("button", { name: "Expand sidebar" }).click();
    }
    testInfo.annotations.push({ type: "viewport", description: String(viewportWidth) });
  });

  test("settings hub lists the sections contributed by modules", async ({ page }) => {
    await page.goto("/settings");
    const main = page.locator("#main-content");
    // Section cards (title + description) come from the organization and core module manifests.
    await expect(
      main.getByRole("link", { name: /Organization profile.*Company details/ }),
    ).toBeVisible();
    await expect(
      main.getByRole("link", { name: /System status.*Health of the database/ }),
    ).toBeVisible();
  });
});
