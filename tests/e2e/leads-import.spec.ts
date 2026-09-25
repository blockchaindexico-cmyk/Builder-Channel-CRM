import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { storageStateFor } from "./support/auth";

/** Lead import, export and the intake API (M04-18 → M04-20, M04-23). Runs as the admin. */
test.describe("lead import, export and API keys", () => {
  test("imports a CSV file in the background and reports the rows left out", async ({ page }) => {
    const digits = `${Date.now()}`.slice(-5);
    const fileName = `e2e-import-${digits}.csv`;
    const csv = [
      "Customer Name,Phone Number,Email ID,Lead Source,Budget,Remarks",
      `E2E Import One ${digits},+91 96${digits}101,one.${digits}@example.com,99acres,90 L,Called twice`,
      `E2E Import Two ${digits},96${digits}102,,Walk-in,,`,
      `,96${digits}103,,,,Row without a name`,
    ].join("\n");

    await page.goto("/leads/import/new");
    await page
      .getByTestId("lead-import-input")
      .setInputFiles({ name: fileName, mimeType: "text/csv", buffer: Buffer.from(csv) });
    await expect(page.getByText(`Match the columns of ${fileName}`)).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Column for Name", exact: true })).toHaveText(
      "Customer Name",
    );
    await expect(page.getByRole("combobox", { name: "Column for Note", exact: true })).toHaveText(
      "Remarks",
    );
    await page.getByRole("button", { name: "Check rows" }).click();
    await expect(page.getByText("Ready to import 2 leads")).toBeVisible();
    await expect(page.getByText("Name: Enter the customer's name")).toBeVisible();

    await page.getByRole("button", { name: "Import 2 leads" }).click();
    await expect(page).toHaveURL(/\/leads\/import\/[0-9a-f-]{36}$/);
    await expect(page.getByText("Import finished.")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("row", { name: /Name: Enter the customer's name/ })).toBeVisible();

    await page.getByRole("link", { name: "View imported leads" }).click();
    await expect(page.getByText(`Import: ${fileName}`)).toBeVisible();
    await expect(page.locator("tbody tr")).toHaveCount(2);

    await page.goto("/leads/import");
    await expect(page.getByRole("row", { name: new RegExp(fileName) })).toContainText("Completed");
  });

  test("exports the leads on screen as a spreadsheet", async ({ page }) => {
    await page.goto("/leads?q=E2E%20Import");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export" }).click();
    await page.getByRole("menuitem", { name: /CSV/ }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^leads-\d{4}-\d{2}-\d{2}-\d{4}\.csv$/);
    const content = readFileSync(await file.path(), "utf8");
    expect(content).toContain("Lead number,Name,Mobile,Alternate mobile,E-mail");
    expect(content).toContain("E2E Import One");
    await expect(page.getByText(/Exported \d+ leads?/)).toBeVisible();
  });

  test("creates an API key that sends leads, then revokes it", async ({ page, request }) => {
    const name = `E2E Portal ${Date.now()}`;
    const digits = `${Date.now()}`.slice(-5);
    await page.goto("/settings/api-keys");
    await page.getByRole("button", { name: "Create API key" }).click();
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByRole("button", { name: "Create key" }).click();
    const key = await page.getByLabel("New API key", { exact: true }).inputValue();
    expect(key).toMatch(/^crm_[0-9a-f]{8}_/);
    await page.getByRole("button", { name: "I have stored the key" }).click();
    await expect(page.getByRole("row", { name: new RegExp(name) })).toContainText("Active");

    const lead = { name: `E2E API Lead ${digits}`, mobile: `95${digits}777`, source: "website" };
    const created = await request.post("/api/v1/leads", {
      headers: { authorization: `Bearer ${key}`, "idempotency-key": `e2e-${digits}` },
      data: lead,
    });
    expect(created.status()).toBe(201);
    const { data } = (await created.json()) as { data: { id: string; number: string } };
    const retried = await request.post("/api/v1/leads", {
      headers: { authorization: `Bearer ${key}`, "idempotency-key": `e2e-${digits}` },
      data: lead,
    });
    expect(retried.headers()["idempotent-replayed"]).toBe("true");
    expect(((await retried.json()) as { data: { id: string } }).data.id).toBe(data.id);

    await page.goto(`/leads/${data.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(lead.name);
    await expect(page.getByRole("list", { name: "Lead timeline" })).toContainText(
      "created via the intake API",
    );

    await page.goto("/settings/api-keys");
    await page.getByRole("button", { name: `Revoke ${name}` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Revoke key" }).click();
    await expect(page.getByText(`"${name}" revoked`)).toBeVisible();
    const refused = await request.post("/api/v1/leads", {
      headers: { authorization: `Bearer ${key}` },
      data: { ...lead, name: "After revoke" },
    });
    expect(refused.status()).toBe(401);
  });

  test.describe("as an executive", () => {
    test.use({ storageState: storageStateFor("executive") });

    test("cannot import, export or manage API keys", async ({ page }) => {
      await page.goto("/leads");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Leads");
      await expect(page.getByRole("button", { name: "Export" })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Import" })).toHaveCount(0);
      for (const path of ["/leads/import", "/leads/import/new", "/settings/api-keys"]) {
        await page.goto(path);
        await expect(page.getByText("You don't have access to this page")).toBeVisible();
      }
    });
  });
});
