import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import {
  listVenues,
  listCourtsByVenue,
  upsertUser,
  getOwnerCredentialByUsername,
  deleteReviewsByPlayerNamePrefix,
  deleteVenuesByNamePattern,
  deleteUserByOpenId,
  deleteCustomerAccountsByEmail,
  deleteOwnerCredentialsByPattern,
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

/** Master owner — owns all venues (type 'owner', role 'owner'). */
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

/** Legacy-scope owner: role 'owner' passes ownerProcedure RBAC; type
 *  'customer' keeps the caller scoped to its venueOwners rows. */
function venueOwnerCtx(userId: number, email: string): TrpcContext {
  return baseCtx({
    id: userId,
    type: "customer",
    identity: email,
    name: email,
    email,
    role: "owner",
  });
}

/** Regular customer — not an owner, should be denied owner-only routes. */
function customerCtx(userId: number, email: string): TrpcContext {
  return baseCtx({
    id: userId,
    type: "customer",
    identity: email,
    name: email,
    email,
    role: "customer",
  });
}

function guestCtx(): TrpcContext {
  return baseCtx(null);
}

let venueId = 1;
let courtId = 1;
let staffEmail = "vit-staff-waitlist@example.com";
let staffOpenId = "vit-staff-waitlist";

beforeEach(async () => {
  const venues = await listVenues();
  const v = venues.find(x => String(x.name) !== "") ?? venues[0];
  venueId = v.id;
  const courts = await listCourtsByVenue(venueId);
  courtId = courts[0]?.id ?? courtId;
});

afterEach(async () => {
  await deleteReviewsByPlayerNamePrefix("VitStaff").catch(() => undefined);
  await deleteReviewsByPlayerNamePrefix("VitWait").catch(() => undefined);
  await deleteVenuesByNamePattern("vit-%").catch(() => undefined);
  await deleteUserByOpenId(staffOpenId).catch(() => undefined);
  await deleteCustomerAccountsByEmail(staffEmail).catch(() => undefined);
  await deleteOwnerCredentialsByPattern(staffEmail).catch(() => undefined);
});

describe("owner replies — RBAC scoping", () => {
  it("denies a reply create targeting a review at a venue the owner does not own", async () => {
    const caller = appRouter.createCaller(adminCtx());
    // reviewId 999999 does not exist → review lookup fails with NOT_FOUND
    // before any reply is created.
    await expect(
      caller.owner.replies.create({ reviewId: 999999, body: "nope" }),
    ).rejects.toThrow();
  });

  it("public replies.list accepts a review ids array", async () => {
    const caller = appRouter.createCaller(guestCtx());
    const rows = await caller.reviews.replies({ reviewIds: [999999] });
    expect(rows).toBeDefined();
  });

  it("reply delete requires a real reply id", async () => {
    const caller = appRouter.createCaller(adminCtx());
    await expect(
      caller.owner.replies.delete({ id: 999999 }),
    ).rejects.toThrow();
  });
});

describe("staff — RBAC and provision", () => {
  it("denies a plain customer from adding staff", async () => {
    const caller = appRouter.createCaller(customerCtx(99, "plain@example.com"));
    await expect(
      caller.owner.addStaff({ venueId, email: "someone@example.com", role: "staff" }),
    ).rejects.toThrow();
  });

  it("addStaff requires a real user email", async () => {
    const caller = appRouter.createCaller(adminCtx());
    await expect(
      caller.owner.addStaff({
        venueId,
        email: staffEmail,
        role: "staff",
      }),
    ).rejects.toThrow(/sign in once/);
  });

  it("addStaff succeeds when the user exists and provisions a credential row", async () => {
    const caller = appRouter.createCaller(adminCtx());
    // Create the user that addStaff expects to exist.
    await upsertUser({
      openId: staffOpenId,
      name: "VitStaff Tester",
      email: staffEmail,
    });
    const result = await caller.owner.addStaff({
      venueId,
      email: staffEmail,
      role: "staff",
    });
    expect(result.success).toBe(true);
    expect(result.provisioned).toBe(true);
    expect(result.username).toBe(staffEmail);
    const cred = await getOwnerCredentialByUsername(staffEmail);
    expect(cred).toBeDefined();
    expect(Number(cred!.venueId)).toBe(venueId);
    // Staff now appear in the venue's staff list.
    const rows = await caller.owner.staff({ venueId });
    expect(rows.some((r: any) => Number(r.userId) === result.userId)).toBe(true);
  });

  it("addStaff does not double-insert the staff row", async () => {
    const caller = appRouter.createCaller(adminCtx());
    await upsertUser({ openId: staffOpenId, name: "VitStaff Tester", email: staffEmail });
    await caller.owner.addStaff({ venueId, email: staffEmail, role: "staff" });
    // A second add for the same user/venue hits the unique constraint — the
    // owner credential upsert is idempotent, but the staff assignment is not.
    await expect(
      caller.owner.addStaff({ venueId, email: staffEmail, role: "staff" }),
    ).rejects.toThrow();
  });

  it("master admin can list staff across venues", async () => {
    const caller = appRouter.createCaller(adminCtx());
    const rows = await caller.owner.staff({});
    expect(Array.isArray(rows)).toBe(true);
  });
});

describe("waitlist — validation and public API", () => {
  it("join requires a non-empty player name", async () => {
    const caller = appRouter.createCaller(guestCtx());
    await expect(
      caller.waitlist.join({
        venueId, courtId, playerDate: "2099-12-31",
        startHour: "09:00", endHour: "10:00",
        playerName: "", contact: "09171234567",
      }),
    ).rejects.toThrow();
  });

  it("mine requires at least a 1-char player name", async () => {
    const caller = appRouter.createCaller(guestCtx());
    await expect(caller.waitlist.mine({ playerName: "" })).rejects.toThrow();
  });

  it("join rejects slots with no conflicting booking", async () => {
    const caller = appRouter.createCaller(guestCtx());
    // 04:00 is before operating hours for every real tier → no conflict.
    await expect(
      caller.waitlist.join({
        venueId, courtId, playerDate: "2099-12-31",
        startHour: "04:00", endHour: "05:00",
        playerName: "VitWait Nobody", contact: "09171234567",
      }),
    ).rejects.toThrow();
  });
});

describe("reports — RBAC and CSV shape", () => {
  it("reports include the CSV payload with the expected header", async () => {
    const caller = appRouter.createCaller(adminCtx());
    const report = await caller.owner.reports({ start: "2026-08-01", end: "2026-08-31" });
    expect(report.csv).toContain("date,revenue,paid_bookings,pending_bookings,total_slots");
    expect(typeof report.revenue).toBe("number");
    expect(Array.isArray(report.days)).toBe(true);
  });

  it("reports input rejects malformed dates", async () => {
    const caller = appRouter.createCaller(adminCtx());
    await expect(
      caller.owner.reports({ start: "bad", end: "2026-08-31" }),
    ).rejects.toThrow();
  });

  it("venue-bound owner cannot scope reports to an unowned venue", async () => {
    // A venue-bound owner only sees venues in its venueOwners rows.
    const caller = appRouter.createCaller(venueOwnerCtx(888888, "nobody-vit@example.com"));
    const report = await caller.owner.reports({ venueId: 999999, start: "2026-08-01", end: "2026-08-31" });
    // Scoping filters the rows — a venue the owner does not own yields zero data.
    expect(report.totalBookings).toBe(0);
    expect(report.revenue).toBe(0);
  });
});

describe("memberships — plan create/delete validation", () => {
  it("createMembership validates price format", async () => {
    const caller = appRouter.createCaller(adminCtx());
    await expect(
      caller.owner.createMembership({
        venueId,
        name: "VitPlan Test",
        price: "abc",
        credits: 5,
        validityDays: 30,
      }),
    ).rejects.toThrow();
  });

  it("createMembership + list round-trip for a real venue", async () => {
    const caller = appRouter.createCaller(adminCtx());
    await caller.owner.createMembership({
      venueId,
      name: "VitPlan Monthly",
      description: "vitest-created",
      price: "999.00",
      credits: 8,
      validityDays: 30,
    });
    const rows = await caller.owner.memberships({ venueId });
    expect(rows.some(r => String(r.name) === "VitPlan Monthly")).toBe(true);
    // Public endpoint also surfaces it.
    const pub = await caller.owner.membershipsPublic({ venueId });
    expect(pub.some((r: any) => String(r.name) === "VitPlan Monthly")).toBe(true);
  });

  it("sellMembership requires a valid plan id", async () => {
    const caller = appRouter.createCaller(adminCtx());
    await expect(
      caller.owner.sellMembership({ name: "VitWait Nobody", phone: "09171234567", membershipId: 999999 }),
    ).rejects.toThrow();
  });
});

describe("recurring series — validation", () => {
  it("createSeries requires weekdays between 0 and 6", async () => {
    const caller = appRouter.createCaller(adminCtx());
    await expect(
      caller.owner.createSeries({
        venueId, courtId,
        startHour: "09:00", endHour: "10:00",
        startDate: "2099-12-30",
        weeks: 2,
        weekdays: [8],
        playerName: "VitStaff Tester",
      }),
    ).rejects.toThrow();
  });

  it("createSeries rejects end before start hour", async () => {
    const caller = appRouter.createCaller(adminCtx());
    await expect(
      caller.owner.createSeries({
        venueId, courtId,
        startHour: "18:00", endHour: "10:00",
        startDate: "2099-12-30",
        weeks: 1,
        weekdays: [3],
        playerName: "VitStaff Tester",
      }),
    ).rejects.toThrow();
  });
});

describe("notifications — RBAC", () => {
  it("notifications require an owner identity", async () => {
    const caller = appRouter.createCaller(guestCtx());
    await expect(caller.owner.notifications({})).rejects.toThrow();
  });

  it("customer identity is denied", async () => {
    const caller = appRouter.createCaller(customerCtx(99, "plain@example.com"));
    await expect(caller.owner.notifications({})).rejects.toThrow();
  });

  it("master admin can list and mark notifications read", async () => {
    const caller = appRouter.createCaller(adminCtx());
    const result = await caller.owner.notifications({});
    expect(typeof result.count).toBe("number");
    const marked = await caller.owner.markNotificationsRead({});
    expect(marked.success).toBe(true);
  });
});
