import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { bookings as bookingsTable } from "../drizzle/schema";
import * as db from "./db";
import { getDb, listVenues } from "./db";

const day = "2027-10-08";
const KEY = "sk_test_payments_unit";

function guestCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: { host: "pos.example" } } as TrpcContext["req"],
    res: { clearCookie: () => undefined, cookie: () => undefined } as unknown as TrpcContext["res"],
  };
}

let calls: { url: string; init: RequestInit }[] = [];

/** Answer PayMongo calls from a canned session, and record what was sent. */
function stubPayMongo(session: Record<string, unknown>) {
  calls = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ data: { id: "cs_test", attributes: session } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

const openSession = {
  checkout_url: "https://checkout.paymongo.com/cs_test",
  status: "active",
  payments: [],
};

const paidSession = {
  ...openSession,
  payments: [{ id: "pay_1", attributes: { status: "paid", source: { type: "gcash" } } }],
};

async function makePendingBooking(hour: string, name: string) {
  const caller = appRouter.createCaller(guestCtx());
  const venues = await listVenues();
  const venue = venues.find(v => v.name === "Arena Athletics")!;
  const courts = await db.listCourtsByVenue(venue.id);
  const court = courts.find(c => c.status === "available")!;
  const res = await caller.bookings.create({
    venueId: venue.id,
    courtId: court.id,
    playerDate: day,
    startHour: hour,
    endHour: `${String(Number(hour.slice(0, 2)) + 1).padStart(2, "0")}:00`,
    playerName: name,
    contact: "09170000123",
    channel: "online",
  });
  const row = await db.getBookingByReference(res.reference);
  return row!;
}

beforeEach(async () => {
  vi.stubEnv("PAYMONGO_SECRET_KEY", KEY);
  const raw = await getDb();
  if (raw) await raw.delete(bookingsTable).where(eq(bookingsTable.playerDate, day));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  const raw = await getDb();
  if (raw) await raw.delete(bookingsTable).where(eq(bookingsTable.playerDate, day));
});

describe("payments.startCheckout", () => {
  it("opens a PayMongo session for a pending booking and remembers it", async () => {
    const booking = await makePendingBooking("08:00", "Pay Alpha");
    stubPayMongo(openSession);

    const res = await appRouter
      .createCaller(guestCtx())
      .payments.startCheckout({ reference: booking.reference });

    expect(res.checkoutUrl).toBe("https://checkout.paymongo.com/cs_test");
    expect(calls[0]!.url).toBe("https://api.paymongo.com/v2/checkout_sessions");

    // The session id has to survive the redirect, or the return page has
    // nothing to ask PayMongo about when the webhook is late.
    const stored = await db.getBookingById(booking.id);
    expect(stored?.paymongoSessionId).toBe("cs_test");
  });

  it("sends the player back to their own confirmation page", async () => {
    const booking = await makePendingBooking("09:00", "Pay Bravo");
    stubPayMongo(openSession);
    await appRouter.createCaller(guestCtx()).payments.startCheckout({ reference: booking.reference });

    const attrs = JSON.parse(String(calls[0]!.init.body)).data.attributes;
    expect(attrs.success_url).toBe(`https://pos.example/confirmation/${booking.reference}`);
    expect(attrs.cancel_url).toContain("pos.example");
    expect(attrs.metadata.reference).toBe(booking.reference);
  });

  it("refuses to open a second checkout for a booking already paid", async () => {
    const booking = await makePendingBooking("10:00", "Pay Charlie");
    await db.updateBookingStatus(booking.id, { paymentStatus: "paid", paymentMethod: "cash" });
    stubPayMongo(openSession);

    await expect(
      appRouter.createCaller(guestCtx()).payments.startCheckout({ reference: booking.reference }),
    ).rejects.toThrow(/already paid/i);
    expect(calls).toHaveLength(0);
  });

  it("refuses to open a checkout for a booking whose court was released", async () => {
    const booking = await makePendingBooking("11:00", "Pay Delta");
    await db.updateBookingStatus(booking.id, { paymentStatus: "expired" });
    stubPayMongo(openSession);

    await expect(
      appRouter.createCaller(guestCtx()).payments.startCheckout({ reference: booking.reference }),
    ).rejects.toThrow(/expired|released/i);
    // Taking money for a court somebody else may now hold is the one outcome
    // that cannot be undone by a status change, so PayMongo is never called.
    expect(calls).toHaveLength(0);
  });

  it("restarts the hold clock, so the player gets the full window to pay", async () => {
    const booking = await makePendingBooking("12:00", "Pay Echo");
    const raw = await getDb();
    const past = new Date(Date.now() + 60_000);
    await raw!.update(bookingsTable).set({ expiresAt: past }).where(eq(bookingsTable.id, booking.id));
    stubPayMongo(openSession);

    await appRouter.createCaller(guestCtx()).payments.startCheckout({ reference: booking.reference });

    const after = await db.getBookingById(booking.id);
    expect(after!.expiresAt!.getTime()).toBeGreaterThan(past.getTime() + 60_000);
  });

  it("reuses a checkout still open rather than opening a second one", async () => {
    const booking = await makePendingBooking("17:00", "Pay Foxtrot");
    stubPayMongo(openSession);
    await appRouter.createCaller(guestCtx()).payments.startCheckout({ reference: booking.reference });

    // A player who clicks pay twice must return to the session they may have
    // already paid on. A second one would sit payable and unwatched, and sync
    // only ever holds the newest id.
    calls = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(
        JSON.stringify({ data: { id: "cs_test", attributes: openSession } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    const res = await appRouter
      .createCaller(guestCtx())
      .payments.startCheckout({ reference: booking.reference });

    expect(res.checkoutUrl).toBe("https://checkout.paymongo.com/cs_test");
    expect(calls.map(c => c.url)).toEqual([
      "https://api.paymongo.com/v1/checkout_sessions/cs_test",
    ]);
  });

  it("opens a fresh checkout when the previous session has expired", async () => {
    const booking = await makePendingBooking("18:00", "Pay Golf");
    stubPayMongo(openSession);
    await appRouter.createCaller(guestCtx()).payments.startCheckout({ reference: booking.reference });

    calls = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const retrieving = init.method === "GET";
      return new Response(
        JSON.stringify({
          data: {
            id: "cs_test",
            attributes: retrieving ? { ...openSession, status: "expired" } : openSession,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });

    await appRouter.createCaller(guestCtx()).payments.startCheckout({ reference: booking.reference });

    expect(calls.map(c => c.url)).toEqual([
      "https://api.paymongo.com/v1/checkout_sessions/cs_test",
      "https://api.paymongo.com/v2/checkout_sessions",
    ]);
  });
});

describe("payments.sync", () => {
  it("settles the booking when PayMongo says the payment landed", async () => {
    const booking = await makePendingBooking("13:00", "Sync Alpha");
    stubPayMongo(openSession);
    await appRouter.createCaller(guestCtx()).payments.startCheckout({ reference: booking.reference });

    stubPayMongo(paidSession);
    const res = await appRouter.createCaller(guestCtx()).payments.sync({ reference: booking.reference });

    expect(res.paymentStatus).toBe("paid");
    // v1 is the only version that answers a retrieve.
    expect(calls[0]!.url).toBe("https://api.paymongo.com/v1/checkout_sessions/cs_test");

    const after = await db.getBookingById(booking.id);
    expect(after?.paymentStatus).toBe("paid");
    // The method comes from the gateway, not from anything the browser sent.
    expect(after?.paymentMethod).toBe("gcash");
  });

  it("leaves the booking pending while PayMongo reports no settled payment", async () => {
    const booking = await makePendingBooking("14:00", "Sync Bravo");
    stubPayMongo(openSession);
    await appRouter.createCaller(guestCtx()).payments.startCheckout({ reference: booking.reference });

    stubPayMongo(openSession);
    const res = await appRouter.createCaller(guestCtx()).payments.sync({ reference: booking.reference });

    expect(res.paymentStatus).toBe("pending");
    expect((await db.getBookingById(booking.id))?.paymentStatus).toBe("pending");
  });

  it("does not call PayMongo for a booking that never opened a checkout", async () => {
    const booking = await makePendingBooking("15:00", "Sync Charlie");
    stubPayMongo(paidSession);

    const res = await appRouter.createCaller(guestCtx()).payments.sync({ reference: booking.reference });

    expect(res.paymentStatus).toBe("pending");
    expect(calls).toHaveLength(0);
  });

  it("reports a payment that landed after the court was released instead of settling it", async () => {
    const booking = await makePendingBooking("16:00", "Sync Delta");
    stubPayMongo(openSession);
    await appRouter.createCaller(guestCtx()).payments.startCheckout({ reference: booking.reference });
    await db.updateBookingStatus(booking.id, { paymentStatus: "expired" });

    stubPayMongo(paidSession);
    const res = await appRouter.createCaller(guestCtx()).payments.sync({ reference: booking.reference });

    // Money arrived for a court this booking no longer holds. Forcing it back
    // to paid would rebuild the slot key and could collide with whoever took
    // the court, so the state is reported rather than overwritten.
    expect(res.paymentStatus).toBe("expired");
    expect(res.paidButReleased).toBe(true);
    expect((await db.getBookingById(booking.id))?.paymentStatus).toBe("expired");
  });
});
