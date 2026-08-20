import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCheckoutSession, expireCheckoutSession, retrieveCheckoutSession } from "./paymongo";

const KEY = "sk_test_unit_only_not_a_real_key";

type Call = { url: string; init: RequestInit };
let calls: Call[] = [];

/** Stub fetch with a fixed reply and record what the gateway sent. */
function stubFetch(status: number, body: unknown) {
  calls = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
}

function sessionReply(id = "cs_abc123") {
  return {
    data: {
      id,
      type: "checkout_session",
      attributes: {
        checkout_url: `https://checkout.paymongo.com/${id}`,
        reference_number: "DV-PB-A1B2",
        status: "active",
        payments: [],
      },
    },
  };
}

const booking = {
  reference: "DV-PB-A1B2",
  id: 42,
  playerName: "Ana Reyes",
  totalAmount: "300.00",
  venueName: "Arena Athletics",
  playerDate: "2027-01-05",
  startHour: "08:00",
  endHour: "10:00",
};

beforeEach(() => {
  vi.stubEnv("PAYMONGO_SECRET_KEY", KEY);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("paymongo gateway", () => {
  it("creates a checkout session on the v2 endpoint", async () => {
    stubFetch(200, sessionReply());
    const session = await createCheckoutSession({
      booking,
      successUrl: "https://pos.example/confirmation/DV-PB-A1B2",
      cancelUrl: "https://pos.example/book",
    });

    expect(session).toMatchObject({
      id: "cs_abc123",
      checkoutUrl: "https://checkout.paymongo.com/cs_abc123",
    });

    expect(calls).toHaveLength(1);
    // pass_on_fees exists on v2 only. v1 accepts the field and ignores it, so
    // hitting the wrong version would silently charge the venue the fee.
    expect(calls[0]!.url).toBe("https://api.paymongo.com/v2/checkout_sessions");
    expect(calls[0]!.init.method).toBe("POST");
  });

  it("authenticates with the secret key as HTTP basic, username only", async () => {
    stubFetch(200, sessionReply());
    await createCheckoutSession({ booking, successUrl: "https://x/s", cancelUrl: "https://x/c" });

    const auth = new Headers(calls[0]!.init.headers).get("authorization");
    expect(auth).toBe(`Basic ${Buffer.from(`${KEY}:`).toString("base64")}`);
  });

  it("sends the amount in centavos and asks PayMongo to charge the fee to the payer", async () => {
    stubFetch(200, sessionReply());
    await createCheckoutSession({ booking, successUrl: "https://x/s", cancelUrl: "https://x/c" });

    const body = JSON.parse(String(calls[0]!.init.body));
    const attrs = body.data.attributes;
    expect(attrs.line_items).toHaveLength(1);
    expect(attrs.line_items[0].amount).toBe(30000);
    expect(attrs.line_items[0].currency).toBe("PHP");
    expect(attrs.line_items[0].quantity).toBe(1);
    expect(attrs.pass_on_fees).toBe(true);
    expect(attrs.payment_method_types).toEqual(["gcash", "qrph", "card"]);
    expect(attrs.reference_number).toBe("DV-PB-A1B2");
    // The webhook is the only thing that marks a booking paid, and it must be
    // able to find the row without trusting anything the browser sends back.
    expect(attrs.metadata).toMatchObject({ bookingId: "42", reference: "DV-PB-A1B2" });
    expect(attrs.success_url).toBe("https://x/s");
    expect(attrs.cancel_url).toBe("https://x/c");
  });

  it("reports PayMongo's own error text without echoing the secret key", async () => {
    stubFetch(400, {
      errors: [{ code: "parameter_below_minimum", detail: "amount should be greater than 2000." }],
    });

    const err = await createCheckoutSession({
      booking: { ...booking, totalAmount: "5.00" },
      successUrl: "https://x/s",
      cancelUrl: "https://x/c",
    }).catch((e: unknown) => e as Error);

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/amount should be greater than 2000/);
    expect((err as Error).message).not.toContain(KEY);
  });

  it("refuses to call PayMongo at all when no secret key is configured", async () => {
    vi.stubEnv("PAYMONGO_SECRET_KEY", "");
    stubFetch(200, sessionReply());

    await expect(
      createCheckoutSession({ booking, successUrl: "https://x/s", cancelUrl: "https://x/c" }),
    ).rejects.toThrow(/PAYMONGO_SECRET_KEY/);
    expect(calls).toHaveLength(0);
  });

  it("retrieves a session on v1, which is the only version that answers", async () => {
    stubFetch(200, sessionReply("cs_retrieved"));
    const session = await retrieveCheckoutSession("cs_retrieved");

    expect(calls[0]!.url).toBe("https://api.paymongo.com/v1/checkout_sessions/cs_retrieved");
    expect(calls[0]!.init.method).toBe("GET");
    expect(session.id).toBe("cs_retrieved");
    expect(session.status).toBe("active");
  });

  it("reads a settled payment out of the retrieved session", async () => {
    // The create response carries none of this. Only v1 retrieve returns the
    // payments array, and an empty one is the normal state until the payer
    // actually pays, so 'no payments' must read as unpaid rather than unknown.
    stubFetch(200, {
      data: {
        id: "cs_paid",
        attributes: {
          checkout_url: "https://checkout.paymongo.com/cs_paid",
          status: "active",
          reference_number: "DV-PB-A1B2",
          payments: [
            { id: "pay_1", attributes: { status: "paid", source: { type: "gcash" }, amount: 30670 } },
          ],
        },
      },
    });
    const session = await retrieveCheckoutSession("cs_paid");
    expect(session.paid).toBe(true);
    expect(session.paidMethod).toBe("gcash");
  });

  it("treats a session with no payments as unpaid", async () => {
    stubFetch(200, sessionReply("cs_open"));
    const session = await retrieveCheckoutSession("cs_open");
    expect(session.paid).toBe(false);
    expect(session.paidMethod).toBeUndefined();
  });

  it("treats a failed payment attempt as unpaid", async () => {
    stubFetch(200, {
      data: {
        id: "cs_failed",
        attributes: {
          checkout_url: "",
          status: "active",
          payments: [{ id: "pay_x", attributes: { status: "failed", source: { type: "card" } } }],
        },
      },
    });
    const session = await retrieveCheckoutSession("cs_failed");
    expect(session.paid).toBe(false);
  });

  it("expires a session on v1, cancelling the payment intent behind it", async () => {
    stubFetch(200, sessionReply("cs_expire"));
    await expireCheckoutSession("cs_expire");

    expect(calls[0]!.url).toBe("https://api.paymongo.com/v1/checkout_sessions/cs_expire/expire");
    expect(calls[0]!.init.method).toBe("POST");
  });

  it("treats an already-expired session as expired rather than an error", async () => {
    // The hold sweep and the payer's own abandonment can both reach this, so a
    // second expire call must not turn into a failed sweep. The sandbox answers
    // the repeat with 400 invalid_request_body, so the state has to be read back
    // rather than inferred from the error.
    calls = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const expired = url.endsWith("/expire");
      return new Response(
        JSON.stringify(
          expired
            ? { errors: [{ code: "invalid_request_body", detail: "Checkout session is already expired" }] }
            : { data: { id: "cs_gone", attributes: { status: "expired", checkout_url: "" } } },
        ),
        { status: expired ? 400 : 200, headers: { "content-type": "application/json" } },
      );
    });

    await expect(expireCheckoutSession("cs_gone")).resolves.toBeUndefined();
    expect(calls.map(c => c.url)).toEqual([
      "https://api.paymongo.com/v1/checkout_sessions/cs_gone/expire",
      "https://api.paymongo.com/v1/checkout_sessions/cs_gone",
    ]);
  });

  it("still reports a failed expire when the session is not expired", async () => {
    calls = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const expired = url.endsWith("/expire");
      return new Response(
        JSON.stringify(
          expired
            ? { errors: [{ code: "invalid_request_body", detail: "Malformed request" }] }
            : { data: { id: "cs_live", attributes: { status: "active", checkout_url: "" } } },
        ),
        { status: expired ? 400 : 200, headers: { "content-type": "application/json" } },
      );
    });

    await expect(expireCheckoutSession("cs_live")).rejects.toThrow(/Malformed request/);
  });
});
