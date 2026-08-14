// Migrate schema + data from Manus MySQL to the user's Supabase Postgres.
// Usage: SUPABASE_DATABASE_URL=... node scripts/migrate-to-supabase.mjs
// Idempotent: CREATE TABLE IF NOT EXISTS; conflicts on unique keys are skipped (ON CONFLICT DO NOTHING).
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const SUPA_URL = process.env.SUPABASE_DATABASE_URL;
const MANUS_URL = process.env.DATABASE_URL;
if (!SUPA_URL || !MANUS_URL) {
  console.error("Need SUPABASE_DATABASE_URL and DATABASE_URL env vars");
  process.exit(1);
}

const pgUrlPool = new URL(SUPA_URL);
const supa = drizzle(new Pool({ user: pgUrlPool.username, password: pgUrlPool.password, host: pgUrlPool.hostname, port: Number(pgUrlPool.port), database: pgUrlPool.pathname.slice(1), ssl: { rejectUnauthorized: false }, family: 4 }));
const pool = await mysql.createConnection(MANUS_URL);

// ---------- 1. Create schema on Supabase ----------
const sql = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "supabase-schema.sql"), "utf8");
// pg client has no multi-statement convenience via drizzle; use raw pg client instead.
import pg from "pg";
const pgUrl = new URL(SUPA_URL);
const client = new pg.Client({ user: pgUrl.username, password: pgUrl.password, host: pgUrl.hostname, port: Number(pgUrl.port), database: pgUrl.pathname.slice(1), ssl: { rejectUnauthorized: false }, family: 4 });
await client.connect();
await client.query(sql);
console.log("Schema created on Supabase");

// ---------- 2. Copy data ----------
async function rows(t) {
  const [r] = await pool.query(`SELECT * FROM \`${t}\``);
  return r;
}

const venues = await rows("venues");
const courts = await rows("courts");
const rateTiers = await rows("rateTiers");
const bookings = await rows("bookings");
const ownerCredentials = await rows("ownerCredentials");
const customerAccounts = await rows("customerAccounts");
const announcements = await rows("announcements");
const venueGallery = await rows("venueGallery");

const insert = async (table, row, conflictTarget) => {
  const cols = Object.keys(row).map((k) => `"${k}"`).join(", ");
  const vals = Object.values(row).map((v) => (v === null ? "NULL" : typeof v === "string" ? `'${v.replace(/'/g, "''")}'` : v));
  const q = `INSERT INTO "${table}" (${cols}) VALUES (${vals.join(", ")}) ON CONFLICT ${conflictTarget} DO NOTHING`;
  await client.query(q);
};

let n = 0;
for (const v of venues) {
  await insert("venues", {
    id: v.id, name: v.name, address: v.address, district: v.district,
    courtCount: v.courtCount, surfaceType: v.surfaceType, openTime: v.openTime,
    closeTime: v.closeTime, phone: v.phone, description: v.description, imageKey: v.imageKey,
    createdAt: v.createdAt,
  }, "(id)");
  n++;
}
for (const c of courts) {
  await insert("courts", { id: c.id, venueId: c.venueId, courtNumber: c.courtNumber, status: c.status }, "(id)");
  n++;
}
for (const r of rateTiers) {
  await insert("rateTiers", {
    id: r.id, venueId: r.venueId, tierName: r.tierName, startHour: r.startHour,
    endHour: r.endHour, pricePerHour: r.pricePerHour,
  }, "(id)");
  n++;
}
for (const b of bookings) {
  await insert("bookings", {
    id: b.id, reference: b.reference, courtId: b.courtId, venueId: b.venueId,
    playerDate: b.playerDate, startHour: b.startHour, endHour: b.endHour,
    playerName: b.playerName, contact: b.contact, customerAccountId: b.customerAccountId,
    channel: b.channel, paymentStatus: b.paymentStatus, paymentMethod: b.paymentMethod,
    dayAmount: b.dayAmount, nightAmount: b.nightAmount, totalAmount: b.totalAmount,
    createdAt: b.createdAt,
  }, "(reference)");
  n++;
}
for (const o of ownerCredentials) {
  await insert("owner_credentials", {
    id: o.id, username: o.username, password_hash: o.passwordHash,
    venue_id: o.venueId, created_at: o.createdAt,
  }, "(username)");
  n++;
}
for (const a of customerAccounts) {
  await insert("customer_accounts", {
    id: a.id, email: a.email, name: a.name,
    password_hash: a.passwordHash, created_at: a.createdAt,
  }, "(email)");
  n++;
}
for (const a of announcements) {
  await insert("announcements", {
    id: a.id, venueId: a.venueId, title: a.title, message: a.message,
    active: a.active, expireAt: a.expireAt, createdAt: a.createdAt, updatedAt: a.updatedAt,
  }, "(id)");
  n++;
}
for (const g of venueGallery) {
  await insert("venue_gallery", {
    id: g.id, venueId: g.venueId, imageKey: g.imageKey,
    sortOrder: g.sortOrder, createdAt: g.createdAt,
  }, "(id)");
  n++;
}

// ---------- 3. Verify ----------
const verify = async (t) => {
  const r = await client.query(`SELECT COUNT(*) FROM ${t}`);
  return r.rows[0].count;
};
console.log("Verification (Supabase counts):");
console.log("venues", await verify("venues"));
console.log("courts", await verify("courts"));
console.log("rate_tiers", await verify("rate_tiers"));
console.log("bookings", await verify("bookings"));
console.log("owner_credentials", await verify("owner_credentials"));
console.log("customer_accounts", await verify("customer_accounts"));
console.log("announcements", await verify("announcements"));
console.log("venue_gallery", await verify("venue_gallery"));
console.log(`Migrated ${n} rows total`);
await client.end();
await pool.end();
