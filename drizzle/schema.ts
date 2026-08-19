import { sql } from "drizzle-orm";
import { index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar, decimal } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "player", "owner"]).default("player").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Venues: pickleball locations in Davao City.
 */
export const venues = mysqlTable("venues", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  address: text("address").notNull(),
  district: varchar("district", { length: 64 }),
  courtCount: int("courtCount").notNull().default(1),
  surfaceType: mysqlEnum("surfaceType", ["indoor", "outdoor", "covered"]).default("indoor").notNull(),
  openTime: varchar("openTime", { length: 5 }).notNull(), // e.g. "06:00"
  closeTime: varchar("closeTime", { length: 5 }).notNull(), // e.g. "22:00"
  phone: varchar("phone", { length: 32 }),
  description: text("description"),
  imageKey: text("imageKey"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Venue = typeof venues.$inferSelect;
export type InsertVenue = typeof venues.$inferInsert;

/**
 * Individual courts within a venue.
 */
export const courts = mysqlTable("courts", {
  id: int("id").autoincrement().primaryKey(),
  venueId: int("venueId").notNull(),
  courtNumber: varchar("courtNumber", { length: 16 }).notNull(), // e.g. "Court 1"
  status: mysqlEnum("status", ["available", "maintenance"]).default("available").notNull(),
});

export type Court = typeof courts.$inferSelect;
export type InsertCourt = typeof courts.$inferInsert;

/**
 * Rate tiers: distinct day vs night pricing per venue.
 */
export const rateTiers = mysqlTable("rateTiers", {
  id: int("id").autoincrement().primaryKey(),
  venueId: int("venueId").notNull(),
  tierName: mysqlEnum("tierName", ["daytime", "nighttime"]).notNull(),
  startHour: varchar("startHour", { length: 5 }).notNull(), // e.g. "06:00"
  endHour: varchar("endHour", { length: 5 }).notNull(), // e.g. "18:00"
  pricePerHour: decimal("pricePerHour", { precision: 10, scale: 2 }).notNull(),
});

export type RateTier = typeof rateTiers.$inferSelect;
export type InsertRateTier = typeof rateTiers.$inferInsert;

/**
 * Bookings / reservations, incl. walk-in POS transactions.
 */
export const bookings = mysqlTable("bookings", {
  id: int("id").autoincrement().primaryKey(),
  reference: varchar("reference", { length: 16 }).notNull().unique(),
  courtId: int("courtId").notNull(),
  venueId: int("venueId").notNull(),
  playerDate: varchar("playerDate", { length: 10 }).notNull(), // YYYY-MM-DD (Asia/Manila)
  startHour: varchar("startHour", { length: 5 }).notNull(),
  endHour: varchar("endHour", { length: 5 }).notNull(),
  playerName: varchar("playerName", { length: 128 }).notNull(),
  contact: varchar("contact", { length: 64 }),
  customerAccountId: int("customerAccountId"), // links online bookings to an optional customer account
  channel: mysqlEnum("channel", ["online", "walkin"]).default("online").notNull(),
  // 'cancelled' is a human decision; 'expired' is nobody paying in time. The
  // venue's abandonment numbers depend on the two staying apart.
  paymentStatus: mysqlEnum("paymentStatus", ["pending", "paid", "cancelled", "expired"]).default("pending").notNull(),
  paymentMethod: varchar("paymentMethod", { length: 32 }), // cash, gcash, card
  /**
   * The PayMongo checkout session opened for this booking, if any.
   *
   * Kept so the return page can ask PayMongo what happened when the webhook
   * has not arrived yet, and so the hold sweep can cancel the session it
   * belongs to instead of leaving a payable page pointing at a released court.
   */
  paymongoSessionId: varchar("paymongoSessionId", { length: 64 }),
  dayAmount: decimal("dayAmount", { precision: 10, scale: 2 }).default("0"),
  nightAmount: decimal("nightAmount", { precision: 10, scale: 2 }).default("0"),
  totalAmount: decimal("totalAmount", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  /**
   * When an unpaid booking stops holding its court. Only pending bookings get
   * one; a booking already settled at the counter holds its slot for good, so
   * it stays null.
   */
  expiresAt: timestamp("expiresAt"),
  /**
   * Slot key for bookings that still hold their court, and NULL for any that
   * released it. A unique index permits many NULL rows, so cancelled bookings
   * stay on record without blocking the slot. MySQL has no partial index, so
   * this column is how the filter is expressed.
   */
  activeSlot: varchar("activeSlot", { length: 40 }).generatedAlwaysAs(
    sql`(case when \`paymentStatus\` in ('pending','paid') then concat(\`courtId\`,'|',\`playerDate\`,'|',\`startHour\`) else null end)`,
    { mode: "stored" },
  ),
}, table => [
  // Catches two bookings claiming the identical start hour. It cannot catch
  // overlapping ranges, because '08:00-10:00' and '09:00-10:00' are different
  // key values and no unique index can say that two ranges intersect. Ranges
  // are settled by the court-day lock instead; this stays as a backstop.
  uniqueIndex("bookings_active_slot_unique").on(table.activeSlot),
  // The range lock in withCourtDayLock reads this index to decide what to
  // lock. Without it MySQL has no range to gap-lock and takes out the whole
  // table, so every booking at every venue would serialise behind one court.
  index("bookings_court_day_idx").on(table.courtId, table.playerDate),
]);

export type Booking = typeof bookings.$inferSelect;
export type InsertBooking = typeof bookings.$inferInsert;

/**
 * Venue ownership: links a user (owner role) to the venues they manage.
 * One owner can own multiple venues; one venue can have multiple owners.
 */
export const venueOwners = mysqlTable("venueOwners", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  venueId: int("venueId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type VenueOwner = typeof venueOwners.$inferSelect;
export type InsertVenueOwner = typeof venueOwners.$inferInsert;

/**
 * Venue announcements: owner-posted notices visible to players
 * (e.g. courts closed for a party, tournaments, special events).
 */
export const announcements = mysqlTable("announcements", {
  id: int("id").autoincrement().primaryKey(),
  venueId: int("venueId").notNull(),
  title: varchar("title", { length: 160 }).notNull(),
  message: text("message").notNull(),
  active: int("active").notNull().default(1), // 1 = visible, 0 = hidden
  expireAt: timestamp("expireAt"), // null = no expiry
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Announcement = typeof announcements.$inferSelect;
export type InsertAnnouncement = typeof announcements.$inferInsert;

/**
 * Customer accounts: optional email/password accounts for the customer app.
 * Bookings work without an account (guest booking), but a logged-in account
 * lets players view all their bookings.
 */
export const customerAccounts = mysqlTable("customerAccounts", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: varchar("name", { length: 128 }),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type CustomerAccount = typeof customerAccounts.$inferSelect;
export type InsertCustomerAccount = typeof customerAccounts.$inferInsert;

/**
 * Owner credentials: fixed login for the Owner Portal, completely separate
 * from the customer app. A seeded row carries the fixed username/password.
 */
export const ownerCredentials = mysqlTable("ownerCredentials", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  // Null/undefined = system owner login that can manage all venues;
  // set = venue-specific owner login scoped to that single venue.
  venueId: int("venueId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type OwnerCredential = typeof ownerCredentials.$inferSelect;
export type InsertOwnerCredential = typeof ownerCredentials.$inferInsert;
