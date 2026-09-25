import path from "node:path";

import { expect, test } from "@playwright/test";

import { storageStateFor } from "./support/auth";

const fixture = (name: string) => path.join(__dirname, "fixtures", name);

/** Builders & projects (M03-14): admin maintains the catalogue, everyone browses it. */
test.describe("catalogue as admin", () => {
  test("adds a builder, a contact and a project with configurations and documents", async ({
    page,
  }) => {
    const suffix = Date.now().toString(36).slice(-5).toUpperCase();
    const builderName = `E2E Builders ${suffix}`;
    const projectName = `E2E Heights ${suffix}`;

    await page.goto("/builders");
    await page.getByRole("button", { name: "Add builder" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name", { exact: true }).fill(builderName);
    await dialog.getByLabel("City", { exact: true }).fill("Pune");
    await dialog.getByRole("button", { name: "Add builder" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(builderName);
    await expect(page.getByText(/added as BLD-\d{4}/)).toBeVisible();

    await page.getByRole("tab", { name: /Contacts/ }).click();
    await page.getByRole("button", { name: "Add contact" }).click();
    await page.getByRole("dialog").getByLabel("Name", { exact: true }).fill("Priya Sales");
    await page.getByRole("dialog").getByLabel("Phone", { exact: true }).fill("+91 98200 33333");
    await page.getByRole("button", { name: "Save contact" }).click();
    await expect(page.getByText("Primary", { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: /Projects/ }).click();
    await page.getByRole("link", { name: "Add project" }).click();
    await page.getByLabel("Project name", { exact: true }).fill(projectName);
    await page.getByLabel("Locality", { exact: true }).fill("Wakad");
    await page.getByLabel("City", { exact: true }).fill("Pune");
    await page.getByLabel("Possession date", { exact: true }).fill("2028-09-30");
    await page.getByRole("button", { name: "Add configuration" }).click();
    await page.getByRole("combobox", { name: "Configuration 1" }).click();
    await page.getByRole("option", { name: "2 BHK", exact: true }).click();
    await page.getByLabel("Price from (row 1)").fill("75 L");
    await page.getByLabel("Price to (row 1)").fill("82 L");
    await page.getByRole("group", { name: "Amenities" }).getByText("Gymnasium").click();
    await page.getByRole("button", { name: "Add project" }).click();

    await expect(page.getByRole("heading", { level: 1 })).toContainText(projectName);
    await expect(page.getByText("₹75,00,000 – ₹82,00,000")).toBeVisible();
    await expect(page.getByText("Sep 2028")).toBeVisible();

    await page.getByRole("tab", { name: /Documents/ }).click();
    await page.getByTestId("project-document-input").setInputFiles(fixture("brochure.pdf"));
    await page.getByRole("dialog").getByRole("button", { name: "Upload" }).click();
    await expect(page.getByText("brochure uploaded")).toBeVisible();
    // Scoped to the tab: the "uploaded" toast is a list item too.
    await expect(
      page.getByRole("tabpanel").getByRole("listitem").filter({ hasText: "Brochure" }),
    ).toBeVisible();

    await page.getByRole("combobox", { name: "Project status" }).click();
    await page.getByRole("option", { name: "Pre-launch" }).click();
    await expect(page.getByText("Status changed to Pre-launch")).toBeVisible();
  });

  test("filters projects by budget and shows the quick-info drawer", async ({ page }) => {
    // Seeded demo data: Skyline Greens Plots ₹30L–₹58L, Skyline Riverfront ₹92L–₹1.5Cr.
    await page.goto("/projects?q=Skyline");
    await expect(page.getByRole("link", { name: "Skyline Riverfront" })).toBeVisible();
    await page.getByLabel("Budget from").fill("40 L");
    await page.getByLabel("Budget to").fill("60 L");
    await page.getByLabel("Budget to").press("Enter");
    await expect(page).toHaveURL(/budgetMin=4000000/);
    await expect(page).toHaveURL(/budgetMax=6000000/);
    await expect(page.getByRole("link", { name: "Skyline Greens Plots" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Skyline Riverfront" })).toHaveCount(0);

    await page.getByRole("button", { name: "Quick view of Skyline Greens Plots" }).click();
    const drawer = page.getByRole("dialog");
    await expect(drawer.getByText("Configurations")).toBeVisible();
    await expect(drawer.getByText("₹30L – ₹58L").first()).toBeVisible();
  });

  test("maintains master data", async ({ page }) => {
    const name = `E2E Amenity ${Date.now().toString(36)}`;
    await page.goto("/settings/catalog/amenities");
    await page.getByRole("button", { name: "Add amenity" }).click();
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("cell", { name, exact: true })).toBeVisible();
    await page.getByRole("button", { name: `Delete ${name}` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("cell", { name, exact: true })).toHaveCount(0);
  });
});

test.describe("catalogue as executive", () => {
  test.use({ storageState: storageStateFor("executive") });

  test("browses projects read-only", async ({ page }) => {
    await page.goto("/projects");
    await expect(page.getByRole("link", { name: "Add project" })).toHaveCount(0);
    await page.getByRole("link", { name: "Skyline Riverfront" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Skyline Riverfront");
    await expect(page.getByRole("combobox", { name: "Project status" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Edit" })).toHaveCount(0);
    await page.getByRole("tab", { name: /Configurations/ }).click();
    await expect(page.getByRole("cell", { name: "3 BHK" })).toBeVisible();

    await page.goto("/builders");
    await expect(page.getByRole("button", { name: "Add builder" })).toHaveCount(0);
    await page.goto("/projects/new");
    await expect(page.getByText("You don't have access to this page")).toBeVisible();
  });
});
