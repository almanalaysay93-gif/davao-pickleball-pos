// Load .env into process.env before any test module runs.
// server/db.ts reads process.env.DATABASE_URL lazily inside getDb().
import "dotenv/config";

/**
 * Send the suite at the test database, never the development one.
 *
 * These tests are not read-only. bookings.test.ts deletes every row in the
 * bookings table, and the payment tests clear a whole player date. Pointed at
 * DATABASE_URL that is somebody's working data, so the value is replaced here,
 * before server/db.ts ever reads it, rather than trusted to be right.
 *
 * The failure is loud on purpose. A fallback to DATABASE_URL would turn a
 * missing line in .env into deleted rows, and the run would still look green.
 * Prepare the schema with: node --import tsx scripts/setupTestDb.mjs
 */
const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl) {
  throw new Error(
    "DATABASE_URL_TEST is not set. The test suite truncates tables and will not run against DATABASE_URL. " +
      "Add DATABASE_URL_TEST to .env, then run: node --import tsx scripts/setupTestDb.mjs",
  );
}
if (testUrl === process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL_TEST points at the same database as DATABASE_URL. The suite would delete development data.",
  );
}
process.env.DATABASE_URL = testUrl;
