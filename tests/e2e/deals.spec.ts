import path from "node:path";

import { type Browser, expect, type Page, test } from "@playwright/test";

import { type Persona, storageStateFor } from "./support/auth";

const fixture = (name: string) => path.join(__dirname, "fixtures", name);

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

/** Yesterday 11 AM in the organization's time zone, as a date-time input value. */
const yesterdayAt11 = () =>
  `${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(Date.now() - 24 * 3600 * 1000),
  )}T11:00`;

async function planVisit(page: Page, when: { pick: string } | { value: string }) {
  await page.getByRole("button", { name: "Schedule visit" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Project" }).click();
  await page.getByRole("option", { name: /^Skyline Riverfront/ }).click();
  if ("pick" in when) await dialog.getByRole("button", { name: when.pick }).click();
  else await dialog.getByLabel("When").fill(when.value);
  return dialog;
}

/** Site visits, bookings & closures (M08). */
test.describe("visits, bookings and closures", () => {
  test("a lead goes Visit → Booking → Closed/Won, each step on its timeline", async ({
    browser,
  }) => {
    const executive = await pageAs(browser, "executive");
    const digits = `${Date.now()}`.slice(-5);
    const name = `E2E Buyer ${digits}`;
    await createOwnLead(executive, name, `92${digits}111`);

    // An upcoming visit with a pickup: the lead moves to Visit.
    let dialog = await planVisit(executive, { pick: "Saturday 11 AM" });
    await dialog.getByLabel("Pickup needed").click();
    await dialog.getByLabel("Pickup address").fill("Andheri East station");
    await dialog.getByRole("button", { name: "Plan visit" }).click();
    await expect(executive.getByText(/^Visit 1 planned for /)).toBeVisible();
    await executive.reload();
    await expect(executive.getByRole("heading", { level: 1 })).toContainText("Visit");

    // A visit that already happened, recorded afterwards, with its outcome.
    dialog = await planVisit(executive, { value: yesterdayAt11() });
    await expect(dialog.getByText(/This time has passed/)).toBeVisible();
    await dialog.getByRole("button", { name: "Plan visit" }).click();
    await expect(executive.getByText(/^Visit 2 planned for /)).toBeVisible();
    await executive.reload();
    await executive.getByRole("tab", { name: "Visits" }).click();
    const visits = executive.getByRole("list", { name: "Site visits and revisits" });
    await expect(visits.getByRole("listitem")).toHaveCount(2);
    const happened = visits.getByRole("listitem").filter({ hasText: "Outcome pending" });
    await happened.getByRole("button", { name: /^Done/ }).click();
    dialog = executive.getByRole("dialog");
    await dialog.getByRole("radio", { name: "Liked it — wants to book" }).check();
    await dialog.getByLabel("Customer's feedback").fill("Loved the river-facing 2 BHK");
    await dialog.getByRole("button", { name: "Save outcome" }).click();
    await expect(dialog.getByRole("heading", { name: "What's next?" })).toBeVisible();
    await dialog.getByRole("link", { name: "Convert to booking" }).click();

    // The booking, with a document.
    await expect(executive).toHaveURL(/\/bookings\/new\?lead=/);
    await executive.getByLabel("Tower / wing").fill("B");
    await executive.getByLabel("Unit number").fill("1203");
    await executive.getByRole("combobox", { name: "Configuration" }).click();
    await executive.getByRole("option", { name: "2 BHK" }).click();
    await executive.getByLabel("Documents").setInputFiles(fixture("brochure.pdf"));
    await executive.getByRole("button", { name: "Create booking" }).click();
    await expect(executive).toHaveURL(/\/bookings\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    const bookingUrl = executive.url();
    await expect(executive.getByRole("heading", { level: 1 })).toContainText(/Booking BK-\d{6}/);
    await expect(executive.getByRole("list", { name: "Documents" })).toContainText("brochure.pdf");
    await expect(
      executive.getByText("Booking values are visible to authorized people only."),
    ).toBeVisible();
    // Executives move bookings along but do not close them.
    await expect(executive.getByRole("button", { name: "Close as won" })).toHaveCount(0);
    await executive.getByRole("button", { name: "Move stage" }).click();
    await executive.getByRole("dialog").getByRole("button", { name: "Move", exact: true }).click();
    await expect(executive.getByText(/moved to Agreement signed$/)).toBeVisible();

    // The manager closes the deal.
    const manager = await pageAs(browser, "manager");
    await manager.goto(bookingUrl);
    await manager.getByRole("button", { name: "Close as won" }).click();
    dialog = manager.getByRole("dialog");
    await dialog.getByLabel("Note").fill("Agreement registered");
    await dialog.getByRole("button", { name: "Close as won" }).click();
    await expect(manager.getByText(/closed — deal won$/)).toBeVisible();
    await manager.reload();
    await expect(manager.getByRole("heading", { level: 1 })).toContainText("Closed / Won");
    await expect(manager.getByRole("list", { name: "Booking history" })).toContainText(
      "Stage: Booked → Agreement signed",
    );

    // The lead: Closed/Won, with the journey on its timeline.
    await executive.getByRole("link", { name: new RegExp(`LD-\\d+ · ${name}`) }).click();
    await expect(executive.getByRole("heading", { level: 1 })).toContainText("Closed / Won");
    const timeline = executive.getByRole("list", { name: "Lead timeline" });
    await expect(timeline).toContainText("Visit 1 to Skyline Riverfront planned");
    await expect(timeline).toContainText(
      "Visit 2 to Skyline Riverfront done · Liked it — wants to book",
    );
    await expect(timeline).toContainText(/Booking BK-\d{6} for Skyline Riverfront/);
    await expect(timeline).toContainText(/Booking BK-\d{6} closed — deal won/);
  });

  test("an executive closes a lead as not interested with a reason", async ({ browser }) => {
    const executive = await pageAs(browser, "executive");
    const digits = `${Date.now()}`.slice(-5);
    await createOwnLead(executive, `E2E Browser ${digits}`, `92${digits}222`);
    await executive.getByRole("button", { name: "More actions" }).click();
    await executive.getByRole("menuitem", { name: "Mark lost or not interested" }).click();
    const dialog = executive.getByRole("dialog");
    await dialog.getByRole("radio", { name: "Not interested" }).check();
    await dialog.getByRole("button", { name: "Close as not interested" }).click();
    await expect(dialog.getByText("Choose a reason")).toBeVisible();
    await dialog.getByRole("combobox", { name: "Reason" }).click();
    await executive.getByRole("option", { name: "No real requirement" }).click();
    await dialog.getByLabel("Note").fill("Only checking prices");
    await dialog.getByRole("button", { name: "Close as not interested" }).click();
    await expect(executive.getByText(/closed as Not Interested$/)).toBeVisible();
    await executive.reload();
    await expect(executive.getByRole("heading", { level: 1 })).toContainText("Not Interested");
    await expect(executive.getByRole("heading", { level: 1 })).toContainText("No real requirement");

    // The ready-made "Not interested" view lists it.
    await executive.goto("/leads");
    await executive.getByRole("button", { name: "Saved views" }).click();
    await executive.getByRole("menuitem", { name: "Not interested" }).click();
    await expect(executive).toHaveURL(/closure=not-interested/);
    await executive.goto(`/leads?closure=not-interested&q=${digits}`);
    await expect(executive.locator("tbody tr")).toHaveCount(1);
  });

  test("managers follow the team's visits and bookings", async ({ browser }) => {
    const manager = await pageAs(browser, "manager");
    await manager.goto("/visits");
    await expect(manager.getByRole("heading", { level: 1 })).toHaveText("Site visits");
    await manager.getByRole("tab", { name: "Calendar" }).click();
    await expect(manager.getByLabel("Visits this week")).toBeVisible();
    await manager.getByRole("tab", { name: "Team" }).click();
    await expect(
      manager.getByRole("table", { name: "Visits per person" }).getByRole("row", {
        name: /Rahul Executive/,
      }),
    ).toBeVisible();
    await manager.goto("/bookings");
    await expect(manager.getByRole("combobox", { name: "Filter by executive" })).toBeVisible();
    // Managers do not see booking values (Q-16).
    await expect(manager.getByRole("columnheader", { name: "Agreement value" })).toHaveCount(0);

    const executive = await pageAs(browser, "executive");
    for (const path of ["/settings/deals/outcomes", "/settings/deals/reasons"]) {
      await executive.goto(path);
      await expect(executive.getByText("You don't have access to this page")).toBeVisible();
    }
    await executive.goto("/agenda?tab=visits");
    await expect(executive.getByRole("tab", { name: /^Site visits/ })).toBeVisible();
  });

  test("admins manage loss reasons, booking stages and options", async ({ page }) => {
    const label = `E2E Reason ${`${Date.now()}`.slice(-5)}`;
    await page.goto("/settings/deals/reasons");
    await page.getByRole("button", { name: "Add reason" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(label);
    await dialog.getByRole("button", { name: "Save reason" }).click();
    await expect(page.getByText(`Reason "${label}" saved`)).toBeVisible();
    await expect(page.getByRole("row", { name: new RegExp(label) })).toContainText("Lost");
    await page.getByRole("button", { name: `Delete ${label}` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText(`Reason "${label}" deleted`)).toBeVisible();

    await page.goto("/settings/deals/stages");
    const stages = page.getByRole("list", { name: "Booking stages" });
    await expect(stages).toContainText("Booked");
    await expect(stages).toContainText("Agreement signed");

    await page.goto("/settings/deals/options");
    await page.getByLabel("Remind the executive before a visit (minutes)").fill("120");
    await page.getByRole("button", { name: "Save options" }).click();
    await expect(page.getByText("Visit and booking options saved")).toBeVisible();
  });
});
