import { expect, test } from "@playwright/test";

import { signIn, signInAndWait } from "./support/auth";
import { linkFrom, waitForEmail } from "./support/mailpit";

/** User lifecycle (M02-10 → M02-13, M02-20): invite → accept → sign in → deactivate → blocked. */
test.describe("user management", () => {
  test("invites a user who sets a password; deactivation blocks them immediately", async ({
    page,
    browser,
  }) => {
    const suffix = Date.now().toString(36);
    const name = `Kiran E2E ${suffix}`;
    const email = `kiran.${suffix}@demo-realty.test`;
    const password = `Kiran-${suffix}-2026`;
    const since = new Date();

    // Admin invites.
    await page.goto("/settings/users");
    await page.getByRole("button", { name: "Invite user" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Full name").fill(name);
    await dialog.getByLabel("E-mail").fill(email);
    await dialog.getByRole("combobox", { name: "Reports to" }).click();
    await page.getByRole("option", { name: /Meera Manager/ }).click();
    await dialog.getByRole("button", { name: "Invite user" }).click();
    await expect(page.getByText(`Invitation sent to ${email}`)).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
    await expect(page.getByText("Invited", { exact: true }).first()).toBeVisible();
    const detailUrl = page.url();

    // The invitee accepts from the e-mail.
    const invitee = await browser.newPage({ storageState: { cookies: [], origins: [] } });
    const mail = await waitForEmail(email, since);
    expect(mail.subject).toContain("invited");
    await invitee.goto(linkFrom(mail.text, "/reset-password"));
    await expect(invitee.getByText("Set up your account")).toBeVisible();
    await invitee.getByLabel("New password", { exact: true }).fill(password);
    await invitee.getByLabel("Confirm password").fill(password);
    await invitee.getByRole("button", { name: "Activate account" }).click();
    await expect(invitee).toHaveURL(/\/login\?notice=password-set/);
    await signInAndWait(invitee, email, password);

    // Now active in the admin's view; the change history is on the detail page.
    await page.reload();
    await expect(page.getByText("Active", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Accepted the invitation and set a password")).toBeVisible();

    // Admin deactivates → the invitee's session ends and sign-in is refused.
    await page.getByRole("button", { name: "Deactivate", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Deactivate" }).click();
    await expect(page.getByText(`${name} has been deactivated`)).toBeVisible();

    await invitee.goto("/dashboard");
    await expect(invitee).toHaveURL(/\/login/);
    await signIn(invitee, email, password);
    await expect(
      invitee.getByText("Your account is not active. Please contact your administrator."),
    ).toBeVisible();

    // The audit log records who did what.
    await page.goto("/settings/audit-log");
    await page.getByPlaceholder("Search summary, action or person…").fill(name);
    await expect(page.getByRole("button", { name: `Deactivated ${name}` })).toBeVisible();
    await expect(page.getByRole("button", { name: new RegExp(`Invited ${name}`) })).toBeVisible();
    expect(detailUrl).toMatch(/\/settings\/users\/[0-9a-f-]{36}$/);
    await invitee.close();
  });
});
