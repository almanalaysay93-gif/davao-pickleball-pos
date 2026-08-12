import { and, asc, desc, eq, gte, inArray, like, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  announcements,
  bookings,
  courts,
  InsertAnnouncement,
  InsertBooking,
  InsertRateTier,
  InsertUser,
  rateTiers,
  users,
  venues,
  venueOwners,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  return rows[0];
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ---------------- Feature queries ----------------

export async function listVenues() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(venues).orderBy(asc(venues.name));
}

export async function getVenueById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(venues).where(eq(venues.id, id)).limit(1);
  return rows[0];
}

export async function listCourtsByVenue(venueId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(courts).where(eq(courts.venueId, venueId)).orderBy(asc(courts.courtNumber));
}

export async function listRateTiersByVenue(venueId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(rateTiers).where(eq(rateTiers.venueId, venueId));
}

export async function listRateTiers() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(rateTiers);
}

/** Bookings for given venue + date (all courts), returns raw rows. */
export async function listBookingsForVenueDate(venueId: number, playerDate: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.venueId, venueId),
        eq(bookings.playerDate, playerDate),
        inArray(bookings.paymentStatus, ["pending", "paid"]),
      ),
    )
    .orderBy(asc(bookings.startHour));
}

/** All bookings, newest first, with optional channel filter. */
export async function listAllBookings(opts?: { channel?: "online" | "walkin"; limit?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const conditions = [];
  if (opts?.channel) conditions.push(eq(bookings.channel, opts.channel));
  return db
    .select()
    .from(bookings)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(bookings.createdAt))
    .limit(opts?.limit ?? 200);
}

export async function getBookingByReference(reference: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
  return rows[0];
}

export async function getBookingById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
  return rows[0];
}

/** Check for conflicting booking on the same court + date + overlapping hours. */
export async function findConflictingBooking(
  venueId: number,
  courtId: number,
  playerDate: string,
  startHour: string,
  endHour: string,
  excludeBookingId?: number,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.venueId, venueId),
        eq(bookings.courtId, courtId),
        eq(bookings.playerDate, playerDate),
        inArray(bookings.paymentStatus, ["pending", "paid"]),
        sql`${bookings.startHour} < ${endHour}`,
        sql`${bookings.endHour} > ${startHour}`,
        ...(excludeBookingId ? [sql`${bookings.id} != ${excludeBookingId}`] : []),
      ),
    )
    .limit(1);
}

export async function insertBooking(data: InsertBooking) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(bookings).values(data);
  return result;
}

export async function updateBookingStatus(
  id: number,
  patch: Partial<
    Pick<
      InsertBooking,
      | "paymentStatus"
      | "paymentMethod"
      | "playerName"
      | "contact"
      | "dayAmount"
      | "nightAmount"
      | "totalAmount"
      | "courtId"
      | "playerDate"
      | "startHour"
      | "endHour"
    >
  >,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(bookings).set(patch).where(eq(bookings.id, id));
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

export async function getCourtById(courtId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(courts).where(eq(courts.id, courtId)).limit(1);
  return rows[0];
}

export async function listVenuesByIds(ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(venues).where(inArray(venues.id, ids)).orderBy(asc(venues.name));
}

export async function updateRateTier(tierId: number, patch: Pick<InsertRateTier, "pricePerHour">) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(rateTiers).set(patch).where(eq(rateTiers.id, tierId));
}

/** Update court operational status. */
export async function setCourtStatus(courtId: number, status: "available" | "maintenance") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(courts).set({ status }).where(eq(courts.id, courtId));
}

// ---------------- Player / Owner role helpers ----------------

export async function listOwnerVenueIds(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(venueOwners).where(eq(venueOwners.userId, userId));
  return rows.map(r => r.venueId);
}

export async function listOwnerVenues(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const ids = await listOwnerVenueIds(userId);
  if (ids.length === 0) return [];
  return db.select().from(venues).where(inArray(venues.id, ids)).orderBy(asc(venues.name));
}

export async function setRole(userId: number, role: "user" | "admin" | "player" | "owner") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function grantVenueOwnership(userId: number, venueId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(venueOwners).where(and(eq(venueOwners.userId, userId), eq(venueOwners.venueId, venueId)));
  if (existing.length > 0) return;
  await db.insert(venueOwners).values({ userId, venueId });
  await setRole(userId, "owner");
}

/** Bookings the player made (matched by contact or playerName against given text). */
export async function listPlayerBookings(identifier: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const term = identifier.trim();
  if (!term) return [];
  return db
    .select()
    .from(bookings)
    .where(
      and(
        inArray(bookings.paymentStatus, ["pending", "paid"]),
        or(like(bookings.contact, `%${term}%`), like(bookings.playerName, `%${term}%`)),
      ),
    )
    .orderBy(desc(bookings.createdAt))
    .limit(200);
}

/** All bookings scoped to the venues an owner manages. */
export async function listOwnerBookings(venueIds: number[], opts?: { channel?: "online" | "walkin"; limit?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (venueIds.length === 0) return [];
  const conditions = [inArray(bookings.venueId, venueIds), inArray(bookings.paymentStatus, ["pending", "paid"])];
  if (opts?.channel) conditions.push(eq(bookings.channel, opts.channel));
  return db
    .select()
    .from(bookings)
    .where(and(...conditions))
    .orderBy(desc(bookings.createdAt))
    .limit(opts?.limit ?? 500);
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
export async function listActiveAnnouncements(venueIds?: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const now = new Date();
  const conditions = [eq(announcements.active, 1), sql`${announcements.expireAt} IS NULL OR ${gte(announcements.expireAt, now)}`];
  if (venueIds && venueIds.length > 0) {
    conditions.push(inArray(announcements.venueId, venueIds));
  }
  return db.select().from(announcements).where(and(...conditions)).orderBy(desc(announcements.createdAt));
}

/** All announcements (incl. inactive/expired) scoped to a set of venue ids, for the owner UI. */
export async function listVenueAnnouncements(venueIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (venueIds.length === 0) return [];
  return db
    .select()
    .from(announcements)
    .where(inArray(announcements.venueId, venueIds))
    .orderBy(desc(announcements.createdAt))
    .limit(200);
}

export async function createAnnouncement(input: InsertAnnouncement) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(announcements).values(input);
  const id = (result as unknown as [{ insertId: number }])[0]?.insertId;
  if (!id) {
    // Fallback: fetch the row with the same title inserted last.
    const rows = await db
      .select()
      .from(announcements)
      .where(eq(announcements.title, input.title))
      .orderBy(desc(announcements.id))
      .limit(1);
    return rows[0];
  }
  const rows = await db.select().from(announcements).where(eq(announcements.id, id)).limit(1);
  return rows[0];
}

export async function updateAnnouncement(id: number, set: Partial<InsertAnnouncement>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.update(announcements).set(set).where(eq(announcements.id, id));
}

export async function deleteAnnouncement(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.delete(announcements).where(eq(announcements.id, id));
}
