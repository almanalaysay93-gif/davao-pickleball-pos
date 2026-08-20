/**
 * Database helpers backed by Supabase (PostgREST) for the Davao Pickleball POS.
 *
 * The app's database was migrated from the Manus-hosted MySQL to the user's
 * own Supabase project. Every exported helper keeps the exact same signature
 * and camelCase row shape that `server/routers.ts` expects.
 */
import type { InsertUser } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { deleteWhere, q, type Row } from "./supa";

export interface VenueRow {
  id: number; name: string; address: string; district: string | null;
  courtCount: number; surfaceType: string; openTime: string; closeTime: string;
  phone: string | null; description: string | null; imageKey: string | null; createdAt: unknown;
}
export interface CourtRow {
  id: number; venueId: number; courtNumber: string; status: string; createdAt: unknown;
}
export interface RateTierRow {
  id: number; venueId: number; tierName: "daytime" | "nighttime"; startHour: string; endHour: string;
  pricePerHour: string | number;
}
export interface BookingRow {
  id: number; reference: string; courtId: number; venueId: number; playerDate: string;
  startHour: string; endHour: string; playerName: string; contact: string;
  customerAccountId: number | null; channel: string; paymentStatus: string; paymentMethod: string | null;
  dayAmount: string | number; nightAmount: string | number; totalAmount: string | number; promoCodeId: number | null; discountAmount: string | number; playerEmail: string | null; createdAt: unknown;
  /** When an unpaid hold stops holding its court. Null once paid. */
  expiresAt: string | null;
  /** The PayMongo checkout session this booking is being paid through. */
  paymongoSessionId: string | null;
}
export interface AnnouncementRow {
  id: number; venueId: number; title: string; message: string; active: number;
  expireAt: string | null; photoUrl: string | null; kind: string;
  eventDate: string | null; createdAt: unknown; updatedAt: unknown;
}
export interface PromoCodeRow {
  id: number; venueId: number; code: string; discountPct: string | null;
  discountFlat: string | null; minAmount: string | null; maxUses: number | null;
  uses: number; active: number; expiresAt: string | null; createdAt: unknown;
}
export async function listPromoCodesByVenueIds(venueIds: number[]): Promise<PromoCodeRow[]> {
  if (venueIds.length === 0) return [];
  return q("promoCodes")
    .in("venue_id", venueIds)
    .order("created_at", { ascending: false })
    .limit(200)
    .exec() as unknown as Promise<PromoCodeRow[]>;
}
export async function createPromoCode(input: Record<string, unknown>): Promise<PromoCodeRow | undefined> {
  const rows = await q("promoCodes").insert(input);
  return rows[0] as unknown as PromoCodeRow | undefined;
}
export async function updatePromoCode(id: number, set: Record<string, unknown>) {
  await q("promoCodes").eq("id", id).update(set);
}
export async function deletePromoCode(id: number) {
  await q("promoCodes").eq("id", id).del();
}
export async function bumpPromoCodeUses(id: number) {
  // Codes are low-concurrency (single-region app): read-modify-write is safe.
  const cur = await getPromoCodeById(id);
  if (!cur) return;
  await q("promoCodes").eq("id", id).update({ uses: cur.uses + 1 });
}
export async function getPromoCodeById(id: number): Promise<PromoCodeRow | undefined> {
  const rows = await q("promoCodes").eq("id", id).limit(1).exec();
  return rows[0] as unknown as PromoCodeRow | undefined;
}
export interface OwnerCredentialRow {
  id: number; username: string; passwordHash: string; venueId: number | null; createdAt: unknown;
}
export interface CustomerAccountRow {
  id: number; email: string; name: string | null; passwordHash: string; createdAt: unknown;
}
export interface UserRow {
  id: number; openId: string; name: string | null; email: string | null; loginMethod: string | null;
  lastSignedIn: string | null; role: string | null; createdAt: unknown;
}
export interface VenueOwnerRow {
  id: number; userId: number; venueId: number; createdAt: unknown;
}
export interface GalleryRow {
  id: number; venueId: number; imageKey: string; sortOrder: number; createdAt: unknown;
}

// ---------------- Owner credentials ----------------

export async function getOwnerCredentialByUsername(username: string): Promise<OwnerCredentialRow | undefined> {
  const rows = await q("ownerCredentials").eq("username", username).limit(1).exec();
  return rows[0] as unknown as OwnerCredentialRow | undefined;
}

export async function getOwnerCredentialById(id: number): Promise<OwnerCredentialRow | undefined> {
  const rows = await q("ownerCredentials").eq("id", String(id)).limit(1).exec();
  return rows[0] as unknown as OwnerCredentialRow | undefined;
}

export async function listAllOwnerCredentials(): Promise<OwnerCredentialRow[]> {
  return q("ownerCredentials").order("id", { ascending: true }).exec() as unknown as Promise<OwnerCredentialRow[]>;
}

export async function insertOwnerCredential(data: { username: string; passwordHash: string; venueId: number | null }): Promise<number> {
  const rows = await q("ownerCredentials").insert(data);
  return rows[0]?.id as number;
}

export async function updateOwnerCredential(id: number, set: Record<string, unknown>) {
  await q("ownerCredentials").eq("id", String(id)).update(set);
}

export async function deleteOwnerCredential(id: number) {
  await q("ownerCredentials").eq("id", String(id)).del();
}
export async function getOwnerCredentialsByVenue(venueId: number): Promise<OwnerCredentialRow[]> {
  const rows = await q("ownerCredentials").eq("venue_id", String(venueId)).exec();
  return rows as unknown as OwnerCredentialRow[];
}

// ---------------- Customer accounts ----------------

export async function getCustomerAccountByEmail(email: string): Promise<CustomerAccountRow | undefined> {
  const rows = await q("customerAccounts").eq("email", email.toLowerCase()).limit(1).exec();
  return rows[0] as unknown as CustomerAccountRow | undefined;
}

export async function getCustomerAccountById(id: number): Promise<CustomerAccountRow | undefined> {
  const rows = await q("customerAccounts").eq("id", String(id)).limit(1).exec();
  return rows[0] as unknown as CustomerAccountRow | undefined;
}

export async function insertCustomerAccount(data: { email: string; name: string | null; passwordHash: string }): Promise<number> {
  const rows = await q("customerAccounts").insert(data);
  return rows[0]?.id as number;
}

// ---------------- Users (legacy OAuth table) ----------------

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const values: Record<string, unknown> = { openId: user.openId };
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    const v = user[field];
    if (v !== undefined) values[field] = v ?? null;
  }
  if (user.lastSignedIn !== undefined) values.lastSignedIn = user.lastSignedIn;
  if (user.role !== undefined) {
    values.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date().toISOString();
  if (!values.lastSignedIn || Object.keys(values).length <= 2) {
    values.lastSignedIn = new Date().toISOString();
  }
  await q("users").upsert(values);
}

export async function getUserByEmail(email: string): Promise<UserRow | undefined> {
  const rows = await q("users").eq("email", email.toLowerCase()).limit(1).exec();
  return rows[0] as unknown as UserRow | undefined;
}

export async function getUserByOpenId(openId: string): Promise<UserRow | undefined> {
  const rows = await q("users").eq("open_id", openId).limit(1).exec();
  return rows[0] as unknown as UserRow | undefined;
}

// ---------------- Feature queries ----------------

export async function listVenues(): Promise<VenueRow[]> {
  return q("venues").order("name").exec() as unknown as Promise<VenueRow[]>;
}

export async function listGalleryByVenue(venueId: number): Promise<GalleryRow[]> {
  return q("venueGallery").eq("venue_id", venueId).order("sort_order").order("id").exec() as unknown as Promise<GalleryRow[]>;
}

export async function insertGalleryRow(data: Record<string, unknown>) {
  const rows = await q("venueGallery").insert(data);
  return rows[0]?.id as number;
}

export async function removeGalleryRow(id: number) {
  await q("venueGallery").eq("id", id).del();
}

export async function getVenueById(id: number): Promise<VenueRow | undefined> {
  const rows = await q("venues").eq("id", id).limit(1).exec();
  return rows[0] as unknown as VenueRow | undefined;
}

export async function listCourtsByVenue(venueId: number): Promise<CourtRow[]> {
  return q("courts").eq("venue_id", venueId).order("court_number").exec() as unknown as Promise<CourtRow[]>;
}

export async function listCourtsByIds(ids: number[]): Promise<CourtRow[]> {
  if (ids.length === 0) return [];
  return q("courts").in("id", ids).exec() as unknown as Promise<CourtRow[]>;
}

export async function listRateTiersByVenue(venueId: number): Promise<RateTierRow[]> {
  return q("rateTiers").eq("venue_id", venueId).exec() as unknown as Promise<RateTierRow[]>;
}

export async function listRateTiers(): Promise<RateTierRow[]> {
  return q("rateTiers").exec() as unknown as Promise<RateTierRow[]>;
}

/** Bookings for given venue + date (all courts), returns raw rows. */
export async function listBookingsForVenueDate(venueId: number, playerDate: string): Promise<BookingRow[]> {
  return q("bookings")
    .eq("venue_id", venueId)
    .eq("player_date", playerDate)
    .in("payment_status", ["pending", "paid"])
    .order("start_hour")
    .exec() as unknown as Promise<BookingRow[]>;
}

/** All bookings, newest first, with optional channel filter. */
export async function listAllBookings(opts?: { channel?: "online" | "walkin"; limit?: number }): Promise<BookingRow[]> {
  let query = q("bookings").order("created_at", { ascending: false }).limit(opts?.limit ?? 200);
  if (opts?.channel) query = query.eq("channel", opts.channel);
  return query.exec() as unknown as Promise<BookingRow[]>;
}

export async function getBookingByReference(reference: string): Promise<BookingRow | undefined> {
  const rows = await q("bookings").eq("reference", reference).limit(1).exec();
  return rows[0] as unknown as BookingRow | undefined;
}

export async function getBookingById(id: number): Promise<BookingRow | undefined> {
  const rows = await q("bookings").eq("id", id).limit(1).exec();
  return rows[0] as unknown as BookingRow | undefined;
}

/**
 * Find the booking a PayMongo checkout session is paying for.
 *
 * The webhook arrives knowing only the session, so this is how a payment finds
 * its way back to a court. The column is written when the session is created,
 * before the player ever reaches the hosted page.
 */
export async function getBookingByPaymongoSessionId(
  sessionId: string,
): Promise<BookingRow | undefined> {
  const rows = await q("bookings").eq("paymongo_session_id", sessionId).limit(1).exec();
  return rows[0] as unknown as BookingRow | undefined;
}

/** Check for conflicting booking on the same court + date + overlapping hours.
 *  Overlap test is done in-memory: we fetch the day's confirmed bookings for
 *  the court and compare hour ranges (superset-safe for the small daily sets). */
export async function findConflictingBooking(
  venueId: number,
  courtId: number,
  playerDate: string,
  startHour: string,
  endHour: string,
  excludeBookingId?: number,
): Promise<BookingRow | undefined> {
  const start = toMinutesForSlot(startHour);
  const end = toMinutesForSlot(endHour);
  const rows = (await q("bookings")
    .eq("venue_id", venueId)
    .eq("court_id", courtId)
    .eq("player_date", playerDate)
    .in("payment_status", ["pending", "paid"])
    .exec()) as unknown as Array<BookingRow>;
  for (const b of rows) {
    if (b.id === excludeBookingId) continue;
    const s = toMinutesForSlot(b.startHour);
    const e = toMinutesForSlot(b.endHour);
    if (s < end && e > start) return b;
  }
  return undefined;
}

export async function insertBooking(data: Record<string, unknown>) {
  const rows = await q("bookings").insert(data);
  return rows;
}

export async function updateBookingStatus(
  id: number,
  patch: Record<string, unknown>,
) {
  await q("bookings").eq("id", id).update(patch);
}

/**
 * Record which PayMongo session is paying for a booking, and how long the
 * court stays held while the player pays.
 *
 * Written before the player ever reaches the hosted page, because the webhook
 * arrives knowing only the session id and this is the only way back to a court.
 */
export async function attachCheckoutSession(
  id: number,
  sessionId: string,
  expiresAt: Date,
) {
  await q("bookings")
    .eq("id", id)
    .update({ paymongoSessionId: sessionId, expiresAt: expiresAt.toISOString() });
}

/**
 * Release the courts held by holds that ran out.
 *
 * Scope this to a court and date wherever the caller already knows them. The
 * unscoped form rewrites every lapsed row in the table, and it sits on the
 * public availability path, so an unscoped sweep runs for anybody loading a
 * schedule page.
 */
export async function expireStaleHolds(
  now: Date = new Date(),
  scope?: { courtId?: number; venueId?: number; playerDate: string },
): Promise<BookingRow[]> {
  let query = q("bookings")
    .eq("payment_status", "pending")
    .lt("expires_at", now.toISOString());
  if (scope) {
    query = query.eq("player_date", scope.playerDate);
    if (scope.courtId !== undefined) query = query.eq("court_id", scope.courtId);
    if (scope.venueId !== undefined) query = query.eq("venue_id", scope.venueId);
  }
  const expired = (await query.update({ paymentStatus: "expired" })) as unknown as BookingRow[];
  return expired ?? [];
}

/** Convert "HH:MM" to minutes since midnight (for slot expansion). */
export function toMinutesForSlot(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Convert minutes since midnight to "HH:MM". */
export function hhmmFromMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export async function getCourtById(courtId: number): Promise<CourtRow | undefined> {
  const rows = await q("courts").eq("id", courtId).limit(1).exec();
  return rows[0] as unknown as CourtRow | undefined;
}

export async function listVenuesByIds(ids: number[]): Promise<VenueRow[]> {
  return q("venues").in("id", ids).order("name").exec() as unknown as Promise<VenueRow[]>;
}

export async function updateRateTier(tierId: number, patch: Record<string, unknown>) {
  await q("rateTiers").eq("id", tierId).update(patch);
}

/** Add a court, refusing duplicate court numbers at the same venue. */
export async function addCourt(venueId: number, courtNumber: string) {
  const existing = await q("courts").eq("venue_id", venueId).eq("court_number", courtNumber).exec();
  if (existing.length > 0) throw new Error(`A court named "${courtNumber}" already exists at this venue`);
  await q("courts").insert({ venueId, courtNumber });
  return { success: true } as const;
}

export async function removeCourt(courtId: number) {
  const court = await getCourtById(courtId);
  if (!court) throw new Error("Court not found");
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const withBookings = (await q("bookings")
    .eq("court_id", courtId)
    .gte("player_date", today)
    .in("payment_status", ["pending", "paid"])
    .limit(1)
    .exec()) as Array<Record<string, unknown>>;
  if (withBookings.length > 0) throw new Error("This court has upcoming bookings — cancel them first");
  await q("courts").eq("id", courtId).del();
  return { success: true } as const;
}

export async function setCourtStatus(courtId: number, status: "available" | "maintenance") {
  await q("courts").eq("id", courtId).update({ status });
}

// ---------------- Player / Owner role helpers ----------------

export async function listOwnerVenueIds(userId: number) {
  const rows = (await q("venueOwners").eq("user_id", userId).exec()) as Array<Record<string, unknown> & { venueId: number }>;
  return rows.map(r => r.venueId);
}

export async function listOwnerVenues(userId: number): Promise<VenueRow[]> {
  const ids = await listOwnerVenueIds(userId);
  if (ids.length === 0) return [];
  return q("venues").in("id", ids).order("name").exec() as unknown as Promise<VenueRow[]>;
}

export async function setRole(userId: number, role: "user" | "admin" | "player" | "owner") {
  await q("users").eq("id", userId).update({ role });
}

export async function grantVenueOwnership(userId: number, venueId: number) {
  const existing = await q("venueOwners").eq("user_id", userId).eq("venue_id", venueId).exec();
  if (existing.length > 0) return;
  await q("venueOwners").insert({ userId, venueId });
  await setRole(userId, "owner");
}

export async function listAllOwners() {
  const rows = (await q("venueOwners").select("id, venue_id, user_id, created_at").exec()) as Array<Record<string, unknown> & { venue_id: number; user_id: number; created_at: string | null }>;
  const enriched = await Promise.all(
    rows.map(async r => {
      const u = (await q("users").eq("id", r.user_id).limit(1).select("id, name, email").exec()) as Array<Record<string, unknown> & { name?: string | null; email?: string | null }>;
      return {
        id: r.id,
        venueId: r.venue_id,
        userId: r.user_id,
        createdAt: r.created_at ?? null,
        ownerName: u[0]?.name ?? null,
        ownerEmail: u[0]?.email ?? null,
      };
    }),
  );
  return enriched;
}

/** Bookings the player made (matched by contact or playerName against given text).
 *  PostgREST has no OR across columns, so we fetch the confirmed set and filter
 *  in memory (bounded to the 200 most recent rows). */
export async function listPlayerBookings(identifier: string): Promise<BookingRow[]> {
  const term = identifier.trim();
  if (!term) return [];
  const rows = (await q("bookings")
    .in("payment_status", ["pending", "paid"])
    .order("created_at", { ascending: false })
    .limit(200)
    .exec()) as unknown as Array<BookingRow & { contact?: string | null; playerName?: string | null; reference?: string }>;
  return rows.filter(b =>
    String(b.contact ?? "").includes(term) ||
    String(b.playerName ?? "").includes(term) ||
    b.reference === term,
  );
}

/** All bookings scoped to the venues an owner manages. */
export async function listOwnerBookings(venueIds: number[], opts?: { channel?: "online" | "walkin"; limit?: number }) {
  if (venueIds.length === 0) return [];
  let query = q("bookings")
    .in("venue_id", venueIds)
    .in("payment_status", ["pending", "paid"])
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 500);
  if (opts?.channel) query = query.eq("channel", opts.channel);
  return query.exec() as unknown as Promise<BookingRow[]>;
}

// ---------------- Test helpers (Supabase REST) ----------------

export async function deleteBookingsByDate(playerDate: string) {
  await deleteWhere("bookings", [c => c.eq("player_date", playerDate)]);
}

export async function deleteBookingsByReferencePattern(pattern: string) {
  await deleteWhere("bookings", [c => c.like("reference", pattern)]);
}

export async function deleteBookingsById(id: number) {
  await q("bookings").eq("id", id).del();
}

export async function deleteAnnouncementsAll() {
  await deleteWhere("announcements", []);
}

export async function deleteAnnouncementsByVenue(venueId: number) {
  await deleteWhere("announcements", [c => c.eq("venue_id", String(venueId))]);
}

export async function deleteCourtsByNumber(courtNumber: string) {
  await deleteWhere("courts", [c => c.eq("court_number", courtNumber)]);
}

export async function deleteVenueOwnersAll() {
  await deleteWhere("venue_owners", []);
}

export async function deleteOwnerCredentialsByPattern(usernamePattern: string) {
  await deleteWhere("owner_credentials", [c => c.like("username", usernamePattern)]);
}

/** Cascade-cleanup of leftover test venues (all dependents + owner logins), ignoring block errors. */
export async function deleteVenuesByNamePattern(pattern: string) {
  try {
    const rows = (await q("venues").like("name", pattern).select("id").exec()) as Array<{ id: number }>;
    console.error("[cleanup] deleting venues matching:", pattern, rows.map(r => r.id));
    for (const v of rows) {
      await q("rateTiers").eq("venue_id", v.id).del();
      await q("venueGallery").eq("venue_id", v.id).del();
      await q("announcements").eq("venue_id", v.id).del();
      await q("venueOwners").eq("venue_id", v.id).del();
      await q("courts").eq("venue_id", v.id).del();
      await q("bookings").eq("venue_id", v.id).del();
      await q("reviews").eq("venue_id", v.id).del();
      await deleteWhere("owner_credentials", [c => c.eq("venue_id", String(v.id))]);
      await q("venues").eq("id", v.id).del();
    }
  } catch (err) {
    console.error("[cleanup] deleteVenuesByNamePattern failed:", err);
  }
}

export async function deleteCustomerAccountsByEmail(email: string) {
  await deleteWhere("customer_accounts", [c => c.eq("email", email)]);
}

export async function deleteUserByOpenId(openId: string) {
  await deleteWhere("users", [c => c.eq("open_id", openId)]);
}

/** Generate a unique reference like DV-PB-8A3K. */
export async function generateReference(): Promise<string> {
  let ref: string;
  let attempts = 0;
  do {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    let code = "DV-PB-";
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    ref = code;
    attempts++;
    if (attempts > 10) throw new Error("Failed to generate unique reference");
  } while ((await getBookingByReference(ref)) !== undefined);
  return ref;
}

/* ───────────── Announcements ───────────── */

/** Active, non-expired announcements for public display, optionally scoped to specific venues. */
export async function listActiveAnnouncements(venueIds?: number[]): Promise<AnnouncementRow[]> {
  const now = new Date();
  const expiredAt = now.toISOString();
  let query = q("announcements")
    .eq("active", 1)
    .or("expire_at.is.null,expire_at.gt." + expiredAt)
    .order("created_at", { ascending: false });
  if (venueIds && venueIds.length > 0) query = query.in("venue_id", venueIds);
  return query.exec() as unknown as Promise<AnnouncementRow[]>;
}

/** All announcements (incl. inactive/expired) scoped to a set of venue ids, for the owner UI. */
export async function listVenueAnnouncements(venueIds: number[]): Promise<AnnouncementRow[]> {
  if (venueIds.length === 0) return [];
  return q("announcements")
    .in("venue_id", venueIds)
    .order("created_at", { ascending: false })
    .limit(200)
    .exec() as unknown as Promise<AnnouncementRow[]>;
}

export async function createAnnouncement(input: Record<string, unknown>) {
  const rows = await q("announcements").insert(input);
  const row = rows[0];
  if (!row) {
    const found = await q("announcements").eq("title", input.title as string).limit(1).exec();
    return found[0];
  }
  return row;
}

export async function updateAnnouncement(id: number, set: Record<string, unknown>) {
  const rows = await q("announcements").eq("id", id).update(set);
  return rows;
}

export async function deleteAnnouncement(id: number) {
  await q("announcements").eq("id", id).del();
}

// ---------------- Venue management (master admin) ----------------

export async function createVenue(
  data: Record<string, unknown>,
  initialCourts: number,
  rates: { tierName: "daytime" | "nighttime"; startHour: string; endHour: string; pricePerHour: string }[],
) {
  // Refuse duplicate venue name (case-insensitive) — fetch all venues and compare.
  const all = (await q("venues").exec()) as Array<Record<string, unknown> & { name: string }>;
  if (all.some(v => String(v.name).toLowerCase() === String(data.name).toLowerCase())) {
    throw new Error(`A venue named "${data.name}" already exists`);
  }
  // Strip keys that are not columns of the venues table (rates/courtCount/image are handled separately).
  const venueData: Record<string, unknown> = {};
  const venueCols = ["name", "address", "district", "court_count", "surface_type", "open_time", "close_time", "phone", "description", "image_key"];
  for (const [k, v] of Object.entries(data)) {
    if (k === "courtCount" || k === "dayRate" || k === "nightRate") continue;
    venueData[k === "court_count" ? "court_count" : k.replace(/[A-Z]/g, m => `_${m.toLowerCase()}`)] = v;
  }
  const inserted = await q("venues").insert(venueData);
  const venueId = inserted[0]?.id as number;
  const count = Math.max(1, Math.min(20, Math.floor(initialCourts as number) || 1));
  for (let i = 1; i <= count; i++) {
    await q("courts").insert({ venueId, courtNumber: `Court ${i}` });
  }
  if (rates.length > 0) {
    await q("rateTiers").insert(
      rates.map(r => ({ venueId, tierName: r.tierName, startHour: r.startHour, endHour: r.endHour, pricePerHour: r.pricePerHour })),
    );
  } else {
    await q("rateTiers").insert({ venueId, tierName: "daytime", startHour: data.openTime || "06:00", endHour: data.closeTime || "22:00", pricePerHour: "100.00" });
  }
  return { venueId };
}

export async function updateVenue(venueId: number, data: Record<string, unknown>) {
  const venue = await getVenueById(venueId);
  if (!venue) throw new Error("Venue not found");
  if (data.name) {
    const all = (await q("venues").exec()) as Array<Record<string, unknown> & { id: number; name: string }>;
    if (all.some(v => v.id !== venueId && String(v.name).toLowerCase() === String(data.name).toLowerCase())) {
      throw new Error(`A venue named "${data.name}" already exists`);
    }
  }
  await q("venues").eq("id", venueId).update(data);
  return { success: true } as const;
}

export async function deleteVenue(venueId: number) {
  const venue = await getVenueById(venueId);
  if (!venue) throw new Error("Venue not found");
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const withBookings = (await q("bookings")
    .eq("venue_id", venueId)
    .gte("player_date", today)
    .in("payment_status", ["pending", "paid"])
    .limit(1)
    .exec()) as Array<Record<string, unknown>>;
  if (withBookings.length > 0) throw new Error("This venue has upcoming bookings or paid reservations — cancel or wait for them to pass");
  await q("rateTiers").eq("venue_id", venueId).del();
  await q("venueGallery").eq("venue_id", venueId).del();
  await q("announcements").eq("venue_id", venueId).del();
  await q("venueOwners").eq("venue_id", venueId).del();
  await q("courts").eq("venue_id", venueId).del();
  await q("bookings").eq("venue_id", venueId).del();
  await q("reviews").eq("venue_id", venueId).del();
  await deleteWhere("owner_credentials", [chain => chain.eq("venue_id", String(venueId))]);
  await q("venues").eq("id", venueId).del();
  return { success: true } as const;
}

/* ───────────── Reviews ───────────── */

export interface ReviewRow {
  id: number; venueId: number; playerName: string; playerEmail: string | null;
  rating: number; comment: string; bookingRef: number | null; createdAt: unknown;
}

export async function createReview(data: {
  venueId: number; playerName: string; playerEmail?: string | null;
  rating: number; comment: string; bookingRef?: number | null;
}): Promise<ReviewRow> {
  const rows = await q("reviews").insert({
    venueId: data.venueId, playerName: data.playerName,
    playerEmail: data.playerEmail ?? null, rating: data.rating,
    comment: data.comment.trim(), bookingRef: data.bookingRef ?? null,
  });
  return rows[0] as unknown as ReviewRow;
}

export async function listVenueReviews(venueId: number, limit = 50): Promise<ReviewRow[]> {
  return (await q("reviews").eq("venue_id", venueId).order("created_at", { ascending: false }).limit(limit).exec()) as unknown as ReviewRow[];
}

export async function listAllReviews(limit = 200): Promise<ReviewRow[]> {
  return (await q("reviews").order("created_at", { ascending: false }).limit(limit).exec()) as unknown as ReviewRow[];
}

export async function listReviewsForVenues(venueIds: number[], limit = 100): Promise<ReviewRow[]> {
  if (venueIds.length === 0) return [];
  return (await q("reviews").in("venue_id", venueIds).order("created_at", { ascending: false }).limit(limit).exec()) as unknown as ReviewRow[];
}

export async function venueReviewStats(venueId: number): Promise<{ average: number; count: number }> {
  const rows = await q("reviews").select("rating").eq("venue_id", venueId).execRaw();
  const ratings = rows.map(r => Number(r.rating ?? 0));
  const count = ratings.length;
  const average = count === 0 ? 0 : Math.round((ratings.reduce((a, b) => a + b, 0) / count) * 10) / 10;
  return { average, count };
}

export async function allVenueReviewStats(): Promise<Record<number, { average: number; count: number }>> {
  const rows = await q("reviews").select("venue_id,rating").execRaw();
  const byVenue: Record<number, number[]> = {};
  for (const r of rows) {
    const v = Number(r.venue_id ?? 0);
    if (!v) continue;
    (byVenue[v] ??= []).push(Number(r.rating ?? 0));
  }
  const out: Record<number, { average: number; count: number }> = {};
  for (const [v, ratings] of Object.entries(byVenue)) {
    out[Number(v)] = {
      average: Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10,
      count: ratings.length,
    };
  }
  return out;
}

export async function deleteReviewsByVenue(venueId: number) {
  await q("reviews").eq("venue_id", venueId).del();
}

export async function deleteReviewsAll() {
  await q("reviews").del();
}

/** Delete reviews whose player name starts with the given test prefix (safe, scoped cleanup). */
export async function deleteReviewsByPlayerNamePrefix(prefix: string) {
  await q("reviews").like("player_name", `${prefix}%`).del();
}

/* ───────────── Review replies ───────────── */

export interface ReviewReplyRow {
  id: number; reviewId: number; ownerUserId: number; body: string; createdAt: unknown;
}

export async function createReviewReply(reviewId: number, ownerUserId: number, body: string): Promise<ReviewReplyRow> {
  const rows = await q("reviewReplies").insert({ reviewId, ownerUserId, body: body.trim() });
  return rows[0] as unknown as ReviewReplyRow;
}

export async function listRepliesForReviews(reviewIds: number[]): Promise<ReviewReplyRow[]> {
  if (reviewIds.length === 0) return [];
  return (await q("reviewReplies").in("review_id", reviewIds).order("created_at", { ascending: false }).exec()) as unknown as ReviewReplyRow[];
}

export async function deleteRepliesForReview(reviewId: number) {
  await q("reviewReplies").eq("review_id", reviewId).del();
}

/* ───────────── Staff (multi-login per venue) ───────────── */

export interface StaffRow {
  id: number; userId: number; venueId: number; role: string; createdAt: unknown;
}
export interface StaffRowWithUser extends StaffRow {
  userName: string | null; userEmail: string | null;
}

export async function addStaff(userId: number, venueId: number, role = "staff"): Promise<StaffRow> {
  const rows = await q("staff").insert({ userId, venueId, role });
  return rows[0] as unknown as StaffRow;
}

export async function removeStaff(userId: number, venueId: number) {
  await q("staff").eq("user_id", userId).eq("venue_id", venueId).del();
}

export async function listVenueStaff(venueIds: number[]): Promise<StaffRowWithUser[]> {
  if (venueIds.length === 0) return [];
  const staffRows = (await q("staff").in("venue_id", venueIds).order("created_at", { ascending: true }).exec()) as unknown as StaffRow[];
  const userIds = Array.from(new Set(staffRows.map(s => s.userId)));
  const byId = new Map<number, { id: number; name: string | null; email: string | null }>();
  // PostgREST `in` filters work best in modest batches.
  for (let i = 0; i < userIds.length; i += 50) {
    const users = (await q("users").select("id,name,email").in("id", userIds.slice(i, i + 50)).exec()) as unknown as Array<{ id: number; name: string | null; email: string | null }>;
    for (const u of users) byId.set(u.id, u);
  }
  return staffRows.map(s => ({
    ...s,
    userName: byId.get(s.userId)?.name ?? null,
    userEmail: byId.get(s.userId)?.email ?? null,
  }));
}

export async function getStaff(userId: number, venueId: number): Promise<StaffRow | undefined> {
  const rows = await q("staff").eq("user_id", userId).eq("venue_id", venueId).limit(1).exec();
  return rows[0] as unknown as StaffRow | undefined;
}

/* ───────────── Memberships & member accounts ───────────── */

export interface MembershipRow {
  id: number; venueId: number; name: string; description: string | null; price: string;
  credits: number; validityDays: number; active: boolean; createdAt: unknown;
}

export async function createMembership(data: { venueId: number; name: string; description?: string | null; price: string; credits?: number; validityDays?: number }): Promise<MembershipRow> {
  const rows = await q("memberships").insert({
    venueId: data.venueId, name: data.name, description: data.description ?? null,
    price: data.price, credits: data.credits ?? 1, validityDays: data.validityDays ?? 30, active: true,
  });
  return rows[0] as unknown as MembershipRow;
}

export async function updateMembership(id: number, set: Record<string, unknown>) {
  await q("memberships").eq("id", id).update(set);
}

export async function deleteMembership(id: number) {
  await q("memberships").eq("id", id).del();
}

export async function listMembershipsByVenue(venueId: number): Promise<MembershipRow[]> {
  return (await q("memberships").eq("venue_id", venueId).order("created_at", { ascending: true }).exec()) as unknown as MembershipRow[];
}

export interface MemberAccountRow {
  id: number; customerAccountId: number | null; phone: string | null; name: string;
  membershipId: number; creditsRemaining: number; expiresAt: string | null; createdAt: unknown;
}

export async function createMemberAccount(data: { name: string; phone?: string | null; membershipId: number }): Promise<MemberAccountRow> {
  const membership = (await q("memberships").eq("id", data.membershipId).limit(1).exec()) as unknown as Array<MembershipRow>;
  const plan = membership[0];
  if (!plan) throw new Error("Membership plan not found");
  const rows = await q("memberAccounts").insert({
    name: data.name, phone: data.phone ?? null, membershipId: data.membershipId,
    creditsRemaining: plan.credits,
    expiresAt: new Date(Date.now() + plan.validityDays * 86400000).toISOString(),
  });
  return rows[0] as unknown as MemberAccountRow;
}

export async function listMemberAccountsByVenue(venueId: number): Promise<MemberAccountRow[]> {
  const memberships = await listMembershipsByVenue(venueId);
  if (memberships.length === 0) return [];
  return (await q("memberAccounts").in("membership_id", memberships.map(m => m.id)).order("created_at", { ascending: false }).exec()) as unknown as MemberAccountRow[];
}

export async function listMembershipsWithAccounts(venueId: number): Promise<Array<MembershipRow & { memberCount: number; totalCreditsRemaining: number }>> {
  const plans = await listMembershipsByVenue(venueId);
  const accounts = await listMemberAccountsByVenue(venueId);
  const byPlan: Record<number, { memberCount: number; totalCreditsRemaining: number }> = {};
  for (const a of accounts) {
    const p = byPlan[a.membershipId] ??= { memberCount: 0, totalCreditsRemaining: 0 };
    p.memberCount += 1;
    p.totalCreditsRemaining += a.creditsRemaining;
  }
  return plans.map(p => ({ ...p, memberCount: byPlan[p.id]?.memberCount ?? 0, totalCreditsRemaining: byPlan[p.id]?.totalCreditsRemaining ?? 0 }));
}

/** Redeem one credit for the account; returns {ok, newRemaining, expired}. */
export async function redeemMemberCredit(accountId: number): Promise<{ ok: boolean; newRemaining: number; expired: boolean; membershipName: string }> {
  const rows = (await q("memberAccounts").eq("id", accountId).limit(1).exec()) as unknown as MemberAccountRow[];
  const account = rows[0];
  if (!account) throw new Error("Member account not found");
  if (account.expiresAt && new Date(account.expiresAt) < new Date()) {
    return { ok: false, newRemaining: 0, expired: true, membershipName: "" };
  }
  if (account.creditsRemaining <= 0) return { ok: false, newRemaining: 0, expired: false, membershipName: "" };
  const memberships = (await q("memberships").eq("id", account.membershipId).limit(1).exec()) as unknown as MembershipRow[];
  await q("memberAccounts").eq("id", accountId).update({ creditsRemaining: account.creditsRemaining - 1 });
  return { ok: true, newRemaining: account.creditsRemaining - 1, expired: false, membershipName: memberships[0]?.name ?? "" };
}

/* ───────────── Waitlist ───────────── */

export interface WaitlistRow {
  id: number; venueId: number; courtId: number; playerDate: string; startHour: string;
  endHour: string; playerName: string; contact: string | null; notified: boolean; notifiedAt: string | null; createdAt: unknown;
}

export async function joinWaitlist(data: { venueId: number; courtId: number; playerDate: string; startHour: string; endHour: string; playerName: string; contact?: string | null }): Promise<WaitlistRow> {
  const rows = await q("waitlist").insert({
    venueId: data.venueId, courtId: data.courtId, playerDate: data.playerDate,
    startHour: data.startHour, endHour: data.endHour, playerName: data.playerName,
    contact: data.contact ?? null,
  });
  return rows[0] as unknown as WaitlistRow;
}

export async function removeFromWaitlist(id: number) {
  await q("waitlist").eq("id", id).del();
}

export async function listWaitlistForSlot(venueId: number, courtId: number, playerDate: string, startHour: string, endHour: string): Promise<WaitlistRow[]> {
  return (await q("waitlist")
    .eq("venue_id", venueId).eq("court_id", courtId).eq("player_date", playerDate)
    .eq("start_hour", startHour).eq("end_hour", endHour)
    .order("created_at", { ascending: true }).exec()) as unknown as WaitlistRow[];
}

export interface WaitlistRowWithVenue extends WaitlistRow {
  venueName: string; courtNumber: string;
}
export async function listWaitlistForVenue(venueId: number): Promise<WaitlistRowWithVenue[]> {
  const venue = await getVenueById(venueId);
  const venueName = venue?.name ?? `Venue #${venueId}`;
  const rows = (await q("waitlist").eq("venue_id", venueId).order("created_at", { ascending: true }).exec()) as unknown as WaitlistRow[];
  const courts = await listCourtsByVenue(venueId);
  const byCourt = new Map(courts.map(c => [c.id, c.courtNumber]));
  return rows.map(w => ({ ...w, venueName, courtNumber: byCourt.get(w.courtId) ?? String(w.courtId) }));
}

export async function listMyWaitlist(playerName: string): Promise<WaitlistRow[]> {
  const term = playerName.trim();
  if (!term) return [];
  const rows = (await q("waitlist").order("created_at", { ascending: false }).limit(200).exec()) as unknown as WaitlistRow[];
  return rows.filter(w => String(w.playerName ?? "").toLowerCase().includes(term.toLowerCase()));
}

export async function markWaitlistNotified(id: number) {
  await q("waitlist").eq("id", id).update({ notified: true, notifiedAt: new Date().toISOString() });
}

/* ───────────── Owner notifications ───────────── */

/** Unread new bookings (seen_by_owner = false) for venues the owner manages.
 *  Only counts bookings from the last 7 days so historical data never floods the bell. */
export async function countUnreadBookings(venueIds: number[]): Promise<number> {
  if (venueIds.length === 0) return 0;
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const rows = await q("bookings").select("id").in("venue_id", venueIds).eq("seen_by_owner", false).gte("created_at", since).execRaw();
  return Array.isArray(rows) ? rows.length : 0;
}

export async function markBookingsSeen(venueIds: number[]) {
  if (venueIds.length === 0) return;
  await q("bookings").in("venue_id", venueIds).eq("seen_by_owner", false).update({ seenByOwner: true });
}

export interface UnreadBookingRow extends BookingRow {
  venueName: string;
  courtNumber: string | null;
}
export async function listUnreadBookings(venueIds: number[], limit = 20): Promise<UnreadBookingRow[]> {
  if (venueIds.length === 0) return [];
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const rows = (await q("bookings")
    .in("venue_id", venueIds).eq("seen_by_owner", false).gte("created_at", since)
    .order("created_at", { ascending: false }).limit(limit)
    .exec()) as unknown as BookingRow[];
  const venues = await listVenuesByIds(venueIds);
  const byVenue = new Map(venues.map(v => [v.id, v.name]));
  const courtIds = Array.from(new Set(rows.map(b => b.courtId)));
  const courts = courtIds.length ? await listCourtsByIds(courtIds) : [];
  const byCourt = new Map(courts.map(c => [c.id, c.courtNumber]));
  return rows.map(b => ({
    ...b,
    venueName: byVenue.get(b.venueId) ?? `Venue #${b.venueId}`,
    courtNumber: byCourt.get(b.courtId) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Event attendance (RSVP)
// ---------------------------------------------------------------------------

export async function toggleAttendance(input: {
  announcementId: number;
  playerName: string;
  contact?: string | null;
}): Promise<{ joined: boolean; count: number }> {
  const existing = (await q("eventAttendance")
    .eq("player_name", input.playerName)
    .eq("announcement_id", input.announcementId)
    .limit(1)
    .exec()) as unknown as Row[];
  if (existing.length > 0) {
    await q("eventAttendance")
      .eq("player_name", input.playerName)
      .eq("announcement_id", input.announcementId)
      .del();
    const count = await attendanceCount(input.announcementId);
    return { joined: false, count };
  }
  await q("eventAttendance").insert({
    announcementId: input.announcementId,
    playerName: input.playerName,
    contact: input.contact ?? null,
  });
  const count = await attendanceCount(input.announcementId);
  return { joined: true, count };
}

async function attendanceCount(announcementId: number): Promise<number> {
  const rows = await q("eventAttendance")
    .eq("announcement_id", announcementId)
    .exec();
  return rows.length;
}

export async function listAttendanceByAnnouncementIds(ids: number[]): Promise<Record<number, Row[]>> {
  if (ids.length === 0) return {};
  const rows = await q("eventAttendance")
    .in("announcement_id", ids)
    .order("id", { ascending: false })
    .exec();
  const byAnn: Record<number, Row[]> = {};
  for (const r of rows) {
    const key = Number(r.announcementId ?? 0);
    (byAnn[key] ??= []).push(r);
  }
  return byAnn;
}

export async function getAnnouncementById(id: number): Promise<AnnouncementRow | undefined> {
  const rows = await q("announcements").eq("id", id).limit(1).exec();
  return rows[0] as unknown as AnnouncementRow | undefined;
}

export async function deleteAttendanceByPlayerNamePrefix(prefix: string) {
  await deleteWhere("eventAttendance", [q => q.ilike("player_name", `${prefix}%`)]);
}

export async function deleteBookingsByPlayerNamePrefix(prefix: string) {
  await deleteWhere("bookings", [q => q.ilike("player_name", `${prefix}%`)]);
}

export async function deleteAnnouncementsById(id: number) {
  await deleteWhere("announcements", [q => q.eq("id", id)]);
}
