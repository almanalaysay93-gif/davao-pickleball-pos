import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import http from "node:http";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import { registerPaymongoWebhook } from "./webhooks";
import type { TrpcContext } from "./_core/context";
import { bookings as bookingsTable } from "../drizzle/schema";
import * as db from "./db";
import { getDb, listVenues } from "./db";

const day = "2027-11-14";
const SECRET = "whsk_test_fixture_secret";
const KEY = "sk_test_webhooks_unit";

/**
 * A signature PayMongo would have sent, computed by openssl rather than by the
 * code under test.
 *
 * Signing the payload here with the same crypto call the verifier uses would
 * prove nothing: the test would agree with the implementation by construction
 * and stay green through a wrong algorithm or a wrong string layout. This
 * digest came from
 *   printf '%s.%s' "$t" "$body" | openssl dgst -sha256 -hmac "$SECRET"
 * so it is an independent statement of what the header should contain.
 */
const FIXTURE = {
  timestamp: "1787200000",
  body:
    '{"data":{"id":"evt_fixture","type":"event","attributes":{"type":"checkout_session.payment.paid",' +
    '"data":{"id":"cs_fixture","type":"checkout_session","attributes":{"metadata":{"reference":"FIXTUREREF"}}}}}}',
  signature: "0b8ee403bc19409be8020b9384a4a5575d5d36b845067c55ba38e5f0dfea6ca7",
};

let server: http.Server;
let base: string;

/**
 * The app assembled the way server/_core/index.ts assembles it.
 *
 * The webhook is registered before the JSON body parser on purpose, and the
 * parser is present here rather than left out, because its absence is exactly
 * the mistake this arrangement has to survive. A signature is computed over
 * the bytes PayMongo sent; a parser that reaches the body first leaves the
 * route with an object, and no re-serialisation of that object is guaranteed
 * to reproduce the original bytes.
 */
beforeAll(async () => {
  const app = express();
  registerPaymongoWebhook(app);
  app.use(express.json({ limit: "50mb" }));
  server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as { port: number };
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

/** Post raw bytes without touching global fetch, which the tests stub. */
function post(path: string, body: string, headers: Record<string, string>) {
  return new Promise<{ status: number; text: string }>((resolve, reject) => {
    const req = http.request(
      `${base}${path}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
      },
      res => {
        let text = "";
        res.on("data", c => (text += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text }));
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

function guestCtx(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: { host: "pos.example" } } as TrpcContext["req"],
    res: { clearCookie: () => undefined, cookie: () => undefined } as unknown as TrpcContext["res"],
  };
}

let calls: string[] = [];

/** Answer the gateway retrieve the handler makes before it settles anything. */
function stubPayMongo(session: Record<string, unknown>) {
  calls = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(url);
    return new Response(JSON.stringify({ data: { id: "cs_hook", attributes: session } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });
}

const paidSession = {
  checkout_url: "https://checkout.paymongo.com/cs_hook",
  status: "active",
  payments: [{ id: "pay_1", attributes: { status: "paid", source: { type: "gcash" } } }],
};

const unpaidSession = { ...paidSession, payments: [] };

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
  const row = (await db.getBookingByReference(res.reference))!;
  const raw = await getDb();
  await raw!
    .update(bookingsTable)
    .set({ paymongoSessionId: "cs_hook" })
    .where(eq(bookingsTable.id, row.id));
  return row;
}

/** The event PayMongo sends when a hosted checkout is paid. */
function paidEvent(sessionId = "cs_hook") {
  return JSON.stringify({
    data: {
      id: "evt_1",
      type: "event",
      attributes: {
        type: "checkout_session.payment.paid",
        data: { id: sessionId, type: "checkout_session", attributes: {} },
      },
    },
  });
}

/** Sign a body the way PayMongo does, for the cases the fixture cannot cover. */
async function signed(body: string, mode: "te" | "li" = "te") {
  const { createHmac } = await import("node:crypto");
  const t = String(Math.floor(Date.now() / 1000));
  const digest = createHmac("sha256", SECRET).update(`${t}.${body}`).digest("hex");
  return { "paymongo-signature": `t=${t},${mode}=${digest}` };
}

beforeEach(async () => {
  vi.stubEnv("PAYMONGO_SECRET_KEY", KEY);
  vi.stubEnv("PAYMONGO_WEBHOOK_SECRET", SECRET);
  const raw = await getDb();
  if (raw) await raw.delete(bookingsTable).where(eq(bookingsTable.playerDate, day));
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  const raw = await getDb();
  if (raw) await raw.delete(bookingsTable).where(eq(bookingsTable.playerDate, day));
});

describe("PayMongo webhook signature", () => {
  it("accepts the signature openssl computes for a known payload", async () => {
    stubPayMongo(unpaidSession);
    const res = await post("/api/webhooks/paymongo", FIXTURE.body, {
      "paymongo-signature": `t=${FIXTURE.timestamp},te=${FIXTURE.signature}`,
    });

    // The booking in the fixture does not exist, so nothing settles. What is
    // under test here is only that the digest was accepted at all.
    expect(res.status).toBe(200);
  });

  it("rejects a request with no signature header", async () => {
    const res = await post("/api/webhooks/paymongo", paidEvent(), {});
    expect(res.status).toBe(401);
  });

  it("rejects a signature that does not match the body", async () => {
    const headers = await signed(paidEvent());
    const res = await post("/api/webhooks/paymongo", paidEvent("cs_tampered"), headers);
    expect(res.status).toBe(401);
  });

  it("rejects a live-mode signature field for a test-mode key", async () => {
    // te and li are separate digests. Accepting either would let a live-mode
    // forgery through on a test endpoint and the reverse in production.
    const body = paidEvent();
    const { createHmac } = await import("node:crypto");
    const t = String(Math.floor(Date.now() / 1000));
    const digest = createHmac("sha256", SECRET).update(`${t}.${body}`).digest("hex");
    const res = await post("/api/webhooks/paymongo", body, {
      "paymongo-signature": `t=${t},li=${digest}`,
    });
    expect(res.status).toBe(401);
  });

  it("refuses every request when no webhook secret is configured", async () => {
    vi.stubEnv("PAYMONGO_WEBHOOK_SECRET", "");
    const headers = await signed(paidEvent());
    const res = await post("/api/webhooks/paymongo", paidEvent(), headers);
    expect(res.status).toBe(401);
  });
});

describe("PayMongo webhook settlement", () => {
  it("marks the booking paid when the gateway confirms the payment", async () => {
    const booking = await makePendingBooking("08:00", "Hook Alpha");
    stubPayMongo(paidSession);

    const res = await post("/api/webhooks/paymongo", paidEvent(), await signed(paidEvent()));

    expect(res.status).toBe(200);
    const after = await db.getBookingById(booking.id);
    expect(after?.paymentStatus).toBe("paid");
    expect(after?.paymentMethod).toBe("gcash");
  });

  it("asks the gateway rather than believing the event body", async () => {
    const booking = await makePendingBooking("09:00", "Hook Bravo");
    // The event says paid. PayMongo, asked directly, says no payment settled.
    // A webhook body is only a nudge to go and look.
    stubPayMongo(unpaidSession);

    await post("/api/webhooks/paymongo", paidEvent(), await signed(paidEvent()));

    expect(calls[0]).toBe("https://api.paymongo.com/v1/checkout_sessions/cs_hook");
    expect((await db.getBookingById(booking.id))?.paymentStatus).toBe("pending");
  });

  it("stays correct when the same event is delivered twice", async () => {
    const booking = await makePendingBooking("10:00", "Hook Charlie");
    stubPayMongo(paidSession);

    const body = paidEvent();
    const first = await post("/api/webhooks/paymongo", body, await signed(body));
    const second = await post("/api/webhooks/paymongo", body, await signed(body));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect((await db.getBookingById(booking.id))?.paymentStatus).toBe("paid");
  });

  it("acknowledges an event for a session no booking holds", async () => {
    stubPayMongo(paidSession);
    const body = paidEvent("cs_unknown");
    const res = await post("/api/webhooks/paymongo", body, await signed(body));

    // 200 on purpose. PayMongo retries anything else for days, and no retry
    // will ever produce a booking that was never there.
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(0);
  });

  it("ignores event types it does not handle", async () => {
    const booking = await makePendingBooking("11:00", "Hook Delta");
    stubPayMongo(paidSession);
    const body = JSON.stringify({
      data: {
        id: "evt_2",
        type: "event",
        attributes: {
          type: "payment.refunded",
          data: { id: "cs_hook", type: "checkout_session", attributes: {} },
        },
      },
    });

    const res = await post("/api/webhooks/paymongo", body, await signed(body));

    expect(res.status).toBe(200);
    expect(calls).toHaveLength(0);
    expect((await db.getBookingById(booking.id))?.paymentStatus).toBe("pending");
  });

  it("does not force a booking back to paid after its court was released", async () => {
    const booking = await makePendingBooking("12:00", "Hook Echo");
    await db.updateBookingStatus(booking.id, { paymentStatus: "expired" });
    stubPayMongo(paidSession);

    const body = paidEvent();
    const res = await post("/api/webhooks/paymongo", body, await signed(body));

    // Rebuilding the slot key would collide with whoever now holds the court.
    // The money is real and the venue has to refund or rebook, so the event is
    // acknowledged and the row is left alone.
    expect(res.status).toBe(200);
    expect((await db.getBookingById(booking.id))?.paymentStatus).toBe("expired");
  });
});
