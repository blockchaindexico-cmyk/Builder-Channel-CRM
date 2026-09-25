import { type Browser, expect, type Page, test } from "@playwright/test";

import { type Persona, storageStateFor, USERS } from "./support/auth";
import { linkFrom, waitForEmail } from "./support/mailpit";

async function pageAs(browser: Browser, persona: Persona): Promise<Page> {
  const context = await browser.newContext({ storageState: storageStateFor(persona) });
  return context.newPage();
}

/** Notifications & reminders engine (M06-14): bell, e-mail, center, preferences, settings, announcements. */
test.describe("notifications", () => {
  test("a new owner hears about their lead in the bell and by e-mail", async ({
    page,
    browser,
  }) => {
    const digits = `${Date.now()}`.slice(-5);
    const name = `E2E Bell ${digits}`;
    const since = new Date();
    await page.goto("/leads/new");
    await page.getByLabel("Full name", { exact: true }).fill(name);
    await page.getByLabel("Mobile", { exact: true }).fill(`95${digits}111`);
    await page.getByRole("combobox", { name: "Assign to" }).click();
    await page.getByRole("option", { name: /Rahul Executive/ }).click();
    await page.getByRole("button", { name: "Create lead" }).click();
    await expect(page).toHaveURL(/\/leads\/[0-9a-f-]{36}$/);
    const leadPath = new URL(page.url()).pathname;

    const email = await waitForEmail(USERS.executive.email, since);
    expect(email.subject).toMatch(new RegExp(`^New lead: LD-\\d+ · ${name}$`));
    expect(email.text).toContain("Assigned by Asha Admin.");
    expect(linkFrom(email.text, "/leads/")).toBe(leadPath);

    const rahul = await pageAs(browser, "executive");
    await rahul.goto("/dashboard");
    const bell = rahul.getByRole("button", { name: /^Notifications, \d+ unread$/ });
    await bell.click();
    await rahul
      .getByRole("list", { name: "Latest notifications" })
      .getByRole("button", { name: new RegExp(`New lead: LD-\\d+ · ${name}`) })
      .click();
    await expect(rahul).toHaveURL(new RegExp(`${leadPath}$`));

    // Marking on the notification page keeps the bell in step.
    await rahul.goto("/notifications");
    await rahul
      .getByRole("list", { name: "Notifications" })
      .getByRole("listitem")
      .filter({ hasText: name })
      .getByRole("button", { name: /^Mark as unread/ })
      .click();
    await expect(rahul.getByRole("link", { name: /^Unread \([1-9]\d*\)$/ })).toBeVisible();
    await expect(
      rahul.getByRole("button", { name: /^Notifications, [1-9]\d* unread$/ }),
    ).toBeVisible();
    await rahul.getByRole("link", { name: /^Unread/ }).click();
    await expect(rahul).toHaveURL(/view=unread/);
    await rahul.getByRole("button", { name: "Mark all read" }).click();
    await expect(rahul.getByText("All caught up")).toBeVisible();
    await expect(rahul.getByText("No unread notifications")).toBeVisible();
    await expect(rahul.getByRole("button", { name: "Notifications", exact: true })).toBeVisible();
  });

  test("the manager of the new owner hears about it too", async ({ page, browser }) => {
    const digits = `${Date.now()}`.slice(-5);
    const name = `E2E Team ${digits}`;
    await page.goto("/leads/new");
    await page.getByLabel("Full name", { exact: true }).fill(name);
    await page.getByLabel("Mobile", { exact: true }).fill(`95${digits}222`);
    await page.getByRole("combobox", { name: "Assign to" }).click();
    await page.getByRole("option", { name: /Esha Executive/ }).click();
    await page.getByRole("button", { name: "Create lead" }).click();
    await expect(page).toHaveURL(/\/leads\/[0-9a-f-]{36}$/);

    const manager = await pageAs(browser, "manager");
    await expect(async () => {
      await manager.goto("/notifications?category=Team");
      await expect(
        manager
          .getByRole("list", { name: "Notifications" })
          .getByText(new RegExp(`${name} assigned to Esha Executive`)),
      ).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });

    await manager.goto("/profile?tab=notifications");
    await expect(manager.getByRole("switch", { name: "Daily summary by e-mail" })).toBeVisible();
    for (const path of ["/settings/notifications", "/settings/announcements"]) {
      await manager.goto(path);
      await expect(manager.getByText("You don't have access to this page")).toBeVisible();
    }
  });

  test("admins choose what is sent and when the daily summary goes out", async ({ page }) => {
    await page.goto("/settings/notifications");
    await expect(
      page.getByRole("switch", { name: "Send “A lead is assigned to me”" }),
    ).toBeDisabled();
    await page.getByLabel("Daily summary time").fill("08:15");
    await page.getByRole("button", { name: "Save notification settings" }).click();
    await expect(page.getByText("Notification settings saved")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Daily summary time")).toHaveValue("08:15");
    await page.getByLabel("Daily summary time").fill("08:30");
    await page.getByRole("button", { name: "Save notification settings" }).click();
    await expect(page.getByText("Notification settings saved")).toBeVisible();
  });

  test("announcements show as a banner for their audience until dismissed", async ({
    page,
    browser,
  }) => {
    const title = `E2E News ${`${Date.now()}`.slice(-5)}`;
    await page.goto("/settings/announcements");
    await page.getByRole("button", { name: "New announcement" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Title").fill(title);
    await dialog.getByLabel("Message").fill("The site office moves to Tower B from Monday.");
    await dialog.getByRole("combobox", { name: "Who sees it" }).click();
    await page.getByRole("option", { name: "Some roles" }).click();
    await dialog.getByRole("checkbox", { name: "Executive" }).click();
    await dialog.getByRole("button", { name: "Publish" }).click();
    await expect(
      page.getByText(`"${title}" is live — its audience has been notified`),
    ).toBeVisible();
    const row = page.getByRole("row", { name: new RegExp(title) });
    await expect(row).toContainText("Live");
    await expect(row).toContainText(/0 of \d+/);

    const rahul = await pageAs(browser, "executive");
    await rahul.goto("/dashboard");
    const banner = rahul.getByRole("region", { name: `Announcement: ${title}` });
    await expect(banner).toContainText("The site office moves to Tower B from Monday.");
    await banner.getByRole("button", { name: `Dismiss “${title}”` }).click();
    await expect(banner).toHaveCount(0);
    await rahul.goto("/announcements");
    await expect(rahul.getByText(title)).toBeVisible();

    const manager = await pageAs(browser, "manager");
    await manager.goto("/dashboard");
    await expect(manager.getByRole("region", { name: `Announcement: ${title}` })).toHaveCount(0);

    await expect(async () => {
      await page.reload();
      await expect(page.getByRole("row", { name: new RegExp(title) })).toContainText(/1 of \d+/, {
        timeout: 1_000,
      });
    }).toPass({ timeout: 15_000 });
    await page.getByRole("button", { name: `Delete ${title}` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText(`"${title}" deleted`)).toBeVisible();
  });

  test.describe("as an executive", () => {
    test.use({ storageState: storageStateFor("executive") });

    test("chooses how to be told; essential notifications keep one way", async ({ page }) => {
      await page.goto("/profile?tab=notifications");
      const reset = page.getByRole("button", { name: "Reset to defaults" });
      if (await reset.isVisible()) {
        await reset.click();
        await expect(page.getByText("Back to your organization's defaults")).toBeVisible();
      }
      // Team notifications cannot reach an executive.
      await expect(page.getByText("Daily summary")).toHaveCount(0);
      const inApp = page.getByRole("switch", { name: "A lead is assigned to me in the app" });
      const email = page.getByRole("switch", { name: "A lead is assigned to me by e-mail" });
      await expect(inApp).toBeChecked();
      await expect(email).toBeChecked();

      await email.click();
      await expect(page.getByText("A lead is assigned to me: off by e-mail")).toBeVisible();
      await expect(email).not.toBeChecked();
      await expect(inApp).toBeDisabled();

      await page.reload();
      await expect(email).not.toBeChecked();
      await email.click();
      await expect(page.getByText("A lead is assigned to me: on by e-mail")).toBeVisible();
      await expect(inApp).toBeEnabled();
    });
  });
});
