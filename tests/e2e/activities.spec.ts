import { type Browser, expect, type Page, test } from "@playwright/test";

import { type Persona, storageStateFor } from "./support/auth";

async function pageAs(browser: Browser, persona: Persona): Promise<Page> {
  const context = await browser.newContext({ storageState: storageStateFor(persona) });
  return context.newPage();
}

/** Creates a lead as the executive (who then owns it) and opens it. */
async function createOwnLead(page: Page, name: string, mobile: string) {
  await page.goto("/leads/new");
  await page.getByLabel("Full name", { exact: true }).fill(name);
  await page.getByLabel("Mobile", { exact: true }).fill(mobile);
  await page.getByRole("button", { name: "Create lead" }).click();
  await expect(page).toHaveURL(/\/leads\/[0-9a-f-]{36}$/);
  await expect(page.getByText(/Owner: Rahul Executive/)).toBeVisible();
}

/** Calls, follow-ups & callbacks (M07-19). */
test.describe("calls and follow-ups", () => {
  test.describe("as an executive", () => {
    test.use({ storageState: storageStateFor("executive") });

    test("logs a call, its status and the next follow-up in one step", async ({ page }) => {
      const digits = `${Date.now()}`.slice(-5);
      const name = `E2E Caller ${digits}`;
      await createOwnLead(page, name, `93${digits}777`);

      // An unanswered call keeps the status.
      await page.getByRole("button", { name: "Log call" }).click();
      let dialog = page.getByRole("dialog");
      await dialog.getByRole("radio", { name: "No answer" }).check();
      await expect(dialog.getByRole("combobox", { name: "Lead status" })).toContainText("Keep");
      await dialog.getByRole("button", { name: "Save call" }).click();
      await expect(page.getByText("Call logged", { exact: true })).toBeVisible();

      // Reached and interested: status Positive and a follow-up are pre-selected.
      await page.getByRole("button", { name: "Log call" }).click();
      dialog = page.getByRole("dialog");
      await dialog.getByRole("radio", { name: "Interested", exact: true }).check();
      await expect(dialog.getByRole("combobox", { name: "Lead status" })).toContainText("Positive");
      await expect(dialog.getByRole("radio", { name: "Follow-up", exact: true })).toBeChecked();
      await dialog.getByLabel("Minutes").fill("2");
      await dialog.getByLabel("Notes", { exact: true }).fill("Wants the price list for 2 BHK");
      await dialog.getByRole("button", { name: "Save call" }).click();
      await expect(dialog.getByText("Choose when")).toBeVisible();
      await dialog.getByRole("button", { name: "Tomorrow 10 AM" }).click();
      await dialog.getByRole("button", { name: "Save call" }).click();
      await expect(page.getByText(/^Call logged · status: Positive · follow-up /)).toBeVisible();

      await page.reload();
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Positive");
      await page.getByRole("tab", { name: "Calls" }).click();
      const calls = page.getByRole("list", { name: "Calls" });
      await expect(calls.getByRole("listitem")).toHaveCount(2);
      await expect(calls.getByRole("listitem").first()).toContainText("Interested");
      await expect(calls.getByRole("listitem").first()).toContainText(
        "Wants the price list for 2 BHK",
      );
      await page.getByRole("tab", { name: "Follow-ups" }).click();
      const followUps = page.getByRole("list", { name: "Follow-ups and callbacks" });
      await expect(followUps.getByRole("listitem")).toHaveCount(1);
      await expect(followUps.getByRole("listitem").first()).toContainText("Scheduled");

      // Move it, then find it in the agenda and mark it done there.
      await followUps.getByRole("button", { name: /^Move/ }).click();
      dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: "In 3 days" }).click();
      await dialog.getByRole("button", { name: "Move", exact: true }).click();
      await expect(page.getByText(/^Moved to /)).toBeVisible();

      await page.goto("/agenda");
      await page.getByRole("tab", { name: /^Upcoming/ }).click();
      const item = page
        .getByRole("list", { name: "Upcoming" })
        .getByRole("listitem")
        .filter({ hasText: name });
      await expect(item).toHaveCount(1);
      await item.getByRole("button", { name: /^Done/ }).click();
      dialog = page.getByRole("dialog");
      await dialog.getByLabel("What happened?").fill("Sent the price list on WhatsApp");
      await dialog.getByRole("button", { name: "Mark done" }).click();
      await expect(page.getByText("Follow-up done", { exact: true })).toBeVisible();
      await expect(
        page
          .getByRole("list", { name: "Upcoming" })
          .getByRole("listitem")
          .filter({ hasText: name }),
      ).toHaveCount(0);
    });

    test("schedules a callback that the lead list can filter by", async ({ page }) => {
      const digits = `${Date.now()}`.slice(-5);
      const name = `E2E Callback ${digits}`;
      await createOwnLead(page, name, `93${digits}888`);
      await page.getByRole("button", { name: "Schedule follow-up" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("radio", { name: "Callback requested by the customer" }).check();
      await dialog.getByRole("button", { name: "In 1 hour" }).click();
      await dialog.getByRole("combobox", { name: "Purpose" }).click();
      await page.getByRole("option", { name: "Plan a site visit" }).click();
      await dialog.getByRole("button", { name: "Schedule" }).click();
      await expect(page.getByText(/^Callback scheduled for /)).toBeVisible();

      await page.goto(`/leads?callback=pending&q=${digits}`);
      await expect(page.locator("tbody tr")).toHaveCount(1);
      await expect(page.getByText("Callback: Callback pending")).toBeVisible();
      await page.goto(`/leads?calls=never-called&q=${digits}`);
      await expect(page.locator("tbody tr")).toHaveCount(1);
    });

    test("cannot open the team board or the settings", async ({ page }) => {
      for (const path of ["/team/follow-ups", "/settings/activities/outcomes"]) {
        await page.goto(path);
        await expect(page.getByText("You don't have access to this page")).toBeVisible();
      }
      await page.goto("/calls");
      await expect(page.getByText("Your calls with customers and how they went.")).toBeVisible();
    });
  });

  test("managers follow their team's follow-ups and calls", async ({ browser }) => {
    const manager = await pageAs(browser, "manager");
    await manager.goto("/team/follow-ups");
    await expect(manager.getByRole("heading", { level: 1 })).toHaveText("Team follow-ups");
    const board = manager.getByRole("table", { name: "Follow-ups per person" });
    await expect(board.getByRole("row", { name: /Rahul Executive/ })).toBeVisible();
    await manager.goto("/calls");
    await expect(manager.getByRole("combobox", { name: "Filter by caller" })).toBeVisible();
    await expect(
      manager.locator("tbody tr").filter({ hasText: "Rahul Executive" }).first(),
    ).toBeVisible();
  });

  test("admins manage call outcomes", async ({ page }) => {
    const label = `E2E Outcome ${`${Date.now()}`.slice(-5)}`;
    await page.goto("/settings/activities/outcomes");
    await page.getByRole("button", { name: "Add outcome" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(label);
    await dialog.getByRole("combobox", { name: "Suggest lead status" }).click();
    await page.getByRole("option", { name: "Positive" }).click();
    await dialog.getByRole("button", { name: "Save outcome" }).click();
    await expect(page.getByText(`Outcome "${label}" saved`)).toBeVisible();
    await expect(page.getByRole("row", { name: new RegExp(label) })).toContainText("Positive");
    await page.getByRole("button", { name: `Delete ${label}` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText(`Outcome "${label}" deleted`)).toBeVisible();

    await page.goto("/settings/activities/options");
    await page.getByLabel("Suggest “Unresponsive” after unanswered calls in a row").fill("3");
    await page.getByRole("button", { name: "Save options" }).click();
    await expect(page.getByText("Call and follow-up options saved")).toBeVisible();
  });
});
