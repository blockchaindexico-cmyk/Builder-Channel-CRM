import path from "node:path";

import { expect, test } from "@playwright/test";

test.describe("organization settings (M01-24)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings/organization");
    await expect(
      page.getByRole("heading", { name: "Organization profile", level: 1 }),
    ).toBeVisible();
  });

  test("validates fields before saving", async ({ page }) => {
    const website = page.getByLabel("Website");
    await website.fill("not a url");
    await website.blur();
    await expect(page.getByText("Enter a valid URL")).toBeVisible();
    await page.getByLabel("Country code").fill("India");
    await page.getByLabel("Country code").blur();
    await expect(page.getByText("Use a 2-letter ISO country code")).toBeVisible();
  });

  test("saves the profile and keeps the values after reload", async ({ page }) => {
    const city = `Pune ${Date.now().toString().slice(-5)}`;
    await page.getByLabel("City").fill(city);
    await page.getByLabel("Website").fill("https://demo-realty.test");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Organization profile saved")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("City")).toHaveValue(city);

    // The change is recorded in the domain-event log.
    await page.goto("/settings/system");
    await expect(
      page.getByRole("cell", { name: "organization.settings_updated" }).first(),
    ).toBeVisible();
  });

  test("uploads and removes the logo", async ({ page }) => {
    await page
      .getByTestId("logo-input")
      .setInputFiles(path.join(__dirname, "fixtures", "logo.png"));
    await expect(page.getByText("Logo updated")).toBeVisible();
    const sidebarLogo = page.locator("aside img").first();
    await expect(sidebarLogo).toBeVisible();
    await expect
      .poll(() =>
        sidebarLogo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
      )
      .toBe(true);

    await page.getByRole("button", { name: "Remove" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove logo" }).click();
    await expect(page.getByText("Logo removed")).toBeVisible();
    await expect(page.locator("aside img")).toHaveCount(0);
  });

  test("queues a test e-mail", async ({ page }) => {
    await page.getByLabel("Send to").fill("e2e-owner@demo-realty.test");
    await page.getByRole("button", { name: "Send test e-mail" }).click();
    await expect(page.getByText("Test e-mail queued for e2e-owner@demo-realty.test")).toBeVisible();
  });
});
