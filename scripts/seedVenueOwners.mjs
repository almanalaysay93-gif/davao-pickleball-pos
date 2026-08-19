// Gives every venue in the database its own owner login, so a development
// database can be signed in to as any single venue rather than only as the
// master admin. Run from the project root:
//
//   node --import tsx scripts/seedVenueOwners.mjs
//
// Development only. The password below is in this repository, which is exactly
// why scripts/bootstrapAdmin.mjs refuses it: the master admin is created by a
// person choosing a password, never by a script carrying one.
import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { ownerCredentials, venues } from "../drizzle/schema.ts";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const db = drizzle(process.env.DATABASE_URL);
const hash = await bcrypt.hash("Davao2026!", 12);

// Read the venues rather than repeat them. The previous list was written out
// by hand and had already drifted from the seed it was meant to match, so a
// renamed venue got a login under its old name and nobody could sign in to it.
const rows = await db.select({ id: venues.id, name: venues.name }).from(venues).orderBy(venues.id);

for (const v of rows) {
  const existing = await db
    .select({ id: ownerCredentials.id })
    .from(ownerCredentials)
    .where(eq(ownerCredentials.username, v.name));
  if (existing.length > 0) {
    console.log(`skip (exists): ${v.name}`);
    continue;
  }
  await db.insert(ownerCredentials).values({
    username: v.name,
    passwordHash: hash,
    venueId: v.id,
  });
  console.log(`created: ${v.name} -> venue ${v.id}`);
}
console.log(`done: ${rows.length} venues`);
process.exit(0);
