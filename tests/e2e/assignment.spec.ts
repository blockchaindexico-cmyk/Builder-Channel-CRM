import { type Browser, expect, type Page, test } from "@playwright/test";

import { type Persona, storageStateFor } from "./support/auth";

async function pageAs(browser: Browser, persona: Persona): Promise<Page> {
  const context = await browser.newContext({ storageState: storageStateFor(persona) });
  return context.newPage();
}

/** Creates an unassigned lead as the admin (tests run as the admin by default). */
async function createUnassignedLead(page: Page, name: string, mobile: string) {
  await page.goto("/leads/new");
  await page.getByLabel("Full name", { exact: true }).fill(name);
  await page.getByLabel("Mobile", { exact: true }).fill(mobile);
  await page.getByRole("button", { name: "Create lead" }).click();
  await expect(page).toHaveURL(/\/leads\/[0-9a-f-]{36}$/);
  await expect(page.getByText(/· Unassigned/)).toBeVisible();
}

/** Lead assignment (M05-13): queue, reassignment with reasons, bulk, workload, rules. */
test.describe("lead assignment", () => {
  test("a manager assigns from the queue and reassigns with a reason", async ({
    page,
    browser,
  }) => {
    const digits = `${Date.now()}`.slice(-5);
    const name = `E2E Queue ${digits}`;
    await createUnassignedLead(page, name, `94${digits}111`);

    const manager = await pageAs(browser, "manager");
    await manager.goto(`/leads/unassigned?q=${digits}`);
    await expect(manager.locator("tbody tr")).toHaveCount(1);
    await manager.getByRole("button", { name: /^Assign LD-/ }).click();
    let dialog = manager.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "Owner" }).click();
    await manager.getByRole("option", { name: /Rahul Executive/ }).click();
    await dialog.getByRole("button", { name: "Assign", exact: true }).click();
    await expect(manager.getByText(/assigned to Rahul Executive/)).toBeVisible();
    await expect(manager.getByText("Nothing waiting")).toBeVisible();

    await manager.goto(`/leads?q=${digits}`);
    await manager.getByRole("link", { name: new RegExp(name) }).click();
    await expect(manager.getByText(/Owner: Rahul Executive/)).toBeVisible();
    await expect(manager.getByRole("heading", { level: 1 })).toContainText("Assigned");
    await manager.getByRole("button", { name: "Reassign" }).click();
    dialog = manager.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "New owner" }).click();
    await manager.getByRole("option", { name: /Esha Executive/ }).click();
    await expect(dialog.getByRole("button", { name: "Reassign", exact: true })).toBeDisabled();
    await dialog.getByRole("combobox", { name: "Reason category" }).click();
    await manager.getByRole("option", { name: "Workload balancing" }).click();
    await dialog.getByRole("textbox", { name: /Reason/ }).fill("Rahul is out on site visits");
    await dialog.getByRole("button", { name: "Reassign", exact: true }).click();
    await expect(manager.getByText(/reassigned to Esha Executive/)).toBeVisible();

    await manager.reload();
    await manager.getByRole("tab", { name: "Assignments" }).click();
    const history = manager.getByRole("list", { name: "Assignment history" });
    await expect(history.getByRole("listitem")).toHaveCount(2);
    await expect(history.getByRole("listitem").first()).toContainText("Reassigned");
    await expect(history.getByRole("listitem").first()).toContainText(
      "Workload balancing: “Rahul is out on site visits”",
    );
    await expect(history.getByRole("listitem").first()).toContainText("Current");
  });

  test("a manager shares several leads in turn", async ({ page, browser }) => {
    const digits = `${Date.now()}`.slice(-5);
    await createUnassignedLead(page, `E2E Share A ${digits}`, `94${digits}201`);
    await createUnassignedLead(page, `E2E Share B ${digits}`, `94${digits}202`);

    const manager = await pageAs(browser, "manager");
    await manager.goto(`/leads/unassigned?q=${digits}`);
    await expect(manager.locator("tbody tr")).toHaveCount(2);
    await manager.getByRole("checkbox", { name: "Select all rows on this page" }).click();
    await manager.getByRole("button", { name: "Assign", exact: true }).click();
    const dialog = manager.getByRole("dialog");
    await dialog.getByRole("checkbox", { name: "Rahul Executive" }).click();
    await dialog.getByRole("checkbox", { name: "Esha Executive" }).click();
    await expect(dialog.getByText("About 1 lead each, in turn.")).toBeVisible();
    await dialog.getByRole("button", { name: "Assign 2 leads" }).click();
    await expect(manager.getByText("2 leads assigned")).toBeVisible();

    await manager.goto(`/leads?q=${digits}`);
    await expect(manager.locator("tbody tr").filter({ hasText: "Rahul Executive" })).toHaveCount(1);
    await expect(manager.locator("tbody tr").filter({ hasText: "Esha Executive" })).toHaveCount(1);
  });

  test("the workload board drills down into the lead list", async ({ browser }) => {
    const manager = await pageAs(browser, "manager");
    await manager.goto("/team/workload");
    await expect(manager.getByRole("heading", { level: 1 })).toHaveText("Team workload");
    await expect(manager.getByRole("link", { name: "Team workload" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(manager.getByRole("link", { name: "My team" })).not.toHaveAttribute(
      "aria-current",
      "page",
    );
    const row = manager.getByRole("row", { name: /Rahul Executive/ });
    await row.getByRole("link", { name: "Rahul Executive" }).click();
    await expect(manager).toHaveURL(/\/leads\?owner=[0-9a-f-]{36}&open=true/);
    await expect(manager.getByText("Open leads only")).toBeVisible();
  });

  test("an admin assigns while creating and manages rules", async ({ page }) => {
    const digits = `${Date.now()}`.slice(-5);
    await page.goto("/leads/new");
    await page.getByLabel("Full name", { exact: true }).fill(`E2E Chosen ${digits}`);
    await page.getByLabel("Mobile", { exact: true }).fill(`94${digits}301`);
    await page.getByRole("combobox", { name: "Assign to" }).click();
    await page.getByRole("option", { name: /Esha Executive/ }).click();
    await page.getByRole("button", { name: "Create lead" }).click();
    await expect(page.getByText(/Owner: Esha Executive/)).toBeVisible();

    const rule = `E2E Rule ${digits}`;
    await page.goto("/settings/assignment/rules");
    await page.getByRole("button", { name: "Add rule" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name", { exact: true }).fill(rule);
    await dialog
      .getByRole("checkbox", { name: "Members who get the leads: Rahul Executive" })
      .click();
    await dialog.getByRole("button", { name: "Save rule" }).click();
    await expect(page.getByText(`Rule "${rule}" saved`)).toBeVisible();
    await page.getByRole("button", { name: `Delete ${rule}` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText(`Rule "${rule}" deleted`)).toBeVisible();

    await page.goto("/settings/assignment/reasons");
    await expect(page.getByRole("cell", { name: "Workload balancing", exact: true })).toBeVisible();
  });

  test.describe("as an executive", () => {
    test.use({ storageState: storageStateFor("executive") });

    test("has no assignment controls", async ({ page }) => {
      await page.goto("/leads");
      await expect(page.getByRole("link", { name: "Unassigned" })).toHaveCount(0);
      await page.locator("tbody tr a").first().click();
      await expect(page).toHaveURL(/\/leads\/[0-9a-f-]{36}$/);
      await expect(page.getByRole("tab", { name: "Assignments" })).toBeVisible();
      await expect(page.getByRole("button", { name: /^(Assign|Reassign)$/ })).toHaveCount(0);
      for (const path of ["/leads/unassigned", "/team/workload", "/settings/assignment/rules"]) {
        await page.goto(path);
        await expect(page.getByText("You don't have access to this page")).toBeVisible();
      }
    });
  });
});
