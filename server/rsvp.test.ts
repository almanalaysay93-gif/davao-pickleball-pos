import { beforeAll, describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import {
  deleteAnnouncementsById,
  deleteAttendanceByPlayerNamePrefix,
  deleteBookingsByPlayerNamePrefix,
} from "./db";

/**
 * Event RSVP + booking confirmation email coverage.
 *
 * Live Supabase database — test artifacts carry an `RSVP-TEST` / `RSVP TEST`
 * prefix so cleanup deletes only our own rows and other suites are untouched.
 */

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

/** Regular customer — guest RSVPs. */
function guestCtx(): TrpcContext {
  return baseCtx({
    id: 0,
    type: "customer",
    identity: "guest",
    name: "guest",
    email: null,
    role: "customer",
  });
}

const ANN_TITLE = `RSVP-TEST-EVENT-${Date.now()}`;
const RSVP_NAME = `RSVP TEST PLAYER ${Date.now()}`;

let annId = -1;
let venueId = -1;
let courtId = -1;

beforeAll(async () => {
  const caller = appRouter.createCaller(adminCtx());
  const venues = await caller.venues.list();
  venueId = (venues as { id: number }[])[0].id;
  const courts = await caller.courts.byVenue({ venueId });
  courtId = (courts as { id: number }[])[0].id;

  await caller.owner.createAnnouncement({
    venueId,
    title: ANN_TITLE,
    message: "RSVP smoke test event",
    kind: "event",
    eventDate: "2026-09-01",
  });

  const list = await caller.owner.announcements({ venueId });
  const match = (list as { id: number; title: string }[]).find(r => r.title === ANN_TITLE);
  if (!match) throw new Error("test announcement not created");
  annId = match.id;
});

describe("public events router", () => {
  it("guest can join and leave RSVP and the count updates", async () => {
    const guest = appRouter.createCaller(guestCtx());

    const joined = await guest.events.toggleRsvp({ announcementId: annId, playerName: RSVP_NAME });
    expect(joined.joined).toBe(true);
    expect(joined.count).toBeGreaterThanOrEqual(1);

    const afterJoin = await guest.events.attendance({ announcementIds: [annId] });
    expect(
      ((afterJoin as Record<number, { playerName: string }[]>)[annId] ?? []).some(
        a => a.playerName === RSVP_NAME,
      ),
    ).toBe(true);

    const left = await guest.events.toggleRsvp({ announcementId: annId, playerName: RSVP_NAME });
    expect(left.joined).toBe(false);

    const afterLeave = await guest.events.attendance({ announcementIds: [annId] });
    expect(
      ((afterLeave as Record<number, { playerName: string }[]>)[annId] ?? []).some(
        a => a.playerName === RSVP_NAME,
      ),
    ).toBe(false);

    // Join again for owner-view checks below.
    await guest.events.toggleRsvp({ announcementId: annId, playerName: RSVP_NAME });
  });

  it("cancelling an RSVP to a non-event announcement is rejected", async () => {
    const guest = appRouter.createCaller(guestCtx());
    await expect(
      guest.events.toggleRsvp({ announcementId: -9999, playerName: "Nobody" }),
    ).rejects.toThrow();
  });
});

describe("owner events router", () => {
  it("master admin sees attendees for the test event", async () => {
    const admin = appRouter.createCaller(adminCtx());
    const attendees = await admin.owner.announcementAttendees({ announcementId: annId });
    expect(Array.isArray(attendees)).toBe(true);
    expect((attendees as { playerName: string }[]).some(a => a.playerName === RSVP_NAME)).toBe(true);
  });

  it("owner announcements list enriches events with rsvp counts", async () => {
    const admin = appRouter.createCaller(adminCtx());
    const list = await admin.owner.announcements({ venueId });
    const row = (list as { id: number; rsvpCount?: number }[]).find(r => r.id === annId);
    // Owner list maps counts by announcement id
    expect(row).toBeDefined();
    expect(typeof row!.rsvpCount).toBe("number");
    expect(row!.rsvpCount as number).toBeGreaterThanOrEqual(1);
  });
});

describe("booking confirmation email", () => {
  it("booking.create accepts playerEmail and stores it on the row", async () => {
    const owner = appRouter.createCaller(adminCtx());

    // Tomorrow in Asia/Manila — always a bookable future date, even near midnight.
    const manilaNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Manila" }));
    const tomorrow = new Date(manilaNow.getTime() + 24 * 60 * 60 * 1000);
    const playerDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
    const testEmail = `rsvp-test-${Date.now()}@example.com`;
    const playerName = `RSVP EMAIL TEST ${Date.now()}`;

    const created = await owner.bookings.create({
      venueId,
      courtId,
      playerDate,
      startHour: "17:00",
      endHour: "18:00",
      playerName,
      contact: "09000000000",
      playerEmail: testEmail,
      channel: "walkin",
      paymentMethod: "cash",
      promoCodeId: null,
    });

    expect(created).toBeDefined();
    const stored = await owner.bookings.get({
      reference: (created as { reference: string }).reference,
    });
    expect((stored as { booking: { playerEmail: string | null } }).booking.playerEmail).toBe(
      testEmail,
    );
  });
});

// ── Cleanup ─────────────────────────────────────────────────────────────────

describe("rsvp test cleanup", () => {
  it("removes all RSVP test rows", async () => {
    await deleteBookingsByPlayerNamePrefix("RSVP");
    await deleteAttendanceByPlayerNamePrefix("RSVP");
    await deleteAnnouncementsById(annId);
  });
});
