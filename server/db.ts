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
  InsertVenueGallery,
  rateTiers,
  users,
  venues,
  venueGallery,
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

export async function listGalleryByVenue(venueId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(venueGallery).where(eq(venueGallery.venueId, venueId)).orderBy(asc(venueGallery.sortOrder), asc(venueGallery.id));
}

export async function insertGalleryRow(data: InsertVenueGallery) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [res] = await db.insert(venueGallery).values(data);
  return (res as any).insertId as number;
}

export async function removeGalleryRow(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(venueGallery).where(eq(venueGallery.id, id));
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
export async function addCourt(venueId: number, courtNumber: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(courts).where(and(eq(courts.venueId, venueId), eq(courts.courtNumber, courtNumber)));
  if (existing.length > 0) throw new Error(`A court named "${courtNumber}" already exists at this venue`);
  await db.insert(courts).values({ venueId, courtNumber });
  return { success: true } as const;
}

export async function removeCourt(courtId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const court = await getCourtById(courtId);
  if (!court) throw new Error("Court not found");
  // Refuse if the court has bookings on today or any future date.
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const withBookings = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.courtId, courtId),
        sql`${bookings.playerDate} >= ${today}`,
        inArray(bookings.paymentStatus, ["pending", "paid"]),
      ),
    );
  if (withBookings.length > 0) throw new Error("This court has upcoming bookings — cancel them first");
  await db.delete(courts).where(eq(courts.id, courtId));
  return { success: true } as const;
}

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

export async function listAllOwners() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db.select().from(venueOwners);
  const enriched = await Promise.all(
    rows.map(async r => {
      const u = await db.select().from(users).where(eq(users.id, r.userId)).limit(1);
      return {
        ...r,
        ownerName: u[0]?.name ?? null,
        ownerEmail: u[0]?.email ?? null,
      };
    }),
  );
  return enriched;
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
        or(
          like(bookings.contact, `%${term}%`),
          like(bookings.playerName, `%${term}%`),
          eq(bookings.reference, term),
        ),
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

// ---------------- Venue management (master admin) ----------------

export async function createVenue(data: typeof venues.$inferInsert, initialCourts: number, rates: { tierName: "daytime" | "nighttime"; startHour: string; endHour: string; pricePerHour: string }[]) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  // Refuse duplicate venue name (case-insensitive)
  const existing = await db.select().from(venues).where(sql`LOWER(${venues.name}) = LOWER(${data.name})`).limit(1);
  if (existing.length > 0) throw new Error(`A venue named "${data.name}" already exists`);
  const [inserted] = await db.insert(venues).values(data);
  const venueId = (inserted as any).insertId as number;
  const count = Math.max(1, Math.min(20, Math.floor(initialCourts) || 1));
  for (let i = 1; i <= count; i++) {
    await db.insert(courts).values({ venueId, courtNumber: `Court ${i}` });
  }
  if (rates.length > 0) {
    await db.insert(rateTiers).values(
      rates.map(r => ({ venueId, tierName: r.tierName, startHour: r.startHour, endHour: r.endHour, pricePerHour: r.pricePerHour })),
    );
  } else {
    // Sensible default: single all-day tier
    await db.insert(rateTiers).values({ venueId, tierName: "daytime", startHour: data.openTime || "06:00", endHour: data.closeTime || "22:00", pricePerHour: "100.00" });
  }
  return { venueId };
}

export async function updateVenue(venueId: number, data: Partial<typeof venues.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const venue = await getVenueById(venueId);
  if (!venue) throw new Error("Venue not found");
  if (data.name) {
    const dup = await db
      .select()
      .from(venues)
      .where(and(sql`LOWER(${venues.name}) = LOWER(${data.name})`, sql`${venues.id} <> ${venueId}`))
      .limit(1);
    if (dup.length > 0) throw new Error(`A venue named "${data.name}" already exists`);
  }
  await db.update(venues).set(data).where(eq(venues.id, venueId));
  return { success: true } as const;
}

export async function deleteVenue(venueId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const venue = await getVenueById(venueId);
  if (!venue) throw new Error("Venue not found");
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const withBookings = await db
    .select({ id: bookings.id })
    .from(bookings)
    .where(
      and(
        eq(bookings.venueId, venueId),
        sql`${bookings.playerDate} >= ${today}`,
        inArray(bookings.paymentStatus, ["pending", "paid"]),
      ),
    );
  if (withBookings.length > 0) throw new Error("This venue has upcoming bookings or paid reservations — cancel or wait for them to pass");
  // leaf-to-root deletion: rate tiers, announcements, ownership grants, courts, bookings, then venue
  await db.delete(rateTiers).where(eq(rateTiers.venueId, venueId));
  await db.delete(venueGallery).where(eq(venueGallery.venueId, venueId));
  await db.delete(announcements).where(eq(announcements.venueId, venueId));
  await db.delete(venueOwners).where(eq(venueOwners.venueId, venueId));
  await db.delete(courts).where(eq(courts.venueId, venueId));
  await db.delete(bookings).where(eq(bookings.venueId, venueId));
  await db.execute(sql`DELETE FROM ownerCredentials WHERE venueId = ${venueId}`);
  await db.delete(venues).where(eq(venues.id, venueId));
  return { success: true } as const;
}
