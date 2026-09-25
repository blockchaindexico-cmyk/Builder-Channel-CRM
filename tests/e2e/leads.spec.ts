import path from "node:path";

import { type Browser, expect, type Page, test } from "@playwright/test";

import { type Persona, storageStateFor } from "./support/auth";

const fixture = (name: string) => path.join(__dirname, "fixtures", name);

/** A fresh page signed in as another persona (tests run as the admin by default). */
async function pageAs(browser: Browser, persona: Persona): Promise<Page> {
  const context = await browser.newContext({ storageState: storageStateFor(persona) });
  return context.newPage();
}

/** Unique digits per run so mobiles never collide with earlier runs (duplicate detection would kick in). */
function uniqueDigits(): string {
  return `${Date.now()}`.slice(-6);
}

async function createLead(
  page: Page,
  values: { name: string; mobile: string; source?: string; note?: string },
) {
  await page.goto("/leads/new");
  await page.getByLabel("Full name", { exact: true }).fill(values.name);
  await page.getByLabel("Mobile", { exact: true }).fill(values.mobile);
  if (values.source) {
    await page.getByRole("combobox", { name: "Source" }).click();
    await page.getByRole("option", { name: values.source }).click();
  }
  if (values.note) await page.getByPlaceholder("What did the customer say?").fill(values.note);
  await page.getByRole("button", { name: "Create lead" }).click();
  await expect(page).toHaveURL(/\/leads\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(values.name);
}

async function changeStatus(page: Page, label: string, reason?: string) {
  await page.getByRole("button", { name: "Change status" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").click();
  await page.getByRole("option", { name: label, exact: true }).click();
  if (reason) await dialog.getByLabel(/Reason/).fill(reason);
  await dialog.getByRole("button", { name: "Change status" }).click();
  await expect(page.getByText(`Status changed to ${label}`)).toBeVisible();
}

/** Lead management core (M04-23): capture, work and review leads across roles. */
test.describe("leads", () => {
  test("executive captures and works a lead; the manager reopens it", async ({ browser }) => {
    const digits = uniqueDigits();
    const name = `E2E Anita ${digits}`;
    const executive = await pageAs(browser, "executive");

    await executive.goto("/leads");
    await expect(executive.getByRole("navigation", { name: "Lead views" })).toHaveText("My leads");

    await executive.goto("/leads/new");
    await executive.getByLabel("Full name", { exact: true }).fill(name);
    await executive
      .getByLabel("Mobile", { exact: true })
      .fill(`+91 97${digits.slice(0, 3)} ${digits.slice(3)}22`);
    await executive.getByLabel("E-mail", { exact: true }).fill(`anita.${digits}@example.com`);
    await executive.getByRole("combobox", { name: "Source" }).click();
    await executive.getByRole("option", { name: "99acres" }).click();
    await executive.getByLabel("Budget from", { exact: true }).fill("80 L");
    await executive.getByLabel("Budget up to", { exact: true }).fill("1.1 Cr");
    await executive
      .getByRole("group", { name: "Configurations" })
      .getByText("2 BHK", { exact: true })
      .click();
    await executive.getByRole("combobox", { name: "Temperature" }).click();
    await executive.getByRole("option", { name: "Hot" }).click();
    await executive.getByRole("combobox", { name: "Project to add" }).click();
    await executive.getByRole("option", { name: /Skyline Riverfront/ }).click();
    await executive.getByRole("button", { name: "Add project" }).click();
    await executive
      .getByPlaceholder("What did the customer say?")
      .fill("Wants a river-facing 2 BHK, loan pre-approved.");
    await executive.getByRole("button", { name: "Create lead" }).click();

    await expect(executive).toHaveURL(/\/leads\/[0-9a-f-]{36}$/);
    const leadUrl = executive.url();
    await expect(executive.getByRole("heading", { level: 1 })).toContainText(name);
    await expect(executive.getByText(/LD-\d{6} · Owner: Rahul Executive · 99acres/)).toBeVisible();
    await expect(executive.getByText("₹80L – ₹1.1Cr")).toBeVisible();
    const timeline = executive.getByRole("list", { name: "Lead timeline" });
    await expect(timeline).toContainText("created manually");
    await expect(timeline).toContainText("Wants a river-facing 2 BHK");

    await executive.getByRole("tab", { name: /Notes/ }).click();
    await executive.getByLabel("New note").fill("Visiting the site on Sunday.");
    await executive.getByRole("button", { name: "Add note" }).click();
    await expect(executive.getByText("Note added")).toBeVisible();

    await executive.getByRole("tab", { name: /Attachments/ }).click();
    await executive.getByTestId("lead-attachment-input").setInputFiles(fixture("brochure.pdf"));
    await expect(executive.getByText("brochure.pdf attached")).toBeVisible();

    await changeStatus(executive, "Positive");
    // "Lost" needs a reason.
    await executive.getByRole("button", { name: "Change status" }).click();
    let dialog = executive.getByRole("dialog");
    await dialog.getByRole("combobox").click();
    await executive.getByRole("option", { name: "Lost", exact: true }).click();
    await dialog.getByRole("button", { name: "Change status" }).click();
    await expect(executive.getByText('Give a reason for "Lost".')).toBeVisible();
    await dialog.getByLabel(/Reason/).fill("Bought a resale flat");
    await dialog.getByRole("button", { name: "Change status" }).click();
    await expect(executive.getByText("Status changed to Lost")).toBeVisible();

    // Executives cannot reopen a closed lead.
    await executive.getByRole("button", { name: "Change status" }).click();
    dialog = executive.getByRole("dialog");
    await expect(
      dialog.getByText("This lead is closed. Ask a manager to reopen it."),
    ).toBeVisible();
    await dialog.getByRole("combobox").click();
    await expect(executive.getByRole("option")).toHaveText([
      "Not Interested",
      "Invalid / Duplicate",
    ]);
    await executive.keyboard.press("Escape");
    await dialog.getByRole("button", { name: "Cancel" }).click();

    await executive.getByRole("tab", { name: "Status history" }).click();
    await expect(executive.getByText("Bought a resale flat")).toBeVisible();

    // The manager sees the lead in the team view and reopens it.
    const manager = await pageAs(browser, "manager");
    await manager.goto(`/leads?q=${digits}`);
    await expect(manager.getByRole("link", { name: "Team leads" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(manager.locator("tbody tr")).toHaveCount(1);
    await manager.goto(leadUrl);
    await changeStatus(manager, "Follow-up");

    await executive.reload();
    await expect(executive.getByRole("heading", { level: 1 })).toContainText("Follow-up");
  });

  test("flags a duplicate while typing and merges it from the queue", async ({ page }) => {
    const digits = uniqueDigits();
    const mobile = `96${digits}33`;
    await createLead(page, { name: `E2E Original ${digits}`, mobile, source: "Walk-in" });
    const originalUrl = page.url();

    await page.goto("/leads/new");
    await page.getByLabel("Full name", { exact: true }).fill(`E2E Copy ${digits}`);
    // Same number in another format.
    await page
      .getByLabel("Mobile", { exact: true })
      .fill(`0${mobile.slice(0, 5)}-${mobile.slice(5)}`);
    await page.getByLabel("Mobile", { exact: true }).blur();
    const warning = page.getByRole("alert").filter({ hasText: "may already exist" });
    await expect(warning).toContainText(`E2E Original ${digits}`);
    await expect(warning).toContainText("same mobile");
    await page.getByRole("button", { name: "Create lead" }).click();
    await expect(page.getByText(/flagged as a possible duplicate/)).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "Possible duplicate of" }),
    ).toBeVisible();

    await page.goto("/leads/duplicates");
    const card = page.locator("[data-slot=card]").filter({ hasText: `E2E Copy ${digits}` });
    await card.getByRole("button", { name: "Merge" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Merge leads" }).click();
    await expect(page.getByText(/merged into/)).toBeVisible();
    await expect(card).toHaveCount(0);

    // Searching by the number in international format finds only the surviving lead.
    await page.goto(`/leads?q=${encodeURIComponent(`+91-${mobile}`)}`);
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(page.locator("tbody tr")).toContainText(`E2E Original ${digits}`);
    await page.goto(originalUrl);
    await expect(page.getByRole("list", { name: "Lead timeline" })).toContainText("Merged");
  });

  test("filters, saves a view and changes status in bulk", async ({ page }) => {
    const digits = uniqueDigits();
    await createLead(page, {
      name: `E2E Bulk ${digits}`,
      mobile: `95${digits}44`,
      source: "Referral",
    });

    await page.goto(`/leads?q=${digits}`);
    await page.getByLabel("Filter by source").click();
    await page.getByRole("option", { name: "Referral" }).click();
    await expect(page).toHaveURL(/source=/);
    await expect(page.locator("tbody tr")).toHaveCount(1);

    await page.getByRole("button", { name: "Saved views" }).click();
    await page.getByRole("menuitem", { name: /Save current view/ }).click();
    await page.getByLabel("Name", { exact: true }).fill(`Referral ${digits}`);
    await page.getByRole("button", { name: "Save view" }).click();
    await expect(page.getByText(`View "Referral ${digits}" saved`)).toBeVisible();

    await page.goto("/leads");
    await page.getByRole("button", { name: "Saved views" }).click();
    await page.getByRole("menuitem", { name: new RegExp(`^Referral ${digits}`) }).click();
    await expect(page).toHaveURL(new RegExp(`q=${digits}`));
    await expect(page.locator("tbody tr")).toHaveCount(1);

    await page.getByRole("checkbox", { name: "Select row" }).first().click();
    await expect(page.getByText("1 selected")).toBeVisible();
    await page.getByRole("button", { name: "Change status" }).click();
    await page.getByRole("dialog").getByRole("combobox").click();
    await page.getByRole("option", { name: "Contacted", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Change status" }).click();
    await expect(page.getByText("Status changed to Contacted")).toBeVisible();
    await expect(page.locator("tbody tr")).toContainText("Contacted");
  });

  test("lead settings are for lead administrators only", async ({ page, browser }) => {
    await page.goto("/settings/leads/statuses");
    await expect(page.getByRole("cell", { name: /^New \/ Open/ })).toBeVisible();
    await page.goto("/settings/leads/duplicates");
    await expect(page.getByRole("radio")).toHaveCount(3);

    const executive = await pageAs(browser, "executive");
    await executive.goto("/settings/leads/statuses");
    await expect(executive.getByText("You don't have access to this page")).toBeVisible();
  });
});
