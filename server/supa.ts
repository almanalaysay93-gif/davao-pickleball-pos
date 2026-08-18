/**
 * Supabase backend client for the Davao Pickleball POS.
 *
 * The app's database now lives in the user's own Supabase project
 * (tfwyrbqygbhrkmlapxxu). This module provides a small typed REST helper
 * over PostgREST so the rest of the server never touches mysql2/drizzle.
 */
import { createClient } from "@supabase/supabase-js";

const SUPA_URL = process.env.SUPABASE_URL ?? "https://tfwyrbqygbhrkmlapxxu.supabase.co";
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const supa = createClient(SUPA_URL, SUPA_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: "public" },
});

type Row = Record<string, unknown>;

/** Map logical camelCase table names to the actual snake_case Postgres table names. */
const TABLE_ALIASES: Record<string, string> = {
  venues: "venues", courts: "courts", rateTiers: "rate_tiers", bookings: "bookings",
  announcements: "announcements", ownerCredentials: "owner_credentials",
  customerAccounts: "customer_accounts", venueGallery: "venue_gallery",
  venueOwners: "venue_owners", users: "users", reviews: "reviews",
  reviewReplies: "review_replies", staff: "staff", memberships: "memberships",
  memberAccounts: "member_accounts", waitlist: "waitlist",
};

/** Map snake_case Postgres rows to the camelCase field names the routers expect. */
const MAPS: Record<string, (row: Row) => Row> = {
  venues: row => ({
    id: row.id, name: row.name, address: row.address, district: row.district,
    courtCount: Number(row.court_count ?? 0), surfaceType: row.surface_type,
    openTime: row.open_time, closeTime: row.close_time, phone: row.phone,
    description: row.description, imageKey: row.image_key, createdAt: row.created_at,
  }),
  courts: row => ({
    id: row.id, venueId: row.venue_id, courtNumber: row.court_number,
    status: row.status, createdAt: row.created_at,
  }),
  rateTiers: row => ({
    id: row.id, venueId: row.venue_id, tierName: row.tier_name,
    startHour: row.start_hour, endHour: row.end_hour,
    pricePerHour: Number(row.price_per_hour ?? 0).toFixed(2),
    createdAt: row.created_at,
  }),
  bookings: row => ({
    id: row.id, reference: row.reference, courtId: row.court_id, venueId: row.venue_id,
    playerDate: row.player_date, startHour: row.start_hour, endHour: row.end_hour,
    playerName: row.player_name, contact: row.contact, customerAccountId: row.customer_account_id,
    channel: row.channel, paymentStatus: row.payment_status, paymentMethod: row.payment_method,
    dayAmount: row.day_amount, nightAmount: row.night_amount, totalAmount: row.total_amount,
    createdAt: row.created_at,
  }),
  announcements: row => ({
    id: row.id, venueId: row.venue_id, title: row.title, message: row.message,
    active: row.active, expireAt: row.expire_at, createdAt: row.created_at, updatedAt: row.updated_at,
  }),
  ownerCredentials: row => ({
    id: row.id, username: row.username, passwordHash: row.password_hash,
    venueId: row.venue_id, createdAt: row.created_at,
  }),
  customerAccounts: row => ({
    id: row.id, email: row.email, name: row.name, passwordHash: row.password_hash,
    createdAt: row.created_at,
  }),
  venueGallery: row => ({
    id: row.id, venueId: row.venue_id, imageKey: row.image_key,
    sortOrder: Number(row.sort_order ?? 0), createdAt: row.created_at,
  }),
  venueOwners: row => ({
    id: row.id, userId: row.user_id, venueId: row.venue_id, createdAt: row.created_at,
  }),
  users: row => ({
    id: row.id, openId: row.open_id, name: row.name, email: row.email,
    loginMethod: row.login_method, lastSignedIn: row.last_signed_in,
    role: row.role, createdAt: row.created_at,
  }),
  reviews: row => ({
    id: Number(row.id ?? 0), venueId: Number(row.venue_id ?? 0),
    playerName: row.player_name, playerEmail: row.player_email ?? null,
    rating: Number(row.rating ?? 0), comment: row.comment,
    bookingRef: row.booking_ref != null ? Number(row.booking_ref) : null,
    createdAt: row.created_at,
  }),
  reviewReplies: row => ({
    id: Number(row.id ?? 0), reviewId: Number(row.review_id ?? 0),
    ownerUserId: Number(row.owner_user_id ?? 0), body: row.body,
    createdAt: row.created_at,
  }),
  staff: row => ({
    id: Number(row.id ?? 0), userId: Number(row.user_id ?? 0),
    venueId: Number(row.venue_id ?? 0), role: row.role ?? "staff",
    createdAt: row.created_at,
  }),
  memberships: row => ({
    id: Number(row.id ?? 0), venueId: Number(row.venue_id ?? 0), name: row.name,
    description: row.description ?? null, price: Number(row.price ?? 0).toFixed(2),
    credits: Number(row.credits ?? 1), validityDays: Number(row.validity_days ?? 30),
    active: row.active === true || row.active === "t", createdAt: row.created_at,
  }),
  memberAccounts: row => ({
    id: Number(row.id ?? 0), customerAccountId: row.customer_account_id != null ? Number(row.customer_account_id) : null,
    phone: row.phone ?? null, name: row.name,
    membershipId: Number(row.membership_id ?? 0), creditsRemaining: Number(row.credits_remaining ?? 0),
    expiresAt: row.expires_at ?? null, createdAt: row.created_at,
  }),
  waitlist: row => ({
    id: Number(row.id ?? 0), venueId: Number(row.venue_id ?? 0), courtId: Number(row.court_id ?? 0),
    playerDate: row.player_date, startHour: row.start_hour, endHour: row.end_hour,
    playerName: row.player_name, contact: row.contact ?? null,
    notified: row.notified === true || row.notified === "t", notifiedAt: row.notified_at ?? null,
    createdAt: row.created_at,
  }),
};

/** Reverse map: camelCase input → snake_case Postgres columns. */
const REVERSE: Record<string, Record<string, string>> = {
  venues: {
    name: "name", address: "address", district: "district",
    courtCount: "court_count", surfaceType: "surface_type", openTime: "open_time",
    closeTime: "close_time", phone: "phone", description: "description", imageKey: "image_key",
  },
  courts: { venueId: "venue_id", courtNumber: "court_number", status: "status" },
  rateTiers: { venueId: "venue_id", tierName: "tier_name", startHour: "start_hour", endHour: "end_hour", pricePerHour: "price_per_hour" },
  bookings: {
    reference: "reference", courtId: "court_id", venueId: "venue_id", playerDate: "player_date",
    startHour: "start_hour", endHour: "end_hour", playerName: "player_name", contact: "contact",
    customerAccountId: "customer_account_id",     channel: "channel", paymentStatus: "payment_status", paymentMethod: "payment_method", dayAmount: "day_amount", nightAmount: "night_amount",
    totalAmount: "total_amount", seriesId: "series_id", membershipId: "membership_id", seenByOwner: "seen_by_owner",
  },
  announcements: { venueId: "venue_id", title: "title", message: "message", active: "active", expireAt: "expire_at" },
  ownerCredentials: { username: "username", passwordHash: "password_hash", venueId: "venue_id" },
  customerAccounts: { email: "email", name: "name", passwordHash: "password_hash" },
  venueGallery: { venueId: "venue_id", imageKey: "image_key", sortOrder: "sort_order" },
  venueOwners: { userId: "user_id", venueId: "venue_id" },
  users: { openId: "open_id", name: "name", email: "email", loginMethod: "login_method", lastSignedIn: "last_signed_in", role: "role" },
  reviews: { venueId: "venue_id", playerName: "player_name", playerEmail: "player_email", rating: "rating", comment: "comment", bookingRef: "booking_ref" },
  reviewReplies: { reviewId: "review_id", ownerUserId: "owner_user_id", body: "body" },
  staff: { userId: "user_id", venueId: "venue_id", role: "role" },
  memberships: { venueId: "venue_id", name: "name", description: "description", price: "price", credits: "credits", validityDays: "validity_days", active: "active" },
  memberAccounts: { customerAccountId: "customer_account_id", phone: "phone", name: "name", membershipId: "membership_id", creditsRemaining: "credits_remaining", expiresAt: "expires_at" },
  waitlist: { venueId: "venue_id", courtId: "court_id", playerDate: "player_date", startHour: "start_hour", endHour: "end_hour", playerName: "player_name", contact: "contact", notified: "notified", notifiedAt: "notified_at" },
};

function toSnake(table: string, input: Row): Row {
  const map = REVERSE[table] ?? {};
  const out: Row = {};
  for (const [k, v] of Object.entries(input)) {
    const col = map[k];
    if (col !== undefined && v !== undefined) out[col] = v;
    else if (!(k in map) && v !== undefined) out[k.replace(/[A-Z]/g, m => `_${m.toLowerCase()}`)] = v;
  }
  return out;
}

function rows<T extends string>(table: T, data: Row[] | null): Row[] {
  return (data ?? []).map(r => (MAPS[table] ?? ((x: Row) => x))(r));
}

/**
 * PostgREST-style builder. The caller chains filter methods (eq, gt, lte,
 * in, order, limit) on the query object and then calls exec().
 */
class SupaQuery {
  private table: string;
  private filters: Array<(q: any) => any> = [];
  private selectCols = "*";
  constructor(table: string) {
    this.table = table;
  }
  /** The real Postgres table name (snake_case) used by PostgREST. */
  private pgTable(): string {
    return TABLE_ALIASES[this.table] ?? this.table;
  }
  eq(col: string, value: unknown) { this.filters.push(q => q.eq(col, value)); return this; }
  neq(col: string, value: unknown) { this.filters.push(q => q.neq(col, value)); return this; }
  gt(col: string, value: unknown) { this.filters.push(q => q.gt(col, value)); return this; }
  gte(col: string, value: unknown) { this.filters.push(q => q.gte(col, value)); return this; }
  lt(col: string, value: unknown) { this.filters.push(q => q.lt(col, value)); return this; }
  lte(col: string, value: unknown) { this.filters.push(q => q.lte(col, value)); return this; }
  in(col: string, values: unknown[]) { this.filters.push(q => q.in(col, values)); return this; }
  like(col: string, value: string) { this.filters.push(q => q.like(col, value)); return this; }
  or(filter: string) {
    this.filters.push(base => base.or(filter));
    return this;
  }
  is(col: string, value: unknown) { this.filters.push(q => q.is(col, value)); return this; }
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.filters.push(q => q.order(col, opts));
    return this;
  }
  limit(n: number) { this.filters.push(q => q.limit(n)); return this; }
  select(cols: string) { this.selectCols = cols; return this; }

  private base() {
    // supabase-js v2 requires select() before filters: from().select(...).eq(...)
    let q = supa.from(this.pgTable()).select(this.selectCols);
    for (const f of this.filters) q = f(q);
    return q;
  }

  async exec(): Promise<Row[]> {
    const res = await this.base().throwOnError();
    return rows(this.table, (res.data ?? []) as unknown as Row[]);
  }
  async execRaw(): Promise<Row[]> {
    const res = await this.base().throwOnError();
    return (res.data ?? []) as unknown as Row[];
  }

  async insert(input: Row | Row[]): Promise<Row[]> {
    const arr = Array.isArray(input) ? input : [input];
    const res = await supa
      .from(this.pgTable())
      .insert(arr.map(r => toSnake(this.table, r)))
      .select("*")
      .throwOnError();
    return rows(this.table, (res.data ?? []) as Row[]);
  }
  async update(set: Row): Promise<Row[]> {
    let q = supa.from(this.pgTable()).update(toSnake(this.table, set)).select("*");
    for (const f of this.filters) q = f(q);
    const res = await q.throwOnError();
    return rows(this.table, (res.data ?? []) as Row[]);
  }
  async del(): Promise<void> {
    // supabase-js v2 requires at least one filter on delete(); when the caller
    // supplies none (delete-all), match every row via an always-true pk range.
    let q = supa.from(this.pgTable()).delete().gt("id", 0);
    for (const f of this.filters) q = f(q);
    await q.throwOnError();
  }
  async upsert(input: Row | Row[], opts?: { onConflict?: string }): Promise<Row[]> {
    const arr = Array.isArray(input) ? input : [input];
    const res = await supa
      .from(this.pgTable())
      .upsert(arr.map(r => toSnake(this.table, r)), opts ?? { onConflict: "id" })
      .select("*")
      .throwOnError();
    return rows(this.table, (res.data ?? []) as unknown as Row[]);
  }
}

/** Start a typed query against a table. */
export function q(table: string): SupaQuery {
  return new SupaQuery(table);
}

export { rows as mapRows };

/**
 * Raw filtered delete for tables without a camelCase mapping (e.g. owner_credentials).
 * Values are passed straight to PostgREST (no column renaming).
 */
export async function deleteWhere(table: string, filters: Array<(q: any) => any>): Promise<void> {
  // supabase-js v2.112: filter methods (eq/in/like...) are exposed on the builder returned by delete()
  // supabase-js v2 requires at least one filter on delete(). When no filters
  // are supplied (delete-all), match every row via an always-true numeric pk range.
  let chain: any = supa.from(TABLE_ALIASES[table] ?? table).delete().gt("id", 0);
  for (const f of filters) chain = f(chain);
  await chain.throwOnError();
}
