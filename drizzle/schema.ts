import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, decimal } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
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
  channel: mysqlEnum("channel", ["online", "walkin"]).default("online").notNull(),
  paymentStatus: mysqlEnum("paymentStatus", ["pending", "paid", "cancelled"]).default("pending").notNull(),
  paymentMethod: varchar("paymentMethod", { length: 32 }), // cash, gcash, card
  dayAmount: decimal("dayAmount", { precision: 10, scale: 2 }).default("0"),
  nightAmount: decimal("nightAmount", { precision: 10, scale: 2 }).default("0"),
  totalAmount: decimal("totalAmount", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Booking = typeof bookings.$inferSelect;
export type InsertBooking = typeof bookings.$inferInsert;
