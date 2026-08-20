/**
 * Seed the TEST Supabase project so the suite has something to run against.
 *
 * Replaces scripts/seed.mjs and scripts/seedVenueOwners.mjs for test use.
 * Both of those still import mysql2/drizzle and connect to DATABASE_URL, which
 * no longer exists on this branch, so both throw on their first line.
 *
 * Run:  node --import tsx scripts/setupTestDb.mjs
 *
 * Reads SUPABASE_URL_TEST and SUPABASE_SERVICE_ROLE_KEY_TEST from .env and
 * refuses to run against anything else. The schema must already exist - apply
 * scripts/supabase-schema.sql in the test project's SQL editor first.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { createClient } from "@supabase/supabase-js";

// --- Guard -----------------------------------------------------------------
// Same three checks as vitest.setup.ts, for the same reason: this script
// deletes every row in the tables it seeds, and a missing line in .env must
// not silently redirect that at production.

const url = process.env.SUPABASE_URL_TEST;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY_TEST;
const PRODUCTION_REF = "tfwyrbqygbhrkmlapxxu";

if (!url || !key) {
  throw new Error(
    "SUPABASE_URL_TEST and SUPABASE_SERVICE_ROLE_KEY_TEST are not both set. " +
      "This script deletes rows and will not run against the production project.",
  );
}
if (url === process.env.SUPABASE_URL) {
  throw new Error("SUPABASE_URL_TEST points at the same project as SUPABASE_URL. Refusing to run.");
}
if (url.includes(PRODUCTION_REF)) {
  throw new Error(`SUPABASE_URL_TEST points at the production project (${PRODUCTION_REF}). Refusing to run.`);
}

const supa = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: "public" },
});

// --- Fixture passwords -----------------------------------------------------
// These are the literals server/bookings.test.ts logs in with. They are test
// fixtures, not production credentials, and they only ever reach the test
// project. Override through the environment if you prefer.

const MASTER_PASSWORD = process.env.TEST_MASTER_PASSWORD ?? "Pickleyard2026!";
const VENUE_OWNER_PASSWORD = process.env.TEST_VENUE_OWNER_PASSWORD ?? "Davao2026!";

// --- Seed data -------------------------------------------------------------
// Lifted verbatim from scripts/seed.mjs so the test project matches the data
// the tests were written against.

const venues = [
  {
    name: "Arena Athletics",
    address: "JCP Warehouse, 9 Punad Bypass Rd, Brgy. Angliongto, Bajada, Davao City",
    district: "Bajada", courtCount: 11, surfaceType: "indoor",
    openTime: "06:00", closeTime: "22:00", phone: "0917 123 4501",
    description:
      "International-standard grit surfaces and premium JOOLA hardware across 11 indoor courts. The flagship pickleball facility in Davao City.",
  },
  {
    name: "Southside Davao",
    address: "Filinvest, Panacan, Davao City",
    district: "Panacan", courtCount: 8, surfaceType: "indoor",
    openTime: "06:00", closeTime: "22:00", phone: "0956 234 5612",
    description:
      "The very first pickleball court in the south, home to eight indoor courts with a vibrant community scene.",
  },
  {
    name: "Matina Town Square",
    address: "Matina Town Square Pavilion, Matina Poblacion, Davao City",
    district: "Matina", courtCount: 6, surfaceType: "covered",
    openTime: "06:00", closeTime: "22:00", phone: "0953 952 6626",
    description:
      "Davao's premier covered courts at the heart of Matina Town Square. Popular with beginners and seasoned players alike.",
  },
  {
    name: "Paddle Up Davao",
    address: "Gaisano Citygate Mall, Buhangin, Davao City",
    district: "Buhangin", courtCount: 6, surfaceType: "indoor",
    openTime: "06:00", closeTime: "00:00", phone: "0956 154 7825",
    description:
      "Non-stop play from 6AM to midnight on weekends. Conveniently located inside Gaisano Citygate Mall.",
  },
  {
    name: "CrisRon",
    address: "FEP Building Corporation, Km 6 Don Julian Rodriguez Sr. Ave, Maa Road, Davao City",
    district: "Maa", courtCount: 8, surfaceType: "outdoor",
    openTime: "06:00", closeTime: "20:00", phone: "0898 008 1788",
    description:
      "Eight courts near Woodridge on Maa Road. A favorite for morning play under the Davao sky.",
  },
  {
    name: "PickleVille",
    address: "168 Don Julian Rodriguez Sr. Ave, Talomo, Davao City",
    district: "Talomo", courtCount: 8, surfaceType: "outdoor",
    openTime: "06:00", closeTime: "22:00", phone: "0917 345 6723",
    description:
      "Eight outdoor courts with dedicated VIP courts on international-standard surfaces. Open 24 hours.",
  },
  {
    name: "Durian Pickleball House",
    address: "Magsaysay St, Calinan, Davao City",
    district: "Calinan", courtCount: 4, surfaceType: "indoor",
    openTime: "07:00", closeTime: "22:00", phone: "0927 456 7834",
    description:
      "A cozy community house for pickleball lovers in Calinan, with affordable rates and open play sessions.",
  },
  {
    name: "929 Pickleyard",
    address: "929 Pickleyard, Tugbok, Davao City",
    district: "Tugbok", courtCount: 5, surfaceType: "indoor",
    openTime: "06:00", closeTime: "22:00", phone: "0945 567 8945",
    description:
      "Five indoor courts rated among the best in Davao, with premium surfaces and a welcoming atmosphere.",
  },
];

const tiers = [
  { venue: "Arena Athletics", tier: "daytime", start: "06:00", end: "18:00", price: 200 },
  { venue: "Arena Athletics", tier: "nighttime", start: "18:00", end: "22:00", price: 300 },
  { venue: "Southside Davao", tier: "daytime", start: "06:00", end: "18:00", price: 220 },
  { venue: "Southside Davao", tier: "nighttime", start: "18:00", end: "22:00", price: 320 },
  { venue: "Matina Town Square", tier: "daytime", start: "06:00", end: "18:00", price: 150 },
  { venue: "Matina Town Square", tier: "nighttime", start: "18:00", end: "22:00", price: 200 },
  { venue: "Paddle Up Davao", tier: "daytime", start: "06:00", end: "18:00", price: 200 },
  { venue: "Paddle Up Davao", tier: "nighttime", start: "18:00", end: "24:00", price: 300 },
  { venue: "CrisRon", tier: "daytime", start: "06:00", end: "18:00", price: 180 },
  { venue: "CrisRon", tier: "nighttime", start: "18:00", end: "20:00", price: 250 },
  { venue: "PickleVille", tier: "daytime", start: "06:00", end: "18:00", price: 250 },
  { venue: "PickleVille", tier: "nighttime", start: "18:00", end: "22:00", price: 350 },
  { venue: "Durian Pickleball House", tier: "daytime", start: "07:00", end: "18:00", price: 200 },
  { venue: "Durian Pickleball House", tier: "nighttime", start: "18:00", end: "22:00", price: 300 },
  { venue: "929 Pickleyard", tier: "daytime", start: "06:00", end: "18:00", price: 300 },
  { venue: "929 Pickleyard", tier: "nighttime", start: "18:00", end: "22:00", price: 350 },
];

// --- Helpers ---------------------------------------------------------------

/** PostgREST reports failure in the response body rather than by throwing. */
function ok(label, { error }) {
  if (error) throw new Error(`${label}: ${error.message}`);
}

async function count(table) {
  const { count: n, error } = await supa.from(table).select("*", { count: "exact", head: true });
  if (error) throw new Error(`count ${table}: ${error.message}`);
  return n ?? 0;
}

/**
 * Delete every row. PostgREST refuses an unfiltered delete, so each call
 * carries a filter that matches everything.
 */
async function wipe(table) {
  ok(`wipe ${table}`, await supa.from(table).delete().gte("id", 0));
}

// --- Run -------------------------------------------------------------------

console.log(`Seeding ${url}`);

// Order matters. bookings and rate_tiers reference courts and venues, and
// venues cascades to both, so clear the dependents first regardless.
for (const t of ["bookings", "rate_tiers", "courts", "owner_credentials", "venues"]) {
  await wipe(t);
}

for (const v of venues) {
  const { data, error } = await supa
    .from("venues")
    .insert({
      name: v.name, address: v.address, district: v.district,
      court_count: v.courtCount, surface_type: v.surfaceType,
      open_time: v.openTime, close_time: v.closeTime,
      phone: v.phone, description: v.description,
    })
    .select("id")
    .single();
  if (error) throw new Error(`insert venue ${v.name}: ${error.message}`);

  const courts = Array.from({ length: v.courtCount }, (_, i) => ({
    venue_id: data.id, court_number: `Court ${i + 1}`, status: "available",
  }));
  ok(`insert courts for ${v.name}`, await supa.from("courts").insert(courts));

  const venueTiers = tiers
    .filter(t => t.venue === v.name)
    .map(t => ({
      venue_id: data.id, tier_name: t.tier,
      start_hour: t.start, end_hour: t.end, price_per_hour: t.price,
    }));
  ok(`insert rate tiers for ${v.name}`, await supa.from("rate_tiers").insert(venueTiers));
}

// Master admin. bookings.test.ts and sessionSecret.test.ts both look this row
// up by the username "owner", and venue_id must stay null - that null is what
// marks the global account apart from the per-venue logins below.
const { data: venueRows, error: venueErr } = await supa.from("venues").select("id, name");
if (venueErr) throw new Error(`read back venues: ${venueErr.message}`);

const masterHash = await bcrypt.hash(MASTER_PASSWORD, 10);
ok(
  "insert master admin",
  await supa.from("owner_credentials").insert({
    username: "owner", password_hash: masterHash, venue_id: null,
  }),
);

const venueOwnerHash = await bcrypt.hash(VENUE_OWNER_PASSWORD, 10);
ok(
  "insert venue owners",
  await supa.from("owner_credentials").insert(
    venueRows.map(v => ({
      username: v.name, password_hash: venueOwnerHash, venue_id: v.id,
    })),
  ),
);

console.log(
  `Seeded: ${await count("venues")} venues, ${await count("courts")} courts, ` +
    `${await count("rate_tiers")} rate tiers, ${await count("owner_credentials")} owner logins`,
);
