// Build the database the vitest suite runs against.
//
// The suite truncates whole tables, so it must never touch DATABASE_URL. This
// script points every step at DATABASE_URL_TEST instead: it applies the
// migrations in drizzle/ and then reuses scripts/seed.mjs for the venue, court
// and rate-tier rows the tests look up by name.
//
// Run: node --import tsx scripts/setupTestDb.mjs
import "dotenv/config";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";

const url = process.env.DATABASE_URL_TEST;
if (!url) {
  console.error("DATABASE_URL_TEST is not set. Add it to .env before running this.");
  process.exit(1);
}

// Guard, not decoration. A copy-paste that leaves DATABASE_URL_TEST pointing
// at the development schema would let the suite delete real rows on its first
// run, and nothing later in the process would notice.
if (url === process.env.DATABASE_URL) {
  console.error("DATABASE_URL_TEST is the same database as DATABASE_URL. Refusing to prepare it.");
  process.exit(1);
}

const conn = await mysql.createConnection({ uri: url, multipleStatements: true });

// Rebuild from empty, every time.
//
// Tests assert on venue id 1, so the ids have to come out the same on every
// run. Re-seeding a populated schema does not do that: the delete leaves
// AUTO_INCREMENT where it was and the next run hands out 9 to 16 instead. The
// only reliable reset is a schema with nothing in it. Both guards above have
// already established that this is not the development database.
await conn.query("SET FOREIGN_KEY_CHECKS = 0");
const [tables] = await conn.query(
  "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()",
);
for (const { t } of tables) await conn.query(`DROP TABLE IF EXISTS \`${t}\``);
await conn.query("SET FOREIGN_KEY_CHECKS = 1");

const db = drizzle(conn);
await migrate(db, { migrationsFolder: "./drizzle" });
console.log(`Migrated ${new URL(url).pathname.slice(1)}`);
await conn.end();

// seed.mjs reads DATABASE_URL, and dotenv leaves an existing value alone, so
// setting it here sends the seed to the test schema.
process.env.DATABASE_URL = url;
await import("./seed.mjs");

// Owner logins the suite signs in with.
//
// Nothing in the app creates these rows, so a freshly migrated schema has no
// admin at all and eight tests fail on a missing account rather than on a
// behaviour. They are seeded here with the same names and passwords the tests
// use. These are fixtures for a throwaway local schema, not credentials for
// anything that holds real data.
const owners = await mysql.createConnection({ uri: url });
const bcrypt = (await import("bcryptjs")).default;

await owners.execute("DELETE FROM ownerCredentials");

const masterHash = await bcrypt.hash("Pickleyard2026!", 12);
await owners.execute(
  "INSERT INTO ownerCredentials (username, passwordHash, venueId) VALUES (?, ?, NULL)",
  ["owner", masterHash],
);

// One login per venue, named after the venue, scoped to it. Venue ids come
// from the seed that just ran rather than from a list kept in step by hand.
const venueHash = await bcrypt.hash("Davao2026!", 12);
const [venueRows] = await owners.execute("SELECT id, name FROM venues ORDER BY id ASC");
for (const v of venueRows) {
  await owners.execute(
    "INSERT INTO ownerCredentials (username, passwordHash, venueId) VALUES (?, ?, ?)",
    [v.name, venueHash, v.id],
  );
}
console.log(`Seeded owner logins: 1 master, ${venueRows.length} venue-scoped`);
await owners.end();
