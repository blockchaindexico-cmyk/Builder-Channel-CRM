import { expect, test } from "@playwright/test";

import { assignFreshClientIp, PASSWORD, signInAndWait, USERS } from "./support/auth";
import { linkFrom, waitForEmail } from "./support/mailpit";

// These tests manage their own sessions.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("authentication (M02-03 → M02-05)", () => {
  test("protects pages and returns to the requested page after signing in", async ({ page }) => {
    await page.goto("/settings/organization");
    await expect(page).toHaveURL(/\/login\?next=%2Fsettings%2Forganization/);

    await assignFreshClientIp(page);
    await page.getByLabel("E-mail").fill(USERS.admin.email);
    await page.getByLabel("Password").fill("definitely-wrong-1");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("The e-mail or password is incorrect.")).toBeVisible();

    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/settings\/organization$/);
  });

  test("signs out and ends the session", async ({ page }) => {
    await signInAndWait(page, USERS.manager.email);
    await page.getByRole("button", { name: "Open user menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login\?notice=signed-out/);
    await expect(page.getByText("You have been signed out.")).toBeVisible();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("API routes answer 401 without a session", async ({ request }) => {
    const response = await request.get("/api/private-probe");
    expect(response.status()).toBe(401);
  });

  test("resets a forgotten password through the e-mailed link (single use)", async ({ page }) => {
    const email = "esha@demo-realty.test";
    const since = new Date();
    await assignFreshClientIp(page);
    await page.goto("/forgot-password");
    await page.getByLabel("E-mail").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText(/If an account exists/)).toBeVisible();

    const mail = await waitForEmail(email, since);
    expect(mail.subject).toMatch(/password/i);
    const link = linkFrom(mail.text, "/reset-password");

    await page.goto(link);
    await page.getByLabel("New password", { exact: true }).fill("short");
    await page.getByLabel("Confirm password").fill("short");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByText(/At least 10 characters/).first()).toBeVisible();

    await page.getByLabel("New password", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Confirm password").fill(PASSWORD);
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page).toHaveURL(/\/login\?notice=password-set/);

    // The link cannot be used twice.
    await page.goto(link);
    await page.getByLabel("New password", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Confirm password").fill(PASSWORD);
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByText(/invalid or has expired/)).toBeVisible();

    await signInAndWait(page, email);
  });
});
