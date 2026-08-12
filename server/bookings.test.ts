import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

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
    try {
      const caller = appRouter.createCaller(guestCtx());
      const venues = await caller.venues.list();
      const arena = venues.find(v => v.name === "Arena Athletics")!;
      const courts = await caller.courts.byVenue({ venueId: arena.id });
      const court = courts.find(c => c.status === "available")!;

      const ref = await caller.bookings.create({
        venueId: arena.id,
        courtId: court.id,
        playerDate: "2026-09-05",
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
          playerDate: "2026-09-05",
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
        playerDate: "2026-09-05",
        startHour: "10:00",
        endHour: "12:00",
        playerName: "Other Player",
        channel: "walkin",
        paymentMethod: "cash",
      });
      expect(ref2.reference).toBeTruthy();
    } finally {
      vi.useRealTimers();
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
