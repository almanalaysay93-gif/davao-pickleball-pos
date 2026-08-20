// Load .env into process.env before any test module runs.
// server/supa.ts reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY at module
// scope, so this file has to win the race. Vitest setupFiles run before the
// test modules that import it, which is the only reason this works.
import "dotenv/config";

/**
 * Send the suite at the test project, never the production one.
 *
 * These tests are not read-only. bookings.test.ts deletes rows wholesale and
 * the payment tests clear a whole player date. The repo history records what
 * happens without this guard: commit 1540a88 had to replace a "system-wide
 * test review wipe" because test runs were deleting real player reviews.
 *
 * Two things are checked rather than trusted, and both failures are loud.
 * A fallback to the production values would turn a missing line in .env into
 * deleted customer data, and the run would still report green.
 */
const testUrl = process.env.SUPABASE_URL_TEST;
const testKey = process.env.SUPABASE_SERVICE_ROLE_KEY_TEST;

if (!testUrl || !testKey) {
  throw new Error(
    "SUPABASE_URL_TEST and SUPABASE_SERVICE_ROLE_KEY_TEST are not both set. " +
      "The suite deletes rows and will not run against the production project. " +
      "Add both to .env, pointing at a separate Supabase project or branch.",
  );
}

if (testUrl === process.env.SUPABASE_URL) {
  throw new Error(
    "SUPABASE_URL_TEST points at the same project as SUPABASE_URL. The suite would delete production data.",
  );
}

/**
 * server/supa.ts defaults SUPABASE_URL to the production project when the
 * variable is absent:
 *
 *   const SUPA_URL = process.env.SUPABASE_URL ?? "https://tfwyrbqygbhrkmlapxxu.supabase.co";
 *
 * That default is why an unset variable is more dangerous here than it looks.
 * Checking the test URL against SUPABASE_URL alone would pass while both were
 * unset, and the suite would then run against production through the fallback.
 */
const PRODUCTION_REF = "tfwyrbqygbhrkmlapxxu";
if (testUrl.includes(PRODUCTION_REF)) {
  throw new Error(
    `SUPABASE_URL_TEST points at the production project (${PRODUCTION_REF}). ` +
      "The suite would delete production data.",
  );
}

process.env.SUPABASE_URL = testUrl;
process.env.SUPABASE_SERVICE_ROLE_KEY = testKey;
