import path from "node:path";

import { expect, type Page } from "@playwright/test";

/** Seeded accounts (prisma/seed with SEED_DEMO_USERS=true); all share SEED_ADMIN_PASSWORD. */
export const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
export const USERS = {
  admin: { email: process.env.SEED_ADMIN_EMAIL ?? "admin@demo-realty.test", name: "Asha Admin" },
  manager: { email: "manager@demo-realty.test", name: "Meera Manager" },
  executive: { email: "rahul@demo-realty.test", name: "Rahul Executive" },
} as const;
export type Persona = keyof typeof USERS;

/** Saved sessions written by auth.setup.ts. */
export const storageStateFor = (persona: Persona) =>
  path.join(__dirname, "..", ".auth", `${persona}.json`);

/**
 * Sign-in rate limits are per client IP. Each signing-in page uses its own forwarded address so repeated
 * test runs on one machine do not trip the limiter (the limiter itself is covered by integration tests).
 */
export async function assignFreshClientIp(page: Page) {
  const ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(
    Math.random() * 250 + 1,
  )}`;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": ip });
}

export async function signIn(page: Page, email: string, password = PASSWORD, next?: string) {
  await assignFreshClientIp(page);
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function signInAndWait(page: Page, email: string, password = PASSWORD) {
  await signIn(page, email, password);
  await expect(page).toHaveURL(/\/dashboard$/);
}
