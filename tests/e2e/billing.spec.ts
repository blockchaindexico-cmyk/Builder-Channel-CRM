import { type Browser, expect, type Page, test } from "@playwright/test";

import { type Persona, storageStateFor } from "./support/auth";
import { waitForEmail } from "./support/mailpit";

async function pageAs(browser: Browser, persona: Persona): Promise<Page> {
  const context = await browser.newContext({ storageState: storageStateFor(persona) });
  return context.newPage();
}

/** A 2% rate card on Skyline Riverfront (kept across runs: active cards may not overlap). */
async function ensureRateCard(page: Page) {
  await page.goto("/settings/commission");
  await expect(
    page.getByRole("heading", { level: 1, name: "Commission rate cards" }),
  ).toBeVisible();
  if (await page.getByRole("cell", { name: /Skyline Riverfront/ }).count()) return;
  await page.getByRole("button", { name: "Add rate card" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Builder" }).click();
  await page.getByRole("option", { name: "Skyline Developers" }).click();
  await dialog.getByRole("combobox", { name: "Project" }).click();
  await page.getByRole("option", { name: "Skyline Riverfront" }).click();
  await dialog.getByLabel("Percentage").fill("2");
  await dialog.getByLabel("Valid from").fill("2020-01-01");
  await dialog.getByRole("button", { name: "Save rate card" }).click();
  await expect(page.getByText("Rate card saved")).toBeVisible();
}

/** Billing, commission & profit/loss (M09). */
test.describe("billing and commission", () => {
  test("a closed booking is billed: commission, invoice, payment, e-mail and PDF", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    const admin = await pageAs(browser, "admin");
    await ensureRateCard(admin);

    // A booking of 80 L closed as won.
    const digits = `${Date.now()}`.slice(-5);
    const customer = `E2E Billing ${digits}`;
    await admin.goto("/leads/new");
    await admin.getByLabel("Full name", { exact: true }).fill(customer);
    await admin.getByLabel("Mobile", { exact: true }).fill(`93${digits}222`);
    await admin.getByRole("button", { name: "Create lead" }).click();
    await expect(admin).toHaveURL(/\/leads\/[0-9a-f-]{36}$/);
    const leadId = admin.url().split("/").at(-1)!;
    await admin.goto(`/bookings/new?lead=${leadId}`);
    await admin.getByRole("combobox", { name: "Project" }).click();
    await admin.getByRole("option", { name: /^Skyline Riverfront/ }).click();
    await admin.getByLabel("Unit number").fill("704");
    await admin.getByLabel("Agreement value").fill("80 L");
    await admin.getByRole("button", { name: "Create booking" }).click();
    await expect(admin).toHaveURL(/\/bookings\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    const bookingNumber = (await admin.getByRole("heading", { level: 1 }).textContent())!.match(
      /BK-\d{6}/,
    )![0];
    await admin.getByRole("button", { name: "Close as won" }).click();
    await admin.getByRole("dialog").getByRole("button", { name: "Close as won" }).click();
    await expect(admin.getByText(/closed — deal won$/)).toBeVisible();

    // The worker creates the deal financials from the rate card: 2% of 80 L.
    const dealLink = admin.getByRole("link", { name: new RegExp(bookingNumber) });
    await expect(async () => {
      await admin.goto(`/billing/deals?q=${bookingNumber}`);
      await expect(dealLink).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 45_000 });
    await dealLink.click();
    await expect(admin.getByRole("heading", { level: 1 })).toContainText("Draft");
    await expect(admin.getByText("2% of the agreement value").first()).toBeVisible();
    await admin.getByLabel("Cashback to the customer").fill("10,000");
    await admin.getByLabel("Executive incentive").fill("8 K");
    await admin.getByRole("button", { name: "Save financials" }).click();
    await expect(admin.getByText("Financials saved")).toBeVisible();
    await expect(admin.getByText("₹1,42,000").first()).toBeVisible(); // 1,60,000 − 10,000 − 8,000

    // Invoice the deal to the builder.
    await admin.goto("/billing/invoices/new");
    await admin.getByRole("combobox", { name: "Builder" }).click();
    await admin.getByRole("option", { name: "Skyline Developers" }).click();
    await admin.getByRole("checkbox", { name: `Bill ${bookingNumber}` }).click();
    await expect(admin.getByText("₹1,88,800").first()).toBeVisible(); // + 18% GST
    await admin.getByRole("button", { name: "Create draft" }).click();
    await expect(admin).toHaveURL(/\/billing\/invoices\/[0-9a-f-]{36}$/);
    const invoiceId = admin.url().split("/").at(-1)!;
    await admin.getByRole("button", { name: "Issue invoice" }).click();
    await admin.getByRole("dialog").getByRole("button", { name: "Issue", exact: true }).click();
    await expect(admin.getByText(/^Invoice INV\/\d{4}-\d{2}\/\d{4} issued$/)).toBeVisible();
    await expect(admin.getByRole("heading", { level: 1 })).toContainText(/INV\/\d{4}-\d{2}\/\d{4}/);
    const invoiceNumber = (await admin.getByRole("heading", { level: 1 }).textContent())!.match(
      /INV\/\d{4}-\d{2}\/\d{4}/,
    )![0];

    // Paid in full, less the 2% TDS the builder deducts.
    await admin.getByRole("button", { name: "Record payment" }).click();
    let dialog = admin.getByRole("dialog");
    await dialog.getByLabel("Amount received").fill("1,85,600");
    await dialog.getByLabel("TDS deducted").fill("3,200");
    await dialog.getByRole("button", { name: "Record payment" }).click();
    await expect(admin.getByText("Payment recorded — invoice paid")).toBeVisible();
    await expect(admin.getByRole("heading", { level: 1 })).toContainText("Paid");

    // E-mailed to the builder with the PDF.
    const since = new Date();
    const to = `billing-${digits}@skyline.test`;
    await admin.getByRole("button", { name: "E-mail" }).click();
    dialog = admin.getByRole("dialog");
    await dialog.getByLabel("To").fill(to);
    await dialog.getByRole("button", { name: "Send" }).click();
    await expect(admin.getByText(`Invoice ${invoiceNumber} is on its way`)).toBeVisible();
    const email = await waitForEmail(to, since);
    expect(email.subject).toContain(`Invoice ${invoiceNumber}`);
    const pdf = await admin.request.get(`/api/billing/invoices/${invoiceId}/pdf`);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

    // Registers and the booking page.
    const csv = await admin.request.get("/api/billing/export?register=invoices&format=csv");
    expect(await csv.text()).toContain(invoiceNumber);
    await admin.goto("/billing/payments");
    await expect(admin.getByRole("link", { name: invoiceNumber })).toBeVisible();
    await admin.goto(`/billing/deals?q=${bookingNumber}`);
    await expect(admin.getByRole("row", { name: new RegExp(bookingNumber) })).toContainText(
      "Confirmed",
    );
  });

  test("managers and executives see no billing", async ({ browser }) => {
    for (const persona of ["manager", "executive"] as const) {
      const page = await pageAs(browser, persona);
      await page.goto("/dashboard");
      const nav = page.getByRole("navigation", { name: "Main" });
      await expect(nav.getByRole("link", { name: "Leads" })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Billing" })).toHaveCount(0);
      await expect(nav.getByRole("link", { name: "Profit & loss" })).toHaveCount(0);
      for (const path of [
        "/billing",
        "/billing/invoices",
        "/reports/profit-loss",
        "/settings/commission",
      ]) {
        await page.goto(path);
        await expect(page.getByText("You don't have access to this page")).toBeVisible();
      }
      const denied = await page.request.get("/api/billing/export?register=deals&format=csv");
      expect(denied.status()).toBe(403);
      await page.context().close();
    }
  });
});
