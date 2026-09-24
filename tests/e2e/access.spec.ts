import { expect, test } from "@playwright/test";

import { storageStateFor } from "./support/auth";

/** Role-based navigation and page access (M02-07, M02-20). */
test.describe("executive", () => {
  test.use({ storageState: storageStateFor("executive") });

  test("sees only their workspace and is refused admin pages", async ({ page }) => {
    await page.goto("/dashboard");
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "My team" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "Settings" })).toHaveCount(0);

    for (const path of ["/team", "/settings", "/settings/users", "/settings/audit-log"]) {
      await page.goto(path);
      await expect(page.getByText("You don't have access to this page")).toBeVisible();
    }
  });

  test("can open and edit their own profile", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "My profile", level: 1 })).toBeVisible();
    await expect(page.getByText("Managed by your administrator.")).toBeVisible();
    await expect(page.getByLabel("E-mail")).toBeDisabled();
    await page.getByRole("tab", { name: "Security" }).click();
    await expect(page).toHaveURL(/tab=security/);
    await expect(page.getByText("This device")).toBeVisible();
  });
});

test.describe("manager", () => {
  test.use({ storageState: storageStateFor("manager") });

  test("sees their own reporting tree, read-only", async ({ page }) => {
    await page.goto("/dashboard");
    const nav = page.getByRole("navigation", { name: "Main" });
    await expect(nav.getByRole("link", { name: "My team" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Settings" })).toHaveCount(0);

    await nav.getByRole("link", { name: "My team" }).click();
    const tree = page.getByRole("list", { name: "Reporting structure" });
    await expect(tree.getByText("Meera Manager")).toBeVisible();
    await expect(tree.getByText("Rahul Executive")).toBeVisible();
    // Their own manager (the admin) is outside the team.
    await expect(tree.getByText("Asha Admin")).toHaveCount(0);
    // Read-only: no links to user administration.
    await expect(tree.getByRole("link")).toHaveCount(0);

    await page.goto("/settings/users");
    await expect(page.getByText("You don't have access to this page")).toBeVisible();
  });
});

test.describe("admin", () => {
  test("sees administration and the whole organization", async ({ page }) => {
    await page.goto("/settings");
    const main = page.locator("#main-content");
    // Hub cards contributed by the identity module (title + description).
    for (const card of [
      /^Users.*Invite people/,
      /^Roles & permissions.*Decide what/,
      /^Audit log.*Who changed/,
    ]) {
      await expect(main.getByRole("link", { name: card })).toBeVisible();
    }
    await page.goto("/team");
    await expect(
      page.getByRole("list", { name: "Reporting structure" }).getByText("Asha Admin"),
    ).toBeVisible();
  });
});
