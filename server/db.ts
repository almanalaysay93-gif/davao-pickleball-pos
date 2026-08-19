import { and, asc, desc, eq, gte, inArray, like, lt, lte, or, sql } from "drizzle-orm";
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

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/**
 * Either the pooled connection or an open transaction. Every booking function
 * that can run inside the court-day lock takes one of these, so the caller
 * decides whether the statement joins the locked section or stands alone.
 */
export type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Run fn with exclusive claim over one court.
 *
 * Overlapping bookings cannot be rejected by a unique index. '08:00-10:00' and
 * '09:00-10:00' collide as ranges but differ as key values, and MySQL has no
 * exclusion constraint to express the difference. So the overlap check and the
 * write it guards have to be one indivisible step instead.
 *
 * The lock is taken on the court's own row, not on the bookings it holds. The
 * obvious alternative, locking the bookings range with FOR UPDATE, deadlocks:
 * InnoDB gap locks do not conflict with each other, so two bookings for a free
 * court-day both take the gap, then each one's insert waits on the other's gap
 * and neither proceeds. A court row already exists, so locking it is an
 * ordinary exclusive row lock with one ordering point and no deadlock.
 *
 * Granularity is the whole court rather than one of its days. That is the
 * resource actually being contended, and a single court has no throughput to
 * lose. Other courts stay fully parallel.
 */
export async function withCourtLock<T>(
  courtId: number,
  fn: (tx: Executor) => Promise<T>,
): Promise<T> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async tx => {
    const held = await tx.select({ id: courts.id }).from(courts).where(eq(courts.id, courtId)).for("update");
    if (held.length === 0) throw new Error(`Court ${courtId} not found`);
    return fn(tx);
  });
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

/**
 * Find the booking a PayMongo checkout session belongs to.
 *
 * The webhook arrives knowing a session id and nothing else, and the id was
 * written here when the checkout was opened. Looking the booking up this way
 * means the handler never has to trust anything carried in the event body.
 *
 * One row is expected. A booking holds a single session id at a time, and
 * opening a new checkout overwrites the old one rather than adding to it.
 */
export async function getBookingByPaymongoSessionId(sessionId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db
    .select()
    .from(bookings)
    .where(eq(bookings.paymongoSessionId, sessionId))
    .limit(1);
  return rows[0];
}

export async function getBookingById(id: number, executor?: Executor) {
  const db = executor ?? (await getDb());
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
  executor?: Executor,
) {
  const db = executor ?? (await getDb());
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

export async function insertBooking(data: InsertBooking, executor?: Executor) {
  const db = executor ?? (await getDb());
  if (!db) throw new Error("Database not available");
  const result = await db.insert(bookings).values(data);
  return result;
}

/**
 * Release every hold whose deadline has passed.
 *
 * This has to write, not filter. activeSlot is a stored generated column
 * derived from paymentStatus, and the database cannot know the time, so a
 * lapsed booking still left as 'pending' keeps producing a slot key and the
 * unique index keeps turning the next player away. Only the status change
 * frees the court.
 *
 * Bookings settled at the counter have a null expiresAt and never match.
 *
 * Pass a court and date when running inside withCourtLock. Sweeping the
 * whole table there would take row locks outside the range the lock covers,
 * and two transactions holding different courts would deadlock against each
 * other's rows. Scoped to the locked court-day, it only touches rows the
 * caller already holds.
 *
 * The cutoff is passed as a parameter rather than compared against SQL NOW(),
 * because NOW() answers in the database session's timezone while expiresAt was
 * written from the Node process. A non-UTC session would expire holds early or
 * late by the offset.
 */
export async function expireStaleHolds(
  now: Date = new Date(),
  scope?: { courtId: number; playerDate: string },
  executor?: Executor,
) {
  const db = executor ?? (await getDb());
  if (!db) return;
  await db
    .update(bookings)
    .set({ paymentStatus: "expired" })
    .where(
      and(
        eq(bookings.paymentStatus, "pending"),
        lt(bookings.expiresAt, now),
        ...(scope
          ? [eq(bookings.courtId, scope.courtId), eq(bookings.playerDate, scope.playerDate)]
          : []),
      ),
    );
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
  executor?: Executor,
) {
  const db = executor ?? (await getDb());
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

/**
 * Bookings a guest can find without an account, by something only they hold.
 *
 * The identifier must equal a booking reference or a contact number in full.
 * It used to be a substring search across contact and playerName, which meant
 * '09' matched every Philippine mobile number in the table and handed back 200
 * rows of other people's names, numbers, venues and amounts. A fragment of a
 * phone number is not a secret. The whole number, and the reference printed on
 * the receipt, are the two things the person who booked actually has.
 *
 * playerName is gone from the match entirely. Names are guessed, not held.
 */
export async function listGuestBookings(identifier: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const term = identifier.trim();
  if (!term) return [];
  return db
    .select()
    .from(bookings)
    .where(
      and(
        // Expired stays visible, cancelled does not. A player who cancelled
        // knows why the booking is gone. A player whose hold lapsed does not,
        // and hiding the row turns 'you did not pay in time' into 'my booking
        // vanished', which reaches the venue as a phone call.
        inArray(bookings.paymentStatus, ["pending", "paid", "expired"]),
        or(eq(bookings.reference, term), eq(bookings.contact, term)),
      ),
    )
    .orderBy(desc(bookings.createdAt))
    .limit(50);
}

/**
 * Bookings belonging to a signed-in customer account.
 *
 * Keyed on customerAccountId, which the create path writes on every booking
 * made while signed in. The previous version matched the account's email
 * against contact and playerName, and bookings store a phone number in
 * contact, so a signed-in player's own list came back empty however many
 * courts they had booked.
 */
export async function listAccountBookings(accountId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db
    .select()
    .from(bookings)
    .where(eq(bookings.customerAccountId, accountId))
    .orderBy(desc(bookings.createdAt))
    .limit(200);
}

/** All bookings scoped to the venues an owner manages. */
export async function listOwnerBookings(venueIds: number[], opts?: { channel?: "online" | "walkin"; limit?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (venueIds.length === 0) return [];
  // Every status, not only the ones still holding a court. The owner dashboard
  // counts expired and cancelled bookings, and filtering them out here would
  // leave those figures reading zero however many checkouts were abandoned.
  const conditions = [inArray(bookings.venueId, venueIds)];
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
  await db.delete(announcements).where(eq(announcements.venueId, venueId));
  await db.delete(venueOwners).where(eq(venueOwners.venueId, venueId));
  await db.delete(courts).where(eq(courts.venueId, venueId));
  await db.delete(bookings).where(eq(bookings.venueId, venueId));
  await db.execute(sql`DELETE FROM ownerCredentials WHERE venueId = ${venueId}`);
  await db.delete(venues).where(eq(venues.id, venueId));
  return { success: true } as const;
}

/**
 * Record the PayMongo session a booking was sent to, and restart its hold.
 *
 * Two writes that belong together. The session id lets the return page and the
 * sweep find the checkout again, and the fresh deadline gives the player the
 * whole window on PayMongo's page rather than whatever was left of the window
 * they spent filling in the booking form. A hold that lapses mid-payment is
 * money taken for a court somebody else may already hold.
 *
 * Kept out of updateBookingStatus deliberately: that function's patch type is
 * the set of fields staff may change, and neither of these is one of them.
 */
export async function attachCheckoutSession(
  id: number,
  sessionId: string,
  expiresAt: Date,
) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(bookings)
    .set({ paymongoSessionId: sessionId, expiresAt })
    .where(eq(bookings.id, id));
}
