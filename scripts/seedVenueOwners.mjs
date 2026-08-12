// Seeds venue-specific owner credentials (username = venue name) so each
// of the 8 Davao venues gets its own owner login. Global system owner row
// (id 1) is left untouched. Run: node --import tsx scripts/seedVenueOwners.mjs
// from the project root.
import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import bcrypt from "bcryptjs";
import { ownerCredentials } from "../drizzle/schema.ts";

const db = drizzle(process.env.DATABASE_URL);

const password = "Davao2026!";
const hash = await bcrypt.hash(password, 12);

const venues = [
  { id: 1, name: "Arena Athletics" },
  { id: 2, name: "Southside Davao" },
  { id: 3, name: "Matina Town Square" },
  { id: 4, name: "Paddle Up Davao" },
  { id: 5, name: "CrisRon" },
  { id: 6, name: "PickleVille" },
  { id: 7, name: "Durian Pickleball House" },
  { id: 8, name: "929 Pickleyard" },
];

for (const v of venues) {
  const existing = await db
    .select()
    .from(ownerCredentials)
    .where({ username: v.name });
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
console.log("done");
process.exit(0);
