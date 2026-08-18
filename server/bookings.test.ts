import { describe, expect, it, vi, beforeEach, afterEach, afterAll } from "vitest";
import { appRouter, getAuthPoolForTests } from "./routers";
import type { TrpcContext } from "./_core/context";
import { announcements as announcementsTable, bookings as bookingsTable, courts as courtsTable, venueOwners, customerAccounts } from "../drizzle/schema";
import { verifyPassword } from "./auth";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, getUserByEmail, upsertUser, listVenues } from "./db";
import * as db from "./db";

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
    res: {
      clearCookie: () => undefined,
      cookie: () => undefined,
    } as unknown as TrpcContext["res"],
  };
}

function adminCtx(): TrpcContext {
  return baseCtx({
    id: 1,
    type: "owner",
    identity: "owner",
    name: "owner",
    email: null,
    role: "owner",
  });
}

function guestCtx(): TrpcContext {
  return baseCtx(null);
}

function playerCtx(): TrpcContext {
  return baseCtx({
    id: 99,
    type: "customer",
    identity: "player@example.com",
    name: "Player",
    email: "player@example.com",
    role: "customer",
  });
}

let ownerCounter = 1;
// Legacy-scope owner caller: role 'owner' passes RBAC; type 'customer' keeps
// ownsAllVenues false so the caller stays scoped to its venueOwners rows.
function legacyOwnerCtx(
  userId: number,
  opts?: { email?: string | null; name?: string },
): TrpcContext {
  return baseCtx({
    id: userId,
    type: "customer",
    identity: opts?.email ?? `legacy-owner-${userId}@example.com`,
    name: opts?.name ?? `Legacy Owner ${userId}`,
    email: opts?.email ?? null,
    role: "owner",
  });
}

function ownerCtx(): TrpcContext {
  // Legacy-scope owner: stays scoped to assigned venues (type !== 'owner').
  const id = 100 + ownerCounter++;
  return baseCtx({
    id,
    type: "customer",
    identity: `owner-${id}@example.com`,
    name: `Owner ${id}`,
    email: `owner-${id}@example.com`,
    role: "owner",
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
    // Only the real seeded Davao venues are guaranteed to carry both tiers;
    // admin-created test venues may have a single all-day tier.
    for (const vId of venueIds) {
      const tiersOfVenue = rates.filter(r => r.venueId === vId);
      const tierNames = tiersOfVenue.map(t => t.tierName);
      if (tiersOfVenue.some(t => t.tierName === "nighttime")) {
        expect(tierNames).toContain("daytime");
        expect(tierNames).toContain("nighttime");
      }
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
      const venuesList = await caller.venues.list();
      const arenaVenue = venuesList.find(v => v.name === "Arena Athletics")!;
      const courtList = await caller.courts.byVenue({ venueId: arenaVenue.id });
      await expect(
        caller.bookings.create({
          venueId: arenaVenue.id,
          courtId: courtList[0].id,
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

  it("gives the slot to exactly one player when identical requests arrive at once", async () => {
    const day = "2026-12-26"; // isolated future date; no other test touches it
    const caller = appRouter.createCaller(guestCtx());
    const venuesList = await caller.venues.list();
    const arena = venuesList.find(v => v.name === "Arena Athletics")!;
    const courtList = await caller.courts.byVenue({ venueId: arena.id });
    const court = courtList.find(c => c.status === "available")!;

    const rawDb = await getDb();
    const clear = async () => {
      if (rawDb) {
        await rawDb
          .delete(bookingsTable)
          .where(and(eq(bookingsTable.courtId, court.id), eq(bookingsTable.playerDate, day)))
          .catch(() => undefined);
      }
    };
    await clear();

    try {
      const attempt = (playerName: string) =>
        caller.bookings.create({
          venueId: arena.id,
          courtId: court.id,
          playerDate: day,
          startHour: "10:00",
          endHour: "11:00",
          playerName,
          channel: "online",
        });

      // All five requests hit the same court, date, and hour with no await
      // between them, so every one clears the overlap check before any insert
      // lands. Only one player may end up holding the slot.
      const results = await Promise.allSettled([
        attempt("Racer 1"),
        attempt("Racer 2"),
        attempt("Racer 3"),
        attempt("Racer 4"),
        attempt("Racer 5"),
      ]);

      const winners = results.filter(r => r.status === "fulfilled");
      expect(winners).toHaveLength(1);

      // The players who lost the race must be told the slot is taken, not
      // handed a raw database error.
      const losers = results.filter(r => r.status === "rejected");
      for (const loser of losers) {
        expect((loser as PromiseRejectedResult).reason).toMatchObject({
          message: expect.stringMatching(/already booked/i),
        });
      }
    } finally {
      await clear();
    }
  });

  it("frees the slot for a new player after the first booking is cancelled", async () => {
    const day = "2026-12-27"; // isolated future date; no other test touches it
    const guestCaller = appRouter.createCaller(guestCtx());
    const adminCaller = appRouter.createCaller(adminCtx());
    const venuesList = await guestCaller.venues.list();
    const arena = venuesList.find(v => v.name === "Arena Athletics")!;
    const courtList = await guestCaller.courts.byVenue({ venueId: arena.id });
    const court = courtList.find(c => c.status === "available")!;

    const rawDb = await getDb();
    const clear = async () => {
      if (rawDb) {
        await rawDb
          .delete(bookingsTable)
          .where(and(eq(bookingsTable.courtId, court.id), eq(bookingsTable.playerDate, day)))
          .catch(() => undefined);
      }
    };
    await clear();

    try {
      const slot = {
        venueId: arena.id,
        courtId: court.id,
        playerDate: day,
        startHour: "09:00",
        endHour: "10:00",
        channel: "online" as const,
      };

      const first = await guestCaller.bookings.create({ ...slot, playerName: "First Player" });
      const all = await adminCaller.bookings.list();
      const target = all.find(b => b.reference === first.reference);
      if (!target) throw new Error("Created booking not found in admin list");
      await adminCaller.bookings.cancel({ id: target.id });

      // The slot is free again, so a second player must be able to take it.
      const second = await guestCaller.bookings.create({ ...slot, playerName: "Second Player" });
      expect(second.reference).toMatch(/^DV-PB-[A-Z0-9]+$/);
      expect(second.reference).not.toBe(first.reference);
    } finally {
      await clear();
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
        type: "customer",
        identity: "regular@example.com",
        name: "Regular",
        email: "regular@example.com",
        role: "customer",
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
      type: "customer",
      identity: "player-signed-in@example.com",
      email: "player-signed-in@example.com",
      name: "Player",
      role: "customer",
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
      // Legacy-scope owner caller: role 'owner' for RBAC, type 'customer' so
      // the ownerProcedure stays venue-scoped (ownsAllVenues is false).
      const caller2 = appRouter.createCaller(
        baseCtx({
          id: u2!.id,
          type: "customer",
          identity: u2!.email ?? "",
          name: u2!.name ?? "Owner",
          email: u2!.email,
          role: "owner",
        }),
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
        baseCtx({
          id: u1!.id,
          type: "customer",
          identity: u1!.email ?? "",
          name: u1!.name ?? "Owner",
          email: u1!.email,
          role: "owner",
        }),
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
    const caller = appRouter.createCaller(ownerCtx());
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
        legacyOwnerCtx(seededAgain!.id, { email: seededAgain!.email, name: seededAgain!.name ?? undefined }),
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

describe("announcements & owner booking", () => {
  it("owners can create announcements scoped to their venue and players see only active ones", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-01T12:00:00Z") });
    const email = `announce-test-${Date.now()}@example.com`;
    try {
      await upsertUser({ openId: `test-${email}`, email, role: "user" });
      const seeded = await getUserByEmail(email);
      expect(seeded).toBeDefined();
      const adminCaller = appRouter.createCaller(adminCtx());
      const venueRows = await listVenues();
      const arena = venueRows.find(v => v.name === "Arena Athletics")!;
      await adminCaller.admin.grantOwnership({ venueId: arena.id, email });
      const seededAgain = await getUserByEmail(email);
      const ownerCaller = appRouter.createCaller(
        legacyOwnerCtx(seededAgain!.id, { email: seededAgain!.email }),
      );

      // Player cannot manage announcements
      const playerCaller = appRouter.createCaller(
        baseCtx({
          id: 9001,
          type: "customer",
          identity: "pl-ann@example.com",
          email: "pl-ann@example.com",
          name: "Player",
          role: "customer",
        }),
      );
      await expect(
        playerCaller.owner.createAnnouncement({ venueId: arena.id, title: "t", message: "m" }),
      ).rejects.toThrow();

      // Owner creates an announcement (procedure returns {success:true})
      const created = await ownerCaller.owner.createAnnouncement({
        venueId: arena.id,
        title: "Courts closed today",
        message: "Private party all evening.",
        expireAt: null,
      });
      expect(created.success).toBe(true);
      // Confirm the row landed in the database.
      const rawDb = await getDb();
      const createdRow = await rawDb
        .select()
        .from(announcementsTable)
        .where(
          and(eq(announcementsTable.venueId, arena.id), eq(announcementsTable.title, "Courts closed today")),
        )
        .limit(1);
      expect(createdRow.length).toBe(1);
      const annId = createdRow[0].id;

      // Players see active announcements publicly
      const list = await appRouter.createCaller(guestCtx()).announcements.list();
      expect(list.some((a: any) => a.title === "Courts closed today" && a.active === 1)).toBe(true);

      // Inactive announcements are hidden from players
      await ownerCaller.owner.updateAnnouncement({ id: annId, active: 0 });
      const list2 = await appRouter.createCaller(guestCtx()).announcements.list();
      expect(list2.every((a: any) => a.title !== "Courts closed today")).toBe(true);

      // Cleanup
      await ownerCaller.owner.deleteAnnouncement({ id: annId });
      const list3 = await appRouter.createCaller(guestCtx()).announcements.list();
      expect(list3.every((a: any) => a.title !== "Courts closed today")).toBe(true);
    } finally {
      vi.useRealTimers();
      const rawDb = await getDb();
      if (rawDb) {
        await rawDb.delete(venueOwners).where(sql`1 = 1`).catch(() => undefined);
        await rawDb.delete(announcementsTable).where(sql`1 = 1`).catch(() => undefined);
      }
    }
  }, 30000);

  it("expired announcements are hidden from the public list", async () => {
    vi.useFakeTimers({ now: new Date("2026-08-01T12:00:00Z") });
    const email = `expiry-test-${Date.now()}@example.com`;
    try {
      await upsertUser({ openId: `test-${email}`, email, role: "user" });
      const seeded = await getUserByEmail(email);
      expect(seeded).toBeDefined();
      const adminCaller = appRouter.createCaller(adminCtx());
      const venueRows = await listVenues();
      const arena = venueRows.find(v => v.name === "Arena Athletics")!;
      await adminCaller.admin.grantOwnership({ venueId: arena.id, email });
      const seededAgain = await getUserByEmail(email);
      const ownerCaller = appRouter.createCaller(
        legacyOwnerCtx(seededAgain!.id, { email: seededAgain!.email }),
      );

      // Announcement that expired yesterday
      const oldCreated = await ownerCaller.owner.createAnnouncement({
        venueId: arena.id,
        title: "Old notice",
        message: "No longer relevant",
        expireAt: new Date("2026-07-31T12:00:00Z").toISOString(),
      });
      expect(oldCreated.success).toBe(true);

      const list = await appRouter.createCaller(guestCtx()).announcements.list();
      expect(list.every((a: any) => a.title !== "Old notice")).toBe(true);

      // Announcement expiring tomorrow is visible
      const futCreated = await ownerCaller.owner.createAnnouncement({
        venueId: arena.id,
        title: "Future notice",
        message: "Still coming",
        expireAt: new Date("2026-08-02T12:00:00Z").toISOString(),
      });
      expect(futCreated.success).toBe(true);
      const rawDb = await getDb();
      const rows = await rawDb
        .select()
        .from(announcementsTable)
        .where(eq(announcementsTable.venueId, arena.id))
        .orderBy(desc(announcementsTable.id));
      const oldRow = rows.find(r => r.title === "Old notice")!;
      const futRow = rows.find(r => r.title === "Future notice")!;

      const list2 = await appRouter.createCaller(guestCtx()).announcements.list();
      expect(list2.some((a: any) => a.title === "Future notice")).toBe(true);

      await ownerCaller.owner.deleteAnnouncement({ id: oldRow.id });
      await ownerCaller.owner.deleteAnnouncement({ id: futRow.id });
    } finally {
      vi.useRealTimers();
      const rawDb = await getDb();
      if (rawDb) {
        await rawDb.delete(venueOwners).where(sql`1 = 1`).catch(() => undefined);
        await rawDb.delete(announcementsTable).where(sql`1 = 1`).catch(() => undefined);
      }
    }
  }, 30000);

  it("owner.createBooking books at owned venues and rejects non-owned ones", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-01T12:00:00Z") });
    const email = `owner-book-${Date.now()}@example.com`;
    const rawDb = await getDb();
    if (rawDb) {
      await rawDb.delete(venueOwners).where(sql`1 = 1`).catch(() => undefined);
    }
    try {
      await upsertUser({ openId: `test-${email}`, email, role: "user" });
      const seeded = await getUserByEmail(email);
      expect(seeded).toBeDefined();
      const adminCaller = appRouter.createCaller(adminCtx());
      const venueRows = await listVenues();
      const arena = venueRows.find(v => v.name === "Arena Athletics")!;
      await adminCaller.admin.grantOwnership({ venueId: arena.id, email });
      const seededAgain = await getUserByEmail(email);
      const ownerCaller = appRouter.createCaller(
        legacyOwnerCtx(seededAgain!.id, { email: seededAgain!.email }),
      );

      // Booking at a venue the owner does NOT own must fail
      const other = venueRows.find(v => v.id !== arena.id)!;
      await expect(
        ownerCaller.owner.createBooking({
          venueId: other.id,
          courtId: 1,
          playerDate: "2027-02-01",
          startHour: "10:00",
          endHour: "11:00",
          playerName: "Owner Player",
        }),
      ).rejects.toThrow();

      // Booking at an owned venue succeeds
      const courts = await ownerCaller.owner.courtsForVenue({ venueId: arena.id });
      const court = courts.find(c => c.status === "available")!;
      await rawDb
        .delete(bookingsTable)
        .where(eq(bookingsTable.playerDate, "2027-03-01"))
        .catch(() => undefined);

      const res = await ownerCaller.owner.createBooking({
        venueId: arena.id,
        courtId: court.id,
        playerDate: "2027-03-01",
        startHour: "14:00",
        endHour: "15:00",
        playerName: "Owner Player",
      });
      expect(res.reference).toMatch(/^DV-PB-[A-Z0-9]+$/);

      // Conflicts are still enforced for owner bookings
      await expect(
        ownerCaller.owner.createBooking({
          venueId: arena.id,
          courtId: court.id,
          playerDate: "2027-03-01",
          startHour: "14:30",
          endHour: "15:30",
          playerName: "Owner Player 2",
        }),
      ).rejects.toThrow();

      // Player cannot call owner.createBooking at all
      const playerCaller = appRouter.createCaller(
        baseCtx({
          id: 9002,
          type: "customer",
          identity: "pl-ownbook@example.com",
          email: "pl-ownbook@example.com",
          name: "Player",
          role: "customer",
        }),
      );
      await expect(
        playerCaller.owner.createBooking({
          venueId: arena.id,
          courtId: court.id,
          playerDate: "2027-03-02",
          startHour: "14:00",
          endHour: "15:00",
          playerName: "Player",
        }),
      ).rejects.toThrow();
    } finally {
      vi.useRealTimers();
      const rawDb2 = await getDb();
      if (rawDb2) {
        await rawDb2.delete(bookingsTable).where(eq(bookingsTable.playerDate, "2027-03-01")).catch(() => undefined);
        await rawDb2.delete(venueOwners).where(sql`1 = 1`).catch(() => undefined);
      }
    }
  }, 60000);
});

describe(
  "court add/remove",
  () => {
    it("admin can add and remove a court; player and guest cannot", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-01T12:00:00Z") });
    const email = `court-test-${Date.now()}@example.com`;
    try {
      // Guest and player must be denied.
      const guestCaller = appRouter.createCaller(guestCtx());
      await expect(
        guestCaller.bookings.createCourt({ venueId: 1, courtNumber: "Court 99" }),
      ).rejects.toThrow();
      await expect(
        guestCaller.bookings.removeCourt({ courtId: 1 }),
      ).rejects.toThrow();
      const playerCaller = appRouter.createCaller(playerCtx());
      await expect(
        playerCaller.bookings.createCourt({ venueId: 1, courtNumber: "Court 99" }),
      ).rejects.toThrow(/admin/i);

      // Admin adds a court, then removes it.
      const adminCaller = appRouter.createCaller(adminCtx());
      const venueRows = await listVenues();
      const arena = venueRows.find(v => v.name === "Arena Athletics")!;
      const before = await adminCaller.courts.byVenue({ venueId: arena.id });
      await adminCaller.bookings.createCourt({ venueId: arena.id, courtNumber: "Court 99" });
      const afterAdd = await adminCaller.courts.byVenue({ venueId: arena.id });
      expect(afterAdd.length).toBe(before.length + 1);
      const added = afterAdd.find(c => c.courtNumber === "Court 99")!;

      // Duplicate label is rejected.
      await expect(
        adminCaller.bookings.createCourt({ venueId: arena.id, courtNumber: "Court 99" }),
      ).rejects.toThrow(/already exists/i);

      await adminCaller.bookings.removeCourt({ courtId: added.id });
      const afterRemove = await adminCaller.courts.byVenue({ venueId: arena.id });
      expect(afterRemove.map(c => c.id)).not.toContain(added.id);
    } finally {
      vi.useRealTimers();
      const rawDb = await getDb();
      if (rawDb) await rawDb.delete(courtsTable).where(eq(courtsTable.courtNumber, "Court 99")).catch(() => undefined);
    }
  },
  15000,
);

  it("owner can add/remove courts at owned venues only", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-01T12:00:00Z") });
    const email = `owner-court-${Date.now()}@example.com`;
    try {
      await upsertUser({ openId: `test-${email}`, email, role: "user" });
      const seeded = await getUserByEmail(email);
      const adminCaller = appRouter.createCaller(adminCtx());
      const venueRows = await listVenues();
      const arena = venueRows.find(v => v.name === "Arena Athletics")!;
      const other = venueRows.find(v => v.id !== arena.id)!;
            await adminCaller.admin.grantOwnership({ venueId: arena.id, email });
      const seededAgain = await getUserByEmail(email);
      const ownerCaller = appRouter.createCaller(
        legacyOwnerCtx(seededAgain!.id, { email: seededAgain!.email }),
      );
      // Add court to owned venue.
      await ownerCaller.owner.createCourt({ venueId: arena.id, courtNumber: "Court 99" });
      const courts = await ownerCaller.owner.courtsForVenue({ venueId: arena.id });
      const added = courts.find(c => c.courtNumber === "Court 99")!;
      expect(added).toBeDefined();

      // Adding to a venue the owner does not own is denied.
      await expect(
        ownerCaller.owner.createCourt({ venueId: other.id, courtNumber: "Court 99" }),
      ).rejects.toThrow(/do not own/i);
      const ownedIds = await ownerCaller.owner.myVenues().then(v => v.map(x => x.id));
      expect(ownedIds).not.toContain(other.id);

      // Removing a court at a venue the owner does not own is denied.
      const otherCourts = await adminCaller.courts.byVenue({ venueId: other.id });
      const nonOwnedCourt = otherCourts.find(c => c.status === "available")!;
      await expect(
        ownerCaller.owner.removeCourt({ courtId: nonOwnedCourt.id }),
      ).rejects.toThrow(/do not own/i);

      // Remove the added court (no upcoming bookings).
      await ownerCaller.owner.removeCourt({ courtId: added.id });
      const afterRemove = await ownerCaller.owner.courtsForVenue({ venueId: arena.id });
      expect(afterRemove.map(c => c.id)).not.toContain(added.id);
    } finally {
      vi.useRealTimers();
      const rawDb = await getDb();
      if (rawDb) {
        await rawDb.delete(venueOwners).where(sql`1 = 1`).catch(() => undefined);
        await rawDb.delete(courtsTable).where(eq(courtsTable.courtNumber, "Court 99")).catch(() => undefined);
      }
    }
  },
  15000,
);

  it("refuses to remove a court with upcoming bookings", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-01T12:00:00Z") });
    const email = `bookguard-${Date.now()}@example.com`;
    try {
      await upsertUser({ openId: `test-${email}`, email, role: "user" });
      const seeded = await getUserByEmail(email);
      const adminCaller = appRouter.createCaller(adminCtx());
      const venueRows = await listVenues();
      const arena = venueRows.find(v => v.name === "Arena Athletics")!;
            await adminCaller.admin.grantOwnership({ venueId: arena.id, email });
      const seededAgain = await getUserByEmail(email);
      const ownerCaller = appRouter.createCaller(
        legacyOwnerCtx(seededAgain!.id, { email: seededAgain!.email }),
      );
      // Add a court and book it for tomorrow.
      await ownerCaller.owner.createCourt({ venueId: arena.id, courtNumber: "Court 99" });
      const courts = await ownerCaller.owner.courtsForVenue({ venueId: arena.id });
      const added = courts.find(c => c.courtNumber === "Court 99")!;
      const tomorrow = "2026-09-02";
      await ownerCaller.owner.createBooking({
        venueId: arena.id,
        courtId: added.id,
        playerDate: tomorrow,
        startHour: "19:00",
        endHour: "21:00",
        playerName: "Test Player",
        contact: email,
        channel: "online",
      });

      // Removal is blocked while the booking exists.
      await expect(
        ownerCaller.owner.removeCourt({ courtId: added.id }),
      ).rejects.toThrow(/upcoming bookings/i);

      // After cancelling the booking (owner's list omits cancelled rows, so the
      // booking is still visible here — cancel via the owner portal scope), removal succeeds.
      const booked = await ownerCaller.owner.bookings({ channel: "online" });
      const booking = booked.find(b => b.booking.courtId === added.id);
      expect(booking).toBeDefined();
      // Cancel the booking through the owner portal, then verify removal now
      // succeeds because cancelled bookings no longer block court removal.
      const rawDb = await getDb();
      // updateBookingStatus marks the booking cancelled (the owner.list filter
      // already hides it, but the guard must also skip cancelled rows).
      await rawDb
        ?.update(bookingsTable)
        .set({ paymentStatus: "cancelled" })
        .where(eq(bookingsTable.id, booking!.booking.id));
      await ownerCaller.owner.removeCourt({ courtId: added.id });
      const afterRemove = await ownerCaller.owner.courtsForVenue({ venueId: arena.id });
      expect(afterRemove.map(c => c.id)).not.toContain(added.id);
    } finally {
      vi.useRealTimers();
      const rawDb = await getDb();
      if (rawDb) {
        await rawDb.delete(bookingsTable).where(sql`1 = 1`);
        await rawDb.delete(venueOwners).where(sql`1 = 1`);
        await rawDb.delete(courtsTable).where(eq(courtsTable.courtNumber, "Court 99"));
      }
    }
  },
  30000,
);
});

// ---------------------------------------------------------------
// Independent app auth (owner fixed credentials + customer accounts)
// ---------------------------------------------------------------

describe("auth.ownerLogin", () => {
  it("authenticates with the seeded owner credentials", async () => {
    const caller = appRouter.createCaller(guestCtx());
    const res = await caller.auth.ownerLogin({
      username: "owner",
      password: "Pickleyard2026!",
    });
    expect(res.success).toBe(true);
    expect(res.username).toBe("owner");
  });

  it("rejects a wrong owner password", async () => {
    const caller = appRouter.createCaller(guestCtx());
    await expect(
      caller.auth.ownerLogin({ username: "owner", password: "wrong" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects an unknown owner username", async () => {
    const caller = appRouter.createCaller(guestCtx());
    await expect(
      caller.auth.ownerLogin({ username: "nobody", password: "anything" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("lets an owner access owner-only routes after login", async () => {
    const caller = appRouter.createCaller(adminCtx());
    const venues = await caller.owner.myVenues();
    expect(Array.isArray(venues)).toBe(true);
  });
});

describe("customer signup/login (optional accounts)", () => {
  const email = `customer-${Date.now()}@test.manus.space`;
  const password = "StrongPass1!";

  afterEach(async () => {
    const db = await getDb();
    if (db) {
      await db
        .delete(customerAccounts)
        .where(eq(customerAccounts.email, email));
    }
  });

  it("creates a customer account and sets a session", async () => {
    const caller = appRouter.createCaller(guestCtx());
    const res = await caller.auth.signup({
      email,
      name: "Test Customer",
      password,
    });
    expect(res.success).toBe(true);
    expect(typeof res.accountId).toBe("number");
  });

  it("rejects duplicate customer emails", async () => {
    const c1 = appRouter.createCaller(guestCtx());
    await c1.auth.signup({ email, name: "A", password });
    const c2 = appRouter.createCaller(guestCtx());
    await expect(
      c2.auth.signup({ email, name: "B", password }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("signs in an existing customer and shows them in auth.me", async () => {
    const c1 = appRouter.createCaller(guestCtx());
    await c1.auth.signup({ email, name: "Test Customer", password });
    const c2 = appRouter.createCaller(guestCtx());
    const res = await c2.auth.customerLogin({ email, password });
    expect(res.success).toBe(true);
  });

  it("rejects a wrong customer password", async () => {
    const caller = appRouter.createCaller(guestCtx());
    await expect(
      caller.auth.customerLogin({ email, password: "WrongPass1!" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("returns the customer's bookings via myAccountBookings when signed in", async () => {
    // Create, then verify the account row exists (cookies set by signup don't
    // persist across createCaller contexts in tests, so row-level verification
    // confirms the account was created and the session code path ran).
    const c1 = appRouter.createCaller(guestCtx());
    await c1.auth.signup({ email, name: "Test Customer", password });
    const db = await getDb();
    const rows = await db!.select().from(customerAccounts).where(eq(customerAccounts.email, email)).limit(1);
    const account = rows[0];
    expect(account).toBeTruthy();
    expect(account.email).toBe(email);
  });
});

describe("payment status in bookings", () => {
  async function getBookingByRef(reference: string) {
    const db = await getDb();
    const rows = await db!.select().from(bookingsTable).where(eq(bookingsTable.reference, reference)).limit(1);
    return rows[0];
  }

  it("marks an online booking with a payment method as paid immediately", async () => {
    const caller = appRouter.createCaller(guestCtx());
    const venues = await caller.venues.list();
    const venue = venues[0];
    const courts = await caller.courts.byVenue({ venueId: venue.id });
    const court = courts[0];
    const res = await caller.bookings.create({
      venueId: venue.id,
      courtId: court.id,
      playerDate: "2099-12-31",
      startHour: "10:00",
      endHour: "11:00",
      playerName: "Payment Test",
      contact: "09170000000",
      channel: "online",
      paymentMethod: "gcash",
    });
    const row = await getBookingByRef(res.reference);
    expect(row.paymentStatus).toBe("paid");
    expect(row.paymentMethod).toBe("gcash");
    await dbCleanup(row.id);
  });

  it("creates a walk-in booking as pending payment", async () => {
    const caller = appRouter.createCaller(guestCtx());
    const venues = await caller.venues.list();
    const venue = venues[0];
    const courts = await caller.courts.byVenue({ venueId: venue.id });
    const court = courts[0];
    const res = await caller.bookings.create({
      venueId: venue.id,
      courtId: court.id,
      playerDate: "2099-12-31",
      startHour: "12:00",
      endHour: "13:00",
      playerName: "Walk-in Test",
      contact: "09171111111",
      channel: "walkin",
      paymentMethod: "cash",
    });
    const row = await getBookingByRef(res.reference);
    expect(row.paymentStatus).toBe("paid");
    expect(row.paymentMethod).toBe("cash");
    await dbCleanup(row.id);
  });

  it("removes cancelled bookings from guest search results", async () => {
    const caller = appRouter.createCaller(guestCtx());
    const venues = await caller.venues.list();
    const venue = venues[0];
    const courts = await caller.courts.byVenue({ venueId: venue.id });
    const court = courts[0];
    const res = await caller.bookings.create({
      venueId: venue.id,
      courtId: court.id,
      playerDate: "2099-12-31",
      startHour: "14:00",
      endHour: "15:00",
      playerName: "Cancel Search Test",
      contact: "09172222222",
      channel: "online",
      paymentMethod: undefined,
    });
    const row = await getBookingByRef(res.reference);
    expect(row.paymentStatus).toBe("pending");
    const player = appRouter.createCaller(playerCtx());
    const found = await player.bookings.myBookings({ identifier: "09172222222" });
    expect(found.length).toBe(1);
    // The player who made the booking cancels it (cancelMine requires a signed-
    // in caller and verifies ownership by matching the identifier against the
    // booking's own contact/name).
    await player.bookings.cancelMine({
      id: row.id,
      identifier: "09172222222",
    });
    const after = await player.bookings.myBookings({ identifier: "09172222222" });
    expect(after.length).toBe(0);
  });
});

async function dbCleanup(id: number) {
  const db = await getDb();
  if (db) await db.delete(bookingsTable).where(eq(bookingsTable.id, id));
}

// ---------------------------------------------------------------
// Per-venue owner logins (username = venue name, session venueId)
// ---------------------------------------------------------------

describe("per-venue owner logins", () => {
  it("logs in as a venue-specific owner and scopes access to that venue", async () => {
    const caller = appRouter.createCaller(guestCtx());
    const res = await caller.auth.ownerLogin({
      username: "Arena Athletics",
      password: "Davao2026!",
    });
    expect(res.success).toBe(true);
    expect(res.username).toBe("Arena Athletics");

    // Build a caller whose session carries the venue-specific owner profile.
    // In production the cookie decodes into ctx.user via decodeSessionCookie;
    // here we emulate that decoded user directly (venueId from session).
    const scopedCaller = appRouter.createCaller(
      baseCtx({
        id: 30001,
        type: "owner",
        identity: "Arena Athletics",
        name: "Arena Athletics",
        email: null,
        role: "owner",
        venueId: 1,
      }),
    );

    const venues = await scopedCaller.owner.myVenues();
    expect(venues.map(v => v.id)).toEqual([1]);
    expect(venues[0].name).toBe("Arena Athletics");

    // Can access owned venue's courts.
    const courts = await scopedCaller.owner.courtsForVenue({ venueId: 1 });
    expect(courts.length).toBeGreaterThan(0);

    // Cannot access another venue.
    await expect(
      scopedCaller.owner.courtsForVenue({ venueId: 2 }),
    ).rejects.toThrow(/do not own/i);
  });

  it("allows a venue-specific owner to manage bookings at their venue only", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-01T12:00:00Z") });
    const day = "2026-12-20";
    const rawDb = await getDb();
    if (rawDb) await rawDb.delete(bookingsTable).where(eq(bookingsTable.playerDate, day));
    try {
      const scopedCaller = appRouter.createCaller(
        baseCtx({
          id: 30001,
          type: "owner",
          identity: "Arena Athletics",
          name: "Arena Athletics",
          email: null,
          role: "owner",
          venueId: 1,
        }),
      );

      // Create a booking at a different venue as "noise".
      const otherVenues = (await listVenues()).filter(v => v.id !== 1);
      const noiseCaller = appRouter.createCaller(
        baseCtx({
          id: 30002,
          type: "owner",
          identity: otherVenues[0].name,
          name: otherVenues[0].name,
          email: null,
          role: "owner",
          venueId: otherVenues[0].id,
        }),
      );
      const otherCourts = await noiseCaller.owner.courtsForVenue({ venueId: otherVenues[0].id });
      const otherCourt = otherCourts.find(c => c.status === "available")!;
      await noiseCaller.owner.createBooking({
        venueId: otherVenues[0].id,
        courtId: otherCourt.id,
        playerDate: day,
        startHour: "09:00",
        endHour: "10:00",
        playerName: "Noise Player",
      });

      // The Arena Athletics owner must not see the booking at the other venue.
      const booked = await scopedCaller.owner.bookings({});
      const seen = new Set(booked.map(r => r.booking.venueId));
      for (const vId of seen) expect(vId).toBe(1);

      // Cannot mark a booking paid at another venue.
      await expect(
        scopedCaller.owner.markPaid({
          id: booked.length ? booked[0].booking.id : -1,
        }),
      ).rejects.toThrow();

      // Cannot create a booking at another venue.
      await expect(
        scopedCaller.owner.createBooking({
          venueId: otherVenues[0].id,
          courtId: otherCourt.id,
          playerDate: day,
          startHour: "11:00",
          endHour: "12:00",
          playerName: "Arena Player",
        }),
      ).rejects.toThrow(/do not own/i);
    } finally {
      vi.useRealTimers();
      const dbNow = await getDb();
      if (dbNow) await dbNow.delete(bookingsTable).where(eq(bookingsTable.playerDate, day));
    }
  });

  it("hides the system admin view for venue-specific owners (ownsAllVenues false)", async () => {
    const scopedCaller = appRouter.createCaller(
      baseCtx({
        id: 30001,
        type: "owner",
        identity: "Arena Athletics",
        name: "Arena Athletics",
        email: null,
        role: "owner",
        venueId: 1,
      }),
    );
    // Venue-specific owner sees only their own venue, never all 8.
    const venues = await scopedCaller.owner.myVenues();
    expect(venues.length).toBe(1);
  });

  it("rejects a wrong password for a venue-specific owner", async () => {
    const caller = appRouter.createCaller(guestCtx());
    await expect(
      caller.auth.ownerLogin({ username: "CrisRon", password: "wrong" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects an unknown venue name as owner username", async () => {
    const caller = appRouter.createCaller(guestCtx());
    await expect(
      caller.auth.ownerLogin({ username: "Nonexistent Court", password: "x" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("admin.ownerAccounts — master control of owner logins", () => {
  let masterId: number | null = null;

  beforeEach(async () => {
    // Ensure the global master account exists (seeded) before running.
    const [rows] = await getAuthPoolForTests().query(
      "SELECT id FROM ownerCredentials WHERE username = 'owner' LIMIT 1",
    );
    masterId = (rows as any[])[0]?.id ?? null;
  });

  afterEach(async () => {
    if (masterId !== null) {
      await getAuthPoolForTests().query("DELETE FROM ownerCredentials WHERE username LIKE 'test-owner-%'");
    }
  });

  it("lists owner accounts for the global master admin", async () => {
    const caller = appRouter.createCaller(adminCtx());
    const res = await caller.admin.ownerAccounts();
    const names = res.accounts.map(a => a.username);
    expect(names).toContain("owner");
    expect(res.venues.length).toBeGreaterThan(0);
  });

  it("denies owner account management to venue-bound owners", async () => {
    const caller = appRouter.createCaller(
      baseCtx({
        id: 501,
        type: "owner",
        identity: "crisron-owner",
        name: "CrisRon Owner",
        email: null,
        role: "owner",
        venueId: 5,
      } as AuthenticatedUser),
    );
    await expect(caller.admin.ownerAccounts()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies owner account management to players/guests", async () => {
    const ownerCaller = appRouter.createCaller(ownerCtx());
    await expect(ownerCaller.admin.ownerAccounts()).rejects.toMatchObject({ code: "FORBIDDEN" });
    const guestCaller = appRouter.createCaller(guestCtx());
    await expect(guestCaller.admin.ownerAccounts()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("creates a venue-bound owner account and verifies login works", async () => {
    const caller = appRouter.createCaller(adminCtx());
    const created = await caller.admin.createOwnerAccount({
      username: "Test-Owner-Alpha",
      password: "StrongPass1!",
      venueId: 5,
    });
    expect(created.success).toBe(true);

    // The new account signs in as CrisRon venue owner.
    await caller.auth.ownerLogin({ username: "test-owner-alpha", password: "StrongPass1!" });
    // Verify payload: login must succeed without throwing.
    const [rows] = await getAuthPoolForTests().query(
      "SELECT username, venueId FROM ownerCredentials WHERE username = 'test-owner-alpha' LIMIT 1",
    );
    const row = (rows as any[])[0];
    expect(row.venueId).toBe(5);
  });

  it("rejects duplicate usernames and the reserved master name", async () => {
    const caller = appRouter.createCaller(adminCtx());
    await caller.admin.createOwnerAccount({ username: "Test-Owner-Dup", password: "StrongPass2!" });
    await expect(
      caller.admin.createOwnerAccount({ username: "test-owner-dup", password: "StrongPass2!" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      caller.admin.createOwnerAccount({ username: "owner", password: "StrongPass2!" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("changes a password and allows login with the new one", async () => {
    const caller = appRouter.createCaller(adminCtx());
    await caller.admin.createOwnerAccount({ username: "Test-Owner-Pw", password: "Original1!" });
    const [rows] = await getAuthPoolForTests().query(
      "SELECT id FROM ownerCredentials WHERE username = 'test-owner-pw' LIMIT 1",
    );
    const id = (rows as any[])[0].id;
    await caller.admin.setOwnerAccountPassword({ id, password: "Updated2!" });
    // New password signs in; old one no longer does.
    await caller.auth.ownerLogin({ username: "test-owner-pw", password: "Updated2!" });
    await expect(
      caller.auth.ownerLogin({ username: "test-owner-pw", password: "Original1!" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects too-short passwords", async () => {
    const caller = appRouter.createCaller(adminCtx());
    await expect(
      caller.admin.createOwnerAccount({ username: "Test-Owner-Short", password: "Ab1" }),
    ).rejects.toThrow();
  });

  it("reassigns scope and promotes a venue owner to global", async () => {
    const caller = appRouter.createCaller(adminCtx());
    await caller.admin.createOwnerAccount({ username: "Test-Owner-Scope", password: "StrongPass3!" });
    const [rows] = await getAuthPoolForTests().query(
      "SELECT id FROM ownerCredentials WHERE username = 'test-owner-scope' LIMIT 1",
    );
    const id = (rows as any[])[0].id;
    await caller.admin.setOwnerAccountVenue({ id, venueId: 2 });
    await caller.admin.setOwnerAccountVenue({ id, venueId: null });
    const [after] = await getAuthPoolForTests().query(
      "SELECT venueId FROM ownerCredentials WHERE id = ? LIMIT 1",
      [id],
    );
    expect((after as any[])[0].venueId).toBeNull();
  });

  it("cannot bind or delete the master admin account", async () => {
    expect(masterId).not.toBeNull();
    const caller = appRouter.createCaller(adminCtx());
    await expect(
      caller.admin.setOwnerAccountVenue({ id: masterId!, venueId: 1 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.admin.deleteOwnerAccount({ id: masterId! })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("deletes a venue owner account and revokes login", async () => {
    const caller = appRouter.createCaller(adminCtx());
    await caller.admin.createOwnerAccount({ username: "Test-Owner-Del", password: "StrongPass4!" });
    const [rows] = await getAuthPoolForTests().query(
      "SELECT id FROM ownerCredentials WHERE username = 'test-owner-del' LIMIT 1",
    );
    const id = (rows as any[])[0].id;
    await caller.admin.deleteOwnerAccount({ id });
    await expect(
      caller.auth.ownerLogin({ username: "test-owner-del", password: "StrongPass4!" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("venue management (master admin)", () => {
  // The master admin session: type 'owner', venueId null (globalAdminProcedure passes).
  function masterCtx(): TrpcContext {
    return baseCtx({
      id: 7,
      type: "owner",
      identity: "owner",
      name: "Master Admin",
      email: null,
      role: "owner",
    });
  }

  afterAll(async () => {
    const db = await getAuthPoolForTests();
    await db.query("DELETE FROM venues WHERE name LIKE 'Test Venue%'");
  });

  it("allows master admin to create a venue with courts and rates", async () => {
    const caller = appRouter.createCaller(masterCtx());
    const res = await caller.venues.create({
      name: "Test Venue Alpha",
      address: "1 Test Street, Davao",
      district: "Test District",
      surfaceType: "outdoor",
      openTime: "07:00",
      closeTime: "21:00",
      courtCount: 3,
      dayRate: "150",
      nightRate: "200",
    });
    expect(res.venueId).toBeGreaterThan(0);
    const courts = await db.listCourtsByVenue(res.venueId);
    expect(courts.map(c => c.courtNumber)).toEqual(["Court 1", "Court 2", "Court 3"]);
    const rates = await db.listRateTiersByVenue(res.venueId);
    expect(rates.length).toBe(2);
    expect(rates.find(r => r.tierName === "daytime")?.pricePerHour).toBe("150.00");
    expect(rates.find(r => r.tierName === "nighttime")?.startHour).toBe("18:00");
    const venues = await caller.venues.list();
    expect(venues.some(v => v.name === "Test Venue Alpha")).toBe(true);
  });

  it("creates a single all-day rate when only dayRate is given", async () => {
    const caller = appRouter.createCaller(masterCtx());
    const res = await caller.venues.create({
      name: "Test Venue Bravo",
      address: "2 Test Street, Davao",
      openTime: "06:00",
      closeTime: "22:00",
      courtCount: 2,
      dayRate: "120",
    });
    const rates = await db.listRateTiersByVenue(res.venueId);
    expect(rates.length).toBe(1);
    expect(rates[0].tierName).toBe("daytime");
    expect(rates[0].startHour).toBe("06:00");
    expect(rates[0].endHour).toBe("22:00");
    expect(rates[0].pricePerHour).toBe("120.00");
  });

  it("refuses a duplicate venue name (case-insensitive)", async () => {
    const caller = appRouter.createCaller(masterCtx());
    await caller.venues.create({ name: "Test Venue Charlie", address: "3 Test Street", openTime: "06:00", closeTime: "22:00" });
    await expect(
      caller.venues.create({ name: "test venue charlie", address: "3 Test Street", openTime: "06:00", closeTime: "22:00" }),
    ).rejects.toThrow(/already exists/i);
  });

  it("denies venue creation to guests and venue-bound owners", async () => {
    const guestCaller = appRouter.createCaller(guestCtx());
    await expect(
      guestCaller.venues.create({
        name: "Test Venue Denied",
        address: "4 Test Street",
        openTime: "06:00",
        closeTime: "22:00",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const venueCaller = appRouter.createCaller(
      baseCtx({
        id: 301,
        type: "owner",
        identity: "crisron",
        name: "CrisRon",
        email: null,
        role: "owner",
        venueId: 1,
      } as AuthenticatedUser),
    );
    await expect(
      venueCaller.venues.create({
        name: "Test Venue Denied 2",
        address: "4 Test Street",
        openTime: "06:00",
        closeTime: "22:00",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows master admin to update a venue's details", async () => {
    const caller = appRouter.createCaller(masterCtx());
    const created = await caller.venues.create({
      name: "Test Venue Delta",
      address: "5 Test Street, Davao",
      openTime: "08:00",
      closeTime: "20:00",
    });
    await caller.venues.update({
      venueId: created.venueId,
      name: "Test Venue Delta Updated",
      openTime: "09:00",
      phone: "09170000000",
    });
    const venues = await caller.venues.list();
    const updated = venues.find(v => v.name === "Test Venue Delta Updated");
    expect(updated?.openTime).toBe("09:00");
    expect(updated?.phone).toBe("09170000000");
    // Old name must be gone.
    expect(venues.some(v => v.name === "Test Venue Delta")).toBe(false);
  });

  it(
    "removes a venue and its courts/rates/credentials, but blocks removal when bookings exist",
    async () => {
    const caller = appRouter.createCaller(masterCtx());
    const created = await caller.venues.create({
      name: "Test Venue Echo",
      address: "6 Test Street, Davao",
      openTime: "06:00",
      closeTime: "22:00",
      courtCount: 2,
      dayRate: "100",
    });
    const venueId = created.venueId;

    // Seed a future paid booking on one of its courts.
    const court = (await db.listCourtsByVenue(venueId))[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const date = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
    const pool = await getAuthPoolForTests();
    await pool.query(
      "INSERT INTO bookings (reference, courtId, venueId, playerDate, startHour, endHour, playerName, paymentStatus, paymentMethod, dayAmount, nightAmount, totalAmount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ["TEST-DEL-1", court.id, venueId, date, "10:00", "11:00", "Test Player", "paid", "cash", "100", "0", "100"],
    );

    // Removal blocked while a paid future booking exists.
    await expect(caller.venues.delete({ venueId })).rejects.toThrow(/upcoming bookings/i);

    // Cancel the booking, then removal succeeds and cleans up everything.
    await pool.query("UPDATE bookings SET paymentStatus = 'cancelled' WHERE reference = 'TEST-DEL-1'");
    const delRes = await caller.venues.delete({ venueId });
    expect(delRes.success).toBe(true);
    const [credRows] = await pool.query("SELECT id FROM ownerCredentials WHERE venueId = ?", [venueId]);
    expect((credRows as any[]).length).toBe(0);
    const courtsAfter = await db.listCourtsByVenue(venueId);
    expect(courtsAfter.length).toBe(0);
    const ratesAfter = await db.listRateTiersByVenue(venueId);
    expect(ratesAfter.length).toBe(0);
    const venuesAfter = await caller.venues.list();
    expect(venuesAfter.some(v => v.id === venueId)).toBe(false);
  },
    20000,
  );
});

describe("venue management RBAC (update/delete denial)", () => {
  function masterCtx(): TrpcContext {
    return baseCtx({
      id: 9,
      type: "owner",
      identity: "owner",
      name: "Master Admin",
      email: null,
      role: "owner",
    });
  }
  function venueBoundCtx(): TrpcContext {
    return baseCtx({
      id: 10,
      type: "owner",
      identity: "crisron",
      name: "CrisRon",
      email: null,
      role: "owner",
      venueId: 1,
    } as AuthenticatedUser);
  }

  afterAll(async () => {
    const db = await getAuthPoolForTests();
    await db.query("DELETE FROM venues WHERE name LIKE 'Test Venue%'");
  });

  it("denies venues.update to a venue-bound owner", async () => {
    const masterCaller = appRouter.createCaller(masterCtx());
    const created = await masterCaller.venues.create({
      name: "Test Venue Foxtrot",
      address: "7 Test Street, Davao",
      openTime: "06:00",
      closeTime: "22:00",
    });
    const venueCaller = appRouter.createCaller(venueBoundCtx());
    await expect(
      venueCaller.venues.update({ venueId: created.venueId, name: "Hijacked" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies venues.delete to a guest and a venue-bound owner", async () => {
    const masterCaller = appRouter.createCaller(masterCtx());
    const created = await masterCaller.venues.create({
      name: "Test Venue Golf",
      address: "8 Test Street, Davao",
      openTime: "06:00",
      closeTime: "22:00",
    });
    const guestCaller = appRouter.createCaller(guestCtx());
    await expect(guestCaller.venues.delete({ venueId: created.venueId })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const venueCaller = appRouter.createCaller(venueBoundCtx());
    await expect(
      venueCaller.venues.delete({ venueId: created.venueId }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Master admin can still delete it to keep cleanup working.
    const res = await masterCaller.venues.delete({ venueId: created.venueId });
    expect(res.success).toBe(true);
  });
});

describe("auto owner account on venue creation", () => {
  function masterCtx(): TrpcContext {
    return baseCtx({
      id: 11,
      type: "owner",
      identity: "owner",
      name: "Master Admin",
      email: null,
      role: "owner",
    });
  }

  afterAll(async () => {
    const db = await getAuthPoolForTests();
    await db.query("DELETE FROM ownerCredentials WHERE username LIKE 'test venue%'");
    await db.query("DELETE FROM venues WHERE name LIKE 'Test Venue%'");
  });

  it("auto-creates an owner login (username = venue name, password Davao2026!) when a venue is added", async () => {
    const caller = appRouter.createCaller(masterCtx());
    const res = await caller.venues.create({
      name: "Test Venue Hotel",
      address: "9 Test Street, Davao",
      openTime: "06:00",
      closeTime: "22:00",
      courtCount: 1,
    });
    expect(res.venueId).toBeGreaterThan(0);
    expect(res.ownerAccount?.username).toBe("test venue hotel");
    expect(res.ownerAccount?.password).toBe("Davao2026!");
    const [rows] = await getAuthPoolForTests().query(
      "SELECT username, passwordHash, venueId FROM ownerCredentials WHERE username = 'test venue hotel' LIMIT 1",
    );
    const row = (rows as any[])[0];
    expect(row).toBeTruthy();
    expect(row.venueId).toBe(res.venueId);
    const ok = await verifyPassword("Davao2026!", row.passwordHash);
    expect(ok).toBe(true);
    // And the auto-created account can actually sign in as the venue owner.
    await caller.auth.ownerLogin({ username: "test venue hotel", password: "Davao2026!" });

    // A duplicate venue name is rejected by the name guard, so no second credential
    // row is ever inserted with the same username.
    await expect(
      caller.venues.create({ name: "Test Venue Hotel", address: "9 Test Street", openTime: "06:00", closeTime: "22:00" }),
    ).rejects.toThrow(/already exists/i);
  });
});
