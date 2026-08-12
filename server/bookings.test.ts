import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { bookings as bookingsTable, venueOwners } from "../drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import { getDb, getUserByEmail, upsertUser, listVenues } from "./db";

// ---------------------------------------------------------------
// Shared rate utilities
// ---------------------------------------------------------------
import {
  generateSlots,
  priceSlot,
  formatPHP,
  formatHour,
  type RateTier,
} from "../shared/rates";

const venueId = 1;
function tier(name: "daytime" | "nighttime", start: string, end: string, price: number): RateTier {
  return { id: name === "daytime" ? 1 : 2, venueId, tierName: name, startHour: start, endHour: end, pricePerHour: price };
}

describe("priceSlot — day/night tier splitting", () => {
  const tiers: RateTier[] = [
    tier("daytime", "06:00", "18:00", 300),
    tier("nighttime", "18:00", "24:00", 450),
  ];

  it("charges pure daytime hours at the daytime rate", () => {
    const p = priceSlot("10:00", "12:00", tiers);
    expect(p.dayHours).toBe(2);
    expect(p.nightHours).toBe(0);
    expect(p.dayAmount).toBe(600);
    expect(p.nightAmount).toBe(0);
    expect(p.total).toBe(600);
  });

  it("charges pure nighttime hours at the nighttime rate", () => {
    const p = priceSlot("19:00", "21:00", tiers);
    expect(p.dayHours).toBe(0);
    expect(p.nightHours).toBe(2);
    expect(p.nightAmount).toBe(900);
    expect(p.total).toBe(900);
  });

  it("splits a session that crosses the 18:00 boundary", () => {
    const p = priceSlot("17:00", "20:00", tiers);
    expect(p.dayHours).toBe(1);
    expect(p.nightHours).toBe(2);
    expect(p.dayAmount).toBe(300);
    expect(p.nightAmount).toBe(900);
    expect(p.total).toBe(1200);
  });

  it("rejects an end hour before the start hour", () => {
    expect(() => priceSlot("20:00", "18:00", tiers)).toThrow(/after start hour/);
  });
});

describe("generateSlots", () => {
  it("generates hourly slot starts between open and close", () => {
    const slots = generateSlots("08:00", "22:00");
    expect(slots).toEqual(["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00"]);
    expect(slots).toHaveLength(14);
  });

  it("treats closeTime '00:00' as midnight (24:00)", () => {
    const slots = generateSlots("18:00", "00:00");
    expect(slots).toEqual(["18:00", "19:00", "20:00", "21:00", "22:00", "23:00"]);
  });
});

describe("formatting helpers", () => {
  it("formats PHP amounts with peso sign and commas", () => {
    expect(formatPHP(1250)).toBe("₱1,250.00");
    expect(formatPHP("450.5")).toBe("₱450.50");
  });

  it("formats HH:MM to 12-hour clock strings", () => {
    expect(formatHour("08:00")).toBe("8:00 AM");
    expect(formatHour("18:00")).toBe("6:00 PM");
    expect(formatHour("00:00")).toBe("12:00 AM");
  });
});

// ---------------------------------------------------------------
// tRPC procedures (routers)
// ---------------------------------------------------------------

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function baseCtx(user: AuthenticatedUser | null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => undefined } as unknown as TrpcContext["res"],
  };
}

function adminCtx(): TrpcContext {
  return baseCtx({
    id: 1,
    openId: "admin-user",
    email: "admin@example.com",
    name: "Admin",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  });
}

function guestCtx(): TrpcContext {
  return baseCtx(null);
}

let ownerCounter = 1;
function ownerCtx(email?: string): TrpcContext {
  const id = 100 + ownerCounter++;
  return baseCtx({
    id,
    openId: `owner-${id}`,
    email: email ?? `owner-${id}@example.com`,
    name: `Owner ${id}`,
    loginMethod: "manus",
    role: "owner",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  });
}

describe("venues.list", () => {
  it("returns the eight seeded Davao City venues", async () => {
    const caller = appRouter.createCaller(guestCtx());
    const venues = await caller.venues.list();
    expect(venues.length).toBeGreaterThanOrEqual(8);
    const names = venues.map(v => v.name);
    expect(names).toContain("Arena Athletics");
    expect(names).toContain("Southside Davao");
    expect(names).toContain("Matina Town Square");
    expect(names).toContain("Paddle Up Davao");
    expect(names).toContain("CrisRon");
    expect(names).toContain("PickleVille");
    expect(names).toContain("Durian Pickleball House");
    expect(names).toContain("929 Pickleyard");
  });
});

describe("rates.all", () => {
  it("returns distinct daytime and nighttime tiers for each venue", async () => {
    const caller = appRouter.createCaller(guestCtx());
    const rates = await caller.rates.all();
    const venueIds = [...new Set(rates.map(r => r.venueId))];
    expect(venueIds.length).toBeGreaterThanOrEqual(8);
    for (const vId of venueIds) {
      const tiersOfVenue = rates.filter(r => r.venueId === vId);
      const tierNames = tiersOfVenue.map(t => t.tierName);
      expect(tierNames).toContain("daytime");
      expect(tierNames).toContain("nighttime");
    }
  });
});

describe("bookings.quote", () => {
  it("returns a split quote for a session crossing the day/night boundary", async () => {
    const caller = appRouter.createCaller(guestCtx());
    const venues = await caller.venues.list();
    const arena = venues.find(v => v.name === "Arena Athletics")!;
    const quote = await caller.bookings.quote({
      venueId: arena.id,
      courtId: 1,
      playerDate: "2099-12-31",
      startHour: "17:00",
      endHour: "19:00",
      playerName: "_",
      channel: "online",
    });
    expect(quote.dayHours).toBeGreaterThan(0);
    expect(quote.nightHours).toBeGreaterThan(0);
    expect(quote.total).toBeGreaterThan(0);
  });
});

describe("bookings.create + conflict detection", () => {
  it("creates a booking and rejects a conflicting one", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-01T12:00:00Z") });
    const day = `2026-12-25`; // isolated future date
    const rawDb = await getDb();
    if (rawDb) await rawDb.delete(venueOwners).where(sql`1 = 1`).catch(() => undefined);
    try {
      // Ensure the target court is unbooked at the start of this test.
      const caller = appRouter.createCaller(guestCtx());
      const venues = await caller.venues.list();
      const arena = venues.find(v => v.name === "Arena Athletics")!;
      const courts = await caller.courts.byVenue({ venueId: arena.id });
      const court = courts.find(c => c.status === "available")!;
      const rawDb = await getDb();
      if (rawDb) {
        await rawDb.delete(bookingsTable).where(and(eq(bookingsTable.venueId, arena.id), eq(bookingsTable.courtId, court.id), eq(bookingsTable.playerDate, day)));
      }

      const ref = await caller.bookings.create({
        venueId: arena.id,
        courtId: court.id,
        playerDate: day,
        startHour: "10:00",
        endHour: "12:00",
        playerName: "Test Player",
        channel: "online",
      });
      expect(ref.reference).toMatch(/^DV-PB-[A-Z0-9]+$/);

      // Overlapping slot on the same court must fail
      await expect(
        caller.bookings.create({
          venueId: arena.id,
          courtId: court.id,
          playerDate: day,
          startHour: "11:00",
          endHour: "13:00",
          playerName: "Other Player",
          channel: "online",
        }),
      ).rejects.toThrow(/already booked/i);

      // Same time on a DIFFERENT court should succeed
      const other = courts.find(c => c.id !== court.id && c.status === "available")!;
      const ref2 = await caller.bookings.create({
        venueId: arena.id,
        courtId: other.id,
        playerDate: day,
        startHour: "10:00",
        endHour: "12:00",
        playerName: "Other Player",
        channel: "walkin",
        paymentMethod: "cash",
      });
      expect(ref2.reference).toBeTruthy();
    } finally {
      vi.useRealTimers();
      const rawDb = await getDb();
      if (rawDb) {
        await rawDb.delete(bookingsTable).where(eq(bookingsTable.playerDate, day)).catch(() => undefined);
        await rawDb.delete(venueOwners).where(sql`1 = 1`).catch(() => undefined);
      }
    }
  });

  it("rejects bookings on past dates", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-01T12:00:00Z") });
    try {
      const caller = appRouter.createCaller(guestCtx());
      await expect(
        caller.bookings.create({
          venueId: 1,
          courtId: 1,
          playerDate: "2026-08-01",
          startHour: "10:00",
          endHour: "11:00",
          playerName: "Test",
          channel: "online",
        }),
      ).rejects.toThrow(/past date/i);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("admin authorization", () => {
  const adminInput = { id: 1 };

  it("allows admins to call admin procedures (creates then cancels a booking)", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-01T12:00:00Z") });
    try {
      const adminCaller = appRouter.createCaller(adminCtx());
      const guestCaller = appRouter.createCaller(guestCtx());
      const venues = await guestCaller.venues.list();
      const arena = venues.find(v => v.name === "Arena Athletics")!;
      const courts = await guestCaller.courts.byVenue({ venueId: arena.id });
      const court = courts.find(c => c.status === "available")!;

      const created = await guestCaller.bookings.create({
        venueId: arena.id,
        courtId: court.id,
        playerDate: "2026-09-05",
        startHour: "14:00",
        endHour: "15:00",
        playerName: "Cancel Me",
        channel: "online",
      });

      const all = await adminCaller.bookings.list();
      const target = all.find(b => b.reference === created.reference);
      if (!target) throw new Error("Created booking not found in admin list");

      await adminCaller.bookings.cancel({ id: target.id });
      const after = await adminCaller.bookings.list();
      expect(after.find(b => b.id === target.id)?.paymentStatus).toBe("cancelled");
    } finally {
      vi.useRealTimers();
      const rawDb = await getDb();
      if (rawDb) {
        await rawDb
          .delete(bookingsTable)
          .where(and(eq(bookingsTable.playerDate, "2026-09-05"), eq(bookingsTable.playerName, "Cancel Me")))
          .catch(() => undefined);
      }
    }
  });

  it("blocks unauthenticated guests from admin actions", async () => {
    const guestCaller = appRouter.createCaller(guestCtx());
    await expect(guestCaller.bookings.cancel(adminInput)).rejects.toThrow(/admin access/i);
  });

  it("blocks non-admin users from admin actions", async () => {
    const userCaller = appRouter.createCaller(
      baseCtx({
        id: 2,
        openId: "regular-user",
        name: "Regular",
        email: null,
        loginMethod: "manus",
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      }),
    );
    await expect(userCaller.bookings.cancel(adminInput)).rejects.toThrow(/admin access/i);
  });
});

describe("dual-role: player & owner routers", () => {
  it("denies guests from player/owner procedures", async () => {
    const caller = appRouter.createCaller(guestCtx());
    await expect(caller.bookings.myBookings({ identifier: "09123456789" })).rejects.toThrow();
    await expect(caller.owner.myVenues()).rejects.toThrow();
  });

  it("denies a signed-in player from owner-only routes", async () => {
    const playerCtx: TrpcContext = baseCtx({
      id: 9999,
      openId: "signed-in-player",
      email: "player-signed-in@example.com",
      name: "Player",
      loginMethod: "manus",
      role: "player",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    });
    const caller = appRouter.createCaller(playerCtx);
    await expect(caller.owner.myVenues()).rejects.toThrow();
    await expect(caller.owner.courtsForVenue({ venueId: 1 })).rejects.toThrow();
  });

  it(
    "isolates two owners: each sees only their own venue's bookings",
    async () => {
      vi.useFakeTimers({ now: new Date("2026-09-01T12:00:00Z") });
    const day = "2026-12-24"; // isolated date (conflict test uses 2026-12-25)
    const rawDb = await getDb();
    if (rawDb) {
      await rawDb.delete(bookingsTable).where(eq(bookingsTable.playerDate, day));
      await rawDb.delete(venueOwners).where(sql`1 = 1`);
    }
    try {
      const adminCaller = appRouter.createCaller(adminCtx());
      const venueRows = await listVenues();
      // Two venues, two owners.
      const v1 = venueRows.find(v => v.name === "Arena Athletics")!;
      const v2 = venueRows.find(v => v.name !== "Arena Athletics")!;
      const email1 = `owner-a-${Date.now()}@example.com`;
      const email2 = `owner-b-${Date.now()}@example.com`;
      await upsertUser({ openId: `test-${email1}`, email: email1, role: "user" });
      await upsertUser({ openId: `test-${email2}`, email: email2, role: "user" });
      await adminCaller.admin.grantOwnership({ venueId: v1.id, email: email1 });
      await adminCaller.admin.grantOwnership({ venueId: v2.id, email: email2 });

      const u1 = await getUserByEmail(email1);
      const u2 = await getUserByEmail(email2);

      // Owner 2 books a court at venue 2 (their own venue).
      const caller2 = appRouter.createCaller(
        baseCtx({ ...u2!, openId: `o-${u2!.id}`, lastSignedIn: new Date() }),
      );
      const courts = await caller2.owner.courtsForVenue({ venueId: v2.id });
      const court = courts.find(c => c.status === "available")!;
      await caller2.bookings.create({
        venueId: v2.id,
        courtId: court.id,
        playerDate: day,
        startHour: "09:00",
        endHour: "10:00",
        playerName: "Owner Two Player",
        channel: "online",
      });

      // Owner 1's bookings view must NOT include the booking at venue 2.
      const caller1 = appRouter.createCaller(
        baseCtx({ ...u1!, openId: `o-${u1!.id}`, lastSignedIn: new Date() }),
      );
      const b1 = await caller1.owner.bookings({});
      // Owner 1 owns only venue 1, so bookings made at venue 2 must be invisible.
      const seenVenues = new Set(b1.map(r => r.booking.venueId));
      for (const vId of seenVenues) {
        expect(vId).not.toBe(v2.id);
      }
      expect(b1.length).toBe(0);
    } finally {
      vi.useRealTimers();
      const dbNow = await getDb();
      if (dbNow) {
        await dbNow.delete(bookingsTable).where(eq(bookingsTable.playerDate, day));
        await dbNow.delete(venueOwners).where(sql`1 = 1`);
      }
    }
  },
  30000,
);

  it("denies owner-scoped actions when no venues are owned", async () => {
    const caller = appRouter.createCaller(
      ownerCtx("owner-no-venues@example.com"),
    );
    const venues = await caller.owner.myVenues();
    expect(venues).toEqual([]);
    await expect(caller.owner.courtsForVenue({ venueId: 1 })).rejects.toThrow(
      /do not own/i,
    );
  });

  it("assigns venue ownership via admin.grantOwnership and scopes owner access", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-01T12:00:00Z") });
    const email = `owner-test-${Date.now()}@example.com`;
    try {
      // Seed the user record (as if they had signed in once).
      await upsertUser({ openId: `test-${email}`, email, role: "user" });
      const seeded = await getUserByEmail(email);
      expect(seeded).toBeDefined();
      // upsertUser resets lastSignedIn and may reset role to default "player";
      // re-assert the user exists under the exact email the owner caller uses.
      const confirmed = await getUserByEmail(email);
      expect(confirmed).toBeDefined();

      const adminCaller = appRouter.createCaller(adminCtx());
      const venueRows = await listVenues();
      const arena = venueRows.find(v => v.name === "Arena Athletics")!;

      // Grant ownership to the seeded user, then construct an owner context
      // whose id/email matches that same user record.
      await adminCaller.admin.grantOwnership({ venueId: arena.id, email });
      const seededAgain = await getUserByEmail(email);
      const ownerCaller = appRouter.createCaller(
        baseCtx({
          ...seededAgain!,
          openId: `owner-${seededAgain!.id}`,
          lastSignedIn: new Date(),
        }),
      );
      const owned = await ownerCaller.owner.myVenues();
      expect(owned.map(v => v.id)).toContain(arena.id);

      // Owner can read own venue's courts but not unowned ones
      const courts = await ownerCaller.owner.courtsForVenue({ venueId: arena.id });
      expect(courts.length).toBeGreaterThan(0);
      const other = venueRows.find(v => v.id !== arena.id)!;
      await expect(
        ownerCaller.owner.courtsForVenue({ venueId: other.id }),
      ).rejects.toThrow(/do not own/i);
    } finally {
      vi.useRealTimers();
      // Cleanup
      const rawDb = await getDb();
      if (rawDb) {
        await rawDb.delete(venueOwners).where(sql`1 = 1`);
      }
    }
  });
});
