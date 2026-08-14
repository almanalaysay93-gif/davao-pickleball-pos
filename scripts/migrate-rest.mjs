// Migrate data from Manus MySQL -> Supabase via the REST Data API (service_role key).
// Idempotent: upserts (Prefer: resolution=merge-duplicates) on unique keys.
import mysql from "mysql2/promise";

const MANUS_URL = process.env.DATABASE_URL;
const SUPA_URL = process.env.SUPABASE_URL ?? "https://tfwyrbqygbhrkmlapxxu.supabase.co";
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!MANUS_URL || !SUPA_KEY) {
  console.error("Need DATABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const pool = await mysql.createConnection(MANUS_URL);
const rows = async (t) => {
  const [r] = await pool.query(`SELECT * FROM \`${t}\``);
  return r;
};

const upsert = async (table, items, onConflictCols) => {
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(items),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error(`  !! ${table} HTTP ${res.status}: ${txt.slice(0, 500)}`);
    console.error(`     sample row: ${JSON.stringify(items[0]).slice(0, 300)}`);
    return 0;
  }
  return items.length;
};

const venues = await rows("venues");
const courts = await rows("courts");
const rateTiers = await rows("rateTiers");
const bookings = await rows("bookings");
const ownerCredentials = await rows("ownerCredentials");
const customerAccounts = await rows("customerAccounts");
const announcements = await rows("announcements");
const venueGallery = await rows("venueGallery");

const mapVenues = (v) => ({
  id: v.id, name: v.name, address: v.address, district: v.district,
  court_count: v.courtCount, surface_type: v.surfaceType, open_time: v.openTime,
  close_time: v.closeTime, phone: v.phone, description: v.description,
  image_key: v.imageKey ?? null, created_at: v.createdAt,
});
// Filter out rows referencing venues that no longer exist in Supabase (historical soft-deleted venues).
const venueIds = new Set(venues.map(v => v.id));
const mapCourts = (c) => (venueIds.has(c.venueId) ? { id: c.id, venue_id: c.venueId, court_number: c.courtNumber, status: c.status } : null);
const mapRates = (r) => (venueIds.has(r.venueId) ? {
  id: r.id, venue_id: r.venueId, tier_name: r.tierName, start_hour: r.startHour,
  end_hour: r.endHour, price_per_hour: r.pricePerHour,
} : null);
const mapBookings = (b) => (venueIds.has(b.venueId) ? {
  id: b.id, reference: b.reference, court_id: b.courtId, venue_id: b.venueId,
  player_date: b.playerDate, start_hour: b.startHour, end_hour: b.endHour,
  player_name: b.playerName, contact: b.contact, customer_account_id: b.customerAccountId ?? null,
  channel: b.channel, payment_status: b.paymentStatus, payment_method: b.paymentMethod ?? null,
  day_amount: b.dayAmount, night_amount: b.nightAmount, total_amount: b.totalAmount,
  created_at: b.createdAt,
} : null);
const mapOwners = (o) => ({
  id: o.id, username: o.username, password_hash: o.passwordHash,
  venue_id: o.venueId ?? null, created_at: o.createdAt,
});
const mapCustomers = (a) => ({
  id: a.id, email: a.email, name: a.name, password_hash: a.passwordHash, created_at: a.createdAt,
});
const mapAnnouncements = (a) => ({
  id: a.id, venue_id: a.venueId, title: a.title, message: a.message,
  active: a.active, expire_at: a.expireAt ?? null, created_at: a.createdAt, updated_at: a.updatedAt,
});
const mapGallery = (g) => (venueIds.has(g.venueId) ? {
  id: g.id, venue_id: g.venueId, image_key: g.imageKey,
  sort_order: g.sortOrder, created_at: g.createdAt,
} : null);

const chunks = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

const total = { inserted: 0, failed: 0 };
const load = async (label, items, table, onConflict) => {
  if (!items.length) { console.log(`${label}: 0 rows, skip`); return; }
  const cs = chunks(items, 200);
  let ok = 0;
  for (const c of cs) {
    const n = await upsert(table, c, onConflict);
    ok += n;
    total.inserted += n;
  }
  total.failed += items.length - ok;
  console.log(`${label}: ${ok}/${items.length} rows migrated`);
};

await load("venues", venues.map(mapVenues), "venues", "id");
await load("courts", courts.map(mapCourts).filter(Boolean), "courts", "id");
await load("rateTiers", rateTiers.map(mapRates).filter(Boolean), "rate_tiers", "id");
await load("bookings", bookings.map(mapBookings).filter(Boolean), "bookings", "reference");
await load("ownerCredentials", ownerCredentials.map(mapOwners).filter(Boolean), "owner_credentials", "username");
await load("customerAccounts", customerAccounts.map(mapCustomers), "customer_accounts", "email");
await load("announcements", announcements.map(mapAnnouncements), "announcements", "id");
await load("venueGallery", venueGallery.map(mapGallery).filter(Boolean), "venue_gallery", "id");

// Verify
const verify = async (table) => {
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}?select=id&limit=10000`, {
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, Prefer: "count=exact" },
  });
  return res.headers.get("content-range") ?? "?";
};
console.log("\nSupabase counts (content-range):");
for (const t of ["venues", "courts", "rate_tiers", "bookings", "owner_credentials", "customer_accounts", "announcements", "venue_gallery"]) {
  console.log(t, await verify(t));
}
console.log("Totals: inserted", total.inserted, "failed", total.failed);
await pool.end();
