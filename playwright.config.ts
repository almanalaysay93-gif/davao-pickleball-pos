import { defineConfig, devices } from "@playwright/test";

/**
 * Browser suite for the PayMongo checkout flow.
 *
 * The dev server is started here rather than by hand, because starting it by
 * hand is the dangerous case. server/supa.ts falls back to the production
 * project ref when SUPABASE_URL is absent, and .env does not define that
 * variable. The command below sources .env and then maps the _TEST values onto
 * the names the server reads, so the app under test can only ever reach the
 * test project. The `testProjectProof` fixture in e2e/helpers/fixtures.ts
 * proves that afterwards rather than trusting it.
 */
const PORT = Number(process.env.E2E_PORT ?? 3111);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * Refuse to start when the port is already taken.
 *
 * server/_core/index.ts hunts for a free port when its preferred one is busy.
 * A stale dev server left on the port therefore keeps answering baseURL while
 * the freshly started one moves to the next port, and the whole suite runs
 * against old code without a word. Observed once during development; this is
 * the guard against seeing it again.
 */
const portGuard =
  `node -e "const n=require('net'),s=n.createServer();` +
  `s.once('error',()=>{console.error('E2E port ${PORT} is already in use. ` +
  `Stop the stale dev server first: pkill -f \\"tsx watch server/_core/index.ts\\"');process.exit(1)});` +
  `s.listen(${PORT},()=>s.close(()=>process.exit(0)))"`;

const serverCommand = [
  portGuard,
  "&&",
  "set -a; . ./.env; set +a;",
  'SUPABASE_URL="$SUPABASE_URL_TEST"',
  'SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY_TEST"',
  `PORT=${PORT}`,
  "pnpm dev",
].join(" ");

export default defineConfig({
  testDir: "./e2e",
  // One live database and real PayMongo sessions. Serial keeps slot conflicts
  // and session reuse assertions deterministic.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [["list"]],
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 20_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: serverCommand,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
