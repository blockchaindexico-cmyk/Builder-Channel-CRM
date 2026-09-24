import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const ADMIN_STATE = "tests/e2e/.auth/admin.json";

/**
 * End-to-end tests (M01-25, M02-20). Runs against a local app with the docker-compose services, migrations and
 * seed (with demo users) applied. Starts `pnpm dev` (web + worker) unless a server is already running.
 * Tests run as the seeded admin unless they choose another persona (see tests/e2e/support/auth.ts).
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    // Signs in once per persona (admin, manager, executive) and saves the sessions in tests/e2e/.auth.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "desktop",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1366, height: 900 },
        storageState: ADMIN_STATE,
      },
    },
    {
      name: "tablet",
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 820, height: 1180 },
        hasTouch: true,
        storageState: ADMIN_STATE,
      },
      testMatch: /navigation\.spec\.ts/,
    },
  ],
  webServer: {
    command: process.env.E2E_SERVER_COMMAND ?? "pnpm dev",
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
