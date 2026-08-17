import { describe, it, expect, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import {
  getUserByEmail,
  upsertUser,
  listVenues,
  deleteReviewsByPlayerNamePrefix,
  deleteVenuesByNamePattern,
  deleteUserByOpenId,
  grantVenueOwnership,
} from "./db";

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
function guestCtx(): TrpcContext {
  return baseCtx(null);
}
// Master owner context — owns all venues (type 'owner', no venueId).
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
// Legacy-scope owner: role 'owner' passes RBAC; type 'customer' keeps the
// caller scoped to its venueOwners rows (ownsAllVenues is false).
function legacyOwnerCtx(
  userId: number,
  opts?: { email?: string | null },
): TrpcContext {
  return baseCtx({
    id: userId,
    type: "customer",
    identity: opts?.email ?? `legacy-owner-${userId}@example.com`,
    name: opts?.email ?? `Legacy Owner ${userId}`,
    email: opts?.email ?? null,
    role: "owner",
  });
}

const venueName = "Arena Athletics";

describe("reviews router — public endpoints and validation", () => {
  afterEach(async () => {
    // Scoped cleanup only — never wipe real player reviews from the live DB.
    await deleteReviewsByPlayerNamePrefix("Ada").catch(() => undefined);
    await deleteReviewsByPlayerNamePrefix("ShortGuy").catch(() => undefined);
    await deleteReviewsByPlayerNamePrefix("Bench Player").catch(() => undefined);
    await deleteReviewsByPlayerNamePrefix("Dink Master").catch(() => undefined);
  });

  it("returns empty stats when a venue has no reviews", async () => {
    const venues = await listVenues();
    const arena = venues.find(v => v.name === venueName)!;
    const stats = await appRouter.createCaller(guestCtx()).reviews.stats({ venueId: arena.id });
    expect(stats.count).toBe(0);
    expect(stats.average).toBe(0);
  });

  it("rejects ratings outside 1-5", async () => {
    const venues = await listVenues();
    const arena = venues.find(v => v.name === venueName)!;
    await expect(
      appRouter
        .createCaller(guestCtx())
        .reviews.create({ venueId: arena.id, playerName: "Ada", rating: 0, comment: "x".repeat(12) }),
    ).rejects.toThrow();
    await expect(
      appRouter
        .createCaller(guestCtx())
        .reviews.create({ venueId: arena.id, playerName: "Ada", rating: 6, comment: "x".repeat(12) }),
    ).rejects.toThrow();
  });

  it("rejects comments longer than 1000 characters", async () => {
    const venues = await listVenues();
    const arena = venues.find(v => v.name === venueName)!;
    await expect(
      appRouter
        .createCaller(guestCtx())
        .reviews.create({ venueId: arena.id, playerName: "Ada", rating: 5, comment: "x".repeat(1001) }),
    ).rejects.toThrow();
  });

  it("accepts valid 1-9 character comments for short honest feedback", async () => {
    const venues = await listVenues();
    const arena = venues.find(v => v.name === venueName)!;
    const r = await appRouter.createCaller(guestCtx()).reviews.create({
      venueId: arena.id,
      playerName: "ShortGuy",
      rating: 5,
      comment: "Great!",
    });
    expect(r.success).toBe(true);
  });

  it("rejects unknown venues and booking refs that do not belong to the venue", async () => {
    const venues = await listVenues();
    const arena = venues.find(v => v.name === venueName)!;
    await expect(
      appRouter
        .createCaller(guestCtx())
        .reviews.create({
          venueId: 999999,
          playerName: "Ada",
          rating: 4,
          comment: "x".repeat(12),
        }),
    ).rejects.toThrow();

    await expect(
      appRouter
        .createCaller(guestCtx())
        .reviews.create({
          venueId: arena.id,
          playerName: "Ada",
          rating: 4,
          comment: "x".repeat(12),
          bookingRef: "INVALID-9999",
        }),
    ).rejects.toThrow();
  });

  it("creates a review and updates stats", async () => {
    const venues = await listVenues();
    const arena = venues.find(v => v.name === venueName)!;
    const created = await appRouter.createCaller(guestCtx()).reviews.create({
      venueId: arena.id,
      playerName: "Bench Player",
      rating: 5,
      comment: "Great courts and friendly staff",
    });
    expect(created.success).toBe(true);

    const rows = await appRouter.createCaller(guestCtx()).reviews.list({ venueId: arena.id });
    expect(rows.some((r: any) => r.playerName === "Bench Player")).toBe(true);

    const statsAll = await appRouter.createCaller(guestCtx()).reviews.stats();
    expect(Number(statsAll[arena.id]?.count)).toBe(1);
    expect(Number(statsAll[arena.id]?.average)).toBe(5);

    // Second review averages correctly
    await appRouter.createCaller(guestCtx()).reviews.create({
      venueId: arena.id,
      playerName: "Dink Master",
      rating: 3,
      comment: "Decent but can be noisy at peak hours",
    });
    const stats2 = await appRouter.createCaller(guestCtx()).reviews.stats();
    expect(Number(stats2[arena.id]?.count)).toBe(2);
    expect(Math.round(Number(stats2[arena.id]?.average))).toBe(4);
  });
});

describe("owner.reviews — scoping rules", () => {
  it("owner sees reviews for owned venues only and guests are rejected", async () => {
    const email = `review-owner-${Date.now()}@example.com`;
    const venues = await listVenues();
    const arena = venues.find(v => v.name === venueName)!;
    const other = venues.find(v => v.id !== arena.id)!;
    try {
      await upsertUser({ openId: `test-${email}`, email, role: "user" });
      const adminCaller = appRouter.createCaller(adminCtx());
      await adminCaller.admin.grantOwnership({ venueId: arena.id, email });
      const seeded = await getUserByEmail(email);
      if (!seeded) throw new Error(`test user not created for ${email}`);
      // Parallel worker tests wipe venueOwners rows — re-grant right before use
      // so this test's scoping assertions are never defeated by a sibling worker.
      await grantVenueOwnership(seeded.id, arena.id);
      const ownerCaller = appRouter.createCaller(legacyOwnerCtx(seeded.id, { email }));

      // A guest's review for the owned venue
      await appRouter.createCaller(guestCtx()).reviews.create({
        venueId: arena.id,
        playerName: "Reviewer",
        rating: 4,
        comment: "x".repeat(12),
      });
      // A guest's review for the unowned venue
      await appRouter.createCaller(guestCtx()).reviews.create({
        venueId: other.id,
        playerName: "OtherReviewer",
        rating: 5,
        comment: "x".repeat(12),
      });

      // Other workers (bookings tests) wipe venueOwners rows concurrently, so
      // re-grant and re-fetch until this test's review row is visible.
      let ownerData = await ownerCaller.owner.reviews();
      for (let attempt = 0; attempt < 5 && !ownerData.rows.some((r: any) => r.playerName === "Reviewer"); attempt++) {
        await grantVenueOwnership(seeded.id, arena.id);
        await new Promise(res => setTimeout(res, 250));
        ownerData = await ownerCaller.owner.reviews();
      }
      expect(ownerData.rows.some((r: any) => r.playerName === "Reviewer")).toBe(true);
      expect(ownerData.rows.every((r: any) => r.playerName !== "OtherReviewer")).toBe(true);
      // Per-venue stats when scoped to the owned venue
      const scopedStats = await ownerCaller.owner.reviews({ venueId: arena.id });
      expect(scopedStats.stats?.count ?? 0).toBe(1);
      expect(scopedStats.stats?.average ?? 0).toBe(4);

      // A guest cannot access the owner feed
      await expect(appRouter.createCaller(guestCtx()).owner.reviews()).rejects.toThrow();

      // Scoped filter: passing the unowned venue id returns nothing
      const scoped = await ownerCaller.owner.reviews({ venueId: other.id });
      expect(scoped.rows.length).toBe(0);
    } finally {
      await deleteReviewsByPlayerNamePrefix("Reviewer").catch(() => undefined);
      await deleteReviewsByPlayerNamePrefix("OtherReviewer").catch(() => undefined);
      await deleteReviewsByPlayerNamePrefix("CascadeTest").catch(() => undefined);
      await deleteUserByOpenId(`test-${email}`).catch(() => undefined);
    }
  });

  it("master owner sees reviews for all venues when scoped per-venue", async () => {
    const venues = await listVenues();
    const arena = venues.find(v => v.name === venueName)!;
    try {
      await appRouter.createCaller(guestCtx()).reviews.create({
        venueId: arena.id,
        playerName: "MasterView",
        rating: 5,
        comment: "x".repeat(12),
      });
      const master = appRouter.createCaller(adminCtx());
      // Master with a venueId filter still sees the review (owns all venues).
      const scoped = await master.owner.reviews({ venueId: arena.id });
      expect(scoped.rows.some((r: any) => r.playerName === "MasterView")).toBe(true);
      // Master without a filter pulls every review system-wide (no venue list
      // attached to their session) — the master owns all venues, so the feed
      // must never be empty.
      const all = await master.owner.reviews();
      expect(all.rows.some((r: any) => r.playerName === "MasterView")).toBe(true);
    } finally {
      await deleteReviewsByPlayerNamePrefix("MasterView").catch(() => undefined);
    }
  });
});

describe("reviews cleanup", () => {
  it("deleting a venue cascades and removes its reviews", async () => {
    const venues = await listVenues();
    // Use a freshly created test venue so we do not touch real data.
    try {
      const adminCaller = appRouter.createCaller(adminCtx());
      const created = await adminCaller.venues.create({
        name: `Reviews Cascade Test ${Date.now()}`,
        address: "Test address, Davao City",
        district: "Test",
        surfaceType: "outdoor",
        openTime: "06:00",
        closeTime: "24:00",
        phone: "09000000000",
        description: "Ephemeral test venue for reviews cascade coverage",
        courtCount: 1,
        dayRate: "100",
        nightRate: "150",
      });
      const venueId = Number((created as any)?.venueId ?? 0);
      await appRouter.createCaller(guestCtx()).reviews.create({
        venueId,
        playerName: "CascadeTest",
        rating: 5,
        comment: "x".repeat(12),
      });
      const before = await appRouter.createCaller(guestCtx()).reviews.stats({ venueId });
      expect(before.count).toBe(1);
      await deleteVenuesByNamePattern("Reviews Cascade Test%").catch(() => undefined);
      const gone = await appRouter.createCaller(guestCtx()).reviews.stats({ venueId });
      expect(gone.count).toBe(0);
    } finally {
      await deleteReviewsByPlayerNamePrefix("CascadeTest").catch(() => undefined);
    }
  });
});
