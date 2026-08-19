/**
 * PayMongo gateway.
 *
 * The whole surface the booking flow needs: open a hosted checkout, read one
 * back, and cancel one whose court hold has lapsed. Nothing here writes to the
 * database or knows what a booking means beyond the few fields it prints on
 * the payer's screen.
 *
 * The API version differs per call, and not by choice. Create must be v2,
 * because pass_on_fees exists only there and v1 accepts the field and ignores
 * it, which would quietly move the transaction fee back onto the venue.
 * Retrieve and expire must be v1, because v2 answers 404 for both. All three
 * were confirmed against the live sandbox rather than read off the reference.
 */

const V1 = "https://api.paymongo.com/v1";
const V2 = "https://api.paymongo.com/v2";

/**
 * What the payer may choose. PayMongo decides the fee once they pick, which is
 * why pass_on_fees can only work on a hosted page and not on a total we
 * compute ourselves.
 */
const PAYMENT_METHODS = ["gcash", "qrph", "card"] as const;

/** The booking fields that reach PayMongo. Deliberately not the whole row. */
export type PayableBooking = {
  id: number;
  reference: string;
  playerName: string;
  totalAmount: string;
  venueName: string;
  playerDate: string;
  startHour: string;
  endHour: string;
};

export type CheckoutSession = {
  id: string;
  checkoutUrl: string;
  status?: string;
  referenceNumber?: string;
};

/**
 * Read the key per call, not at module load.
 *
 * The server starts long before the first payment, and a key supplied late or
 * rotated in place should take effect without a restart. Reading it here also
 * keeps the value out of module scope, so nothing can capture it by importing
 * this file.
 */
function secretKey(): string {
  const key = process.env.PAYMONGO_SECRET_KEY?.trim();
  if (!key) {
    throw new Error(
      "PAYMONGO_SECRET_KEY is not set. Online payment is unavailable until the venue's PayMongo secret key is configured.",
    );
  }
  return key;
}

function authHeader(): string {
  // PayMongo takes the secret key as the basic-auth username with an empty
  // password, so the colon is required and the password half stays blank.
  return `Basic ${Buffer.from(`${secretKey()}:`).toString("base64")}`;
}

/**
 * The error text PayMongo returned, or a plain description of the status.
 *
 * Only the detail strings are lifted out. The raw response is never included,
 * because the request that produced it carries the secret key and these
 * messages travel to the venue and sometimes to the player.
 */
function describeErrors(status: number, payload: unknown): string {
  const errors = (payload as { errors?: { detail?: string; code?: string }[] } | null)?.errors;
  const details = Array.isArray(errors)
    ? errors.map(e => e.detail ?? e.code).filter(Boolean)
    : [];
  return details.length > 0 ? details.join("; ") : `PayMongo returned HTTP ${status}`;
}

type PayMongoResponse = {
  ok: boolean;
  status: number;
  payload: unknown;
};

async function call(url: string, init: RequestInit): Promise<PayMongoResponse> {
  const res = await fetch(url, {
    ...init,
    headers: {
      authorization: authHeader(),
      "content-type": "application/json",
      accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let payload: unknown = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  return { ok: res.ok, status: res.status, payload };
}

/** Unwrap PayMongo's `data.attributes` envelope, which both versions use. */
function toSession(payload: unknown): CheckoutSession {
  const data = (payload as { data?: { id?: string; attributes?: Record<string, unknown> } } | null)
    ?.data;
  const attributes = data?.attributes ?? {};
  if (!data?.id) throw new Error("PayMongo returned a checkout session with no id");
  return {
    id: data.id,
    checkoutUrl: String(attributes.checkout_url ?? ""),
    status: attributes.status as string | undefined,
    referenceNumber: attributes.reference_number as string | undefined,
  };
}

/** Peso decimal string to the integer centavos PayMongo charges in. */
function toCentavos(amount: string): number {
  return Math.round(Number(amount) * 100);
}

/**
 * Open a hosted checkout for one booking.
 *
 * reference_number carries the booking reference so the venue can reconcile a
 * PayMongo payout line against a booking by eye. metadata carries the id as
 * well, because the webhook has to find the row without trusting anything the
 * browser hands back on return.
 */
export async function createCheckoutSession(args: {
  booking: PayableBooking;
  successUrl: string;
  cancelUrl: string;
}): Promise<CheckoutSession> {
  const { booking, successUrl, cancelUrl } = args;
  const res = await call(`${V2}/checkout_sessions`, {
    method: "POST",
    body: JSON.stringify({
      data: {
        attributes: {
          line_items: [
            {
              name: `Court booking - ${booking.venueName}`,
              description: `${booking.playerDate} ${booking.startHour}-${booking.endHour} for ${booking.playerName}`,
              amount: toCentavos(booking.totalAmount),
              currency: "PHP",
              quantity: 1,
            },
          ],
          payment_method_types: [...PAYMENT_METHODS],
          // The venue keeps the court rate whole and the payer covers the
          // method's fee. PayMongo works the amount out when the payer picks a
          // method, which is why the total on the hosted page can move.
          pass_on_fees: true,
          reference_number: booking.reference,
          description: `Booking ${booking.reference}`,
          metadata: {
            bookingId: String(booking.id),
            reference: booking.reference,
          },
          success_url: successUrl,
          cancel_url: cancelUrl,
        },
      },
    }),
  });

  if (!res.ok) throw new Error(describeErrors(res.status, res.payload));
  return toSession(res.payload);
}

/** Read a checkout session back, for reconciling a return the webhook has not caught up with. */
export async function retrieveCheckoutSession(id: string): Promise<CheckoutSession> {
  const res = await call(`${V1}/checkout_sessions/${encodeURIComponent(id)}`, { method: "GET" });
  if (!res.ok) throw new Error(describeErrors(res.status, res.payload));
  return toSession(res.payload);
}

/**
 * Cancel a checkout session and the payment intent behind it.
 *
 * A session already expired is the goal, not a failure. Both the hold sweep
 * and a player abandoning the page can reach this, so treating the second call
 * as an error would turn an ordinary race into a broken sweep.
 *
 * That case is settled by reading the session's status back, not by matching
 * PayMongo's message. The sandbox answers a repeat expire with HTTP 400 and
 * code invalid_request_body, which is the same code it uses for a malformed
 * body, so keying on the code would swallow real mistakes and keying on the
 * English detail string would break the day PayMongo rewords it. The extra
 * request only happens on the error path.
 */
export async function expireCheckoutSession(id: string): Promise<void> {
  const res = await call(`${V1}/checkout_sessions/${encodeURIComponent(id)}/expire`, {
    method: "POST",
  });
  if (res.ok) return;

  const current = await retrieveCheckoutSession(id).catch(() => null);
  if (current?.status === "expired") return;
  throw new Error(describeErrors(res.status, res.payload));
}
