import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests, kept apart from the vitest suite.
 *
 * vitest only scans server/**, so e2e/*.spec.ts belongs to Playwright alone
 * and neither runner picks up the other's files.
 *
 * These tests drive the real app against the real database. They are not part
 * of `pnpm test` for that reason: a vitest run is fast and self-contained,
 * while this one starts a server and leaves rows behind.
 */
export default defineConfig({
  testDir: "./e2e",
  // A booking flow that races itself is a bug worth seeing, not one to hide
  // behind retries. Serial locally; CI keeps one worker for the same reason.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? "list" : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    // Locally the dev server is usually already up, and killing it to start an
    // identical one only costs a rebuild.
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
