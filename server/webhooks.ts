import { createHmac, timingSafeEqual } from "node:crypto";
import express, { type Express, type Request, type Response } from "express";
import * as db from "./db";
import { retrieveCheckoutSession } from "./paymongo";
import { settleBookingPaid } from "./settlement";

/**
 * PayMongo's webhook.
 *
 * This is the authoritative path for "the player paid". The return page also
 * asks, but only if the player comes back; a player who pays and closes the
 * tab is invisible to it, and their court would be released twenty minutes
 * later with their money already gone. PayMongo calls here either way.
 *
 * Nothing in the event body is believed. A signed event only says "something
 * happened to this checkout session", and the handler then asks PayMongo what
 * the session actually holds. The body is a nudge to go and look.
 */

const PATH = "/api/webhooks/paymongo";

/** The only event acted on. The rest are acknowledged and dropped. */
const PAID_EVENT = "checkout_session.payment.paid";

/**
 * Split the Paymongo-Signature header.
 *
 * The header is three comma-separated fields: t is the timestamp, te is the
 * digest for test mode and li the digest for live mode.
 */
function parseSignature(header: string): { t?: string; te?: string; li?: string } {
  const out: Record<string, string> = {};
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}

/** Compare digests without leaking their contents through timing. */
function digestsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Which of the two signature fields applies to this account.
 *
 * The webhook secret cannot answer this. A secret issued by the test-mode
 * dashboard reads whsk_ followed by random characters, exactly like a live
 * one, so reading the mode off it would guess. The API secret key does carry
 * the marker, and both credentials belong to the same PayMongo account and the
 * same mode, so the key is the honest source.
 *
 * Absent or unrecognised keys count as live. Being strict about a signature is
 * the safe direction to be wrong in.
 */
function isLiveMode(): boolean {
  return !process.env.PAYMONGO_SECRET_KEY?.trim().startsWith("sk_test_");
}

/**
 * Whether this request really came from PayMongo.
 *
 * The signed string is the timestamp, a period, then the raw request body, and
 * "raw" is the whole difficulty: the digest covers the bytes PayMongo sent, so
 * the body must not have passed through a JSON parser on its way here. That is
 * why the route below mounts its own express.raw and why it is registered
 * before the app's parser.
 *
 * te and li are separate digests for test and live. Only the one matching this
 * account's mode is accepted; taking whichever is present would mean a
 * test-mode forgery could settle a live booking.
 *
 * The timestamp is not checked against a window. PayMongo retries a failed
 * delivery for days, and a legitimate retry carries the timestamp of the
 * original attempt, so a tolerance would reject exactly the deliveries that
 * matter most. Replay is answered by the handler being safe to repeat instead.
 */
export function verifyPaymongoSignature(
  rawBody: Buffer,
  header: string | undefined,
  secret: string | undefined,
): boolean {
  if (!header || !secret) return false;
  const { t, te, li } = parseSignature(header);
  if (!t) return false;

  const claimed = isLiveMode() ? li : te;
  if (!claimed) return false;

  const expected = createHmac("sha256", secret)
    .update(`${t}.${rawBody.toString("utf8")}`)
    .digest("hex");
  return digestsMatch(expected, claimed);
}

type PaymongoEvent = {
  data?: {
    attributes?: {
      type?: string;
      data?: { id?: string };
    };
  };
};

/**
 * Settle whatever this event turns out to be about.
 *
 * Errors are swallowed after logging, and the route answers 200 regardless.
 * PayMongo retries any other status for days, and none of the failures reached
 * here are ones a retry fixes: an unknown session stays unknown, and a booking
 * whose court was released stays released. A venue reading the log is the
 * repair path, not the delivery queue.
 */
async function handlePaidEvent(sessionId: string): Promise<void> {
  const booking = await db.getBookingByPaymongoSessionId(sessionId);
  if (!booking) {
    console.error(`[webhook] paid event for checkout session ${sessionId}, which no booking holds.`);
    return;
  }

  if (booking.paymentStatus === "paid") return;

  const session = await retrieveCheckoutSession(sessionId);
  if (!session.paid) {
    // The event said paid and the gateway says otherwise. Trust the gateway.
    console.error(
      `[webhook] booking ${booking.reference} received a paid event, but PayMongo reports no settled payment on ${sessionId}.`,
    );
    return;
  }

  if (booking.paymentStatus !== "pending") {
    // Money landed for a court this booking no longer holds. Forcing the row
    // back to paid rebuilds its slot key and can collide with whoever took the
    // court, so the state is reported and a person decides between a refund
    // and a rebooking.
    console.error(
      `[webhook] booking ${booking.reference} was paid at PayMongo but is ${booking.paymentStatus}. Refund or rebook needed.`,
    );
    return;
  }

  await settleBookingPaid(booking.id, session.paidMethod ?? "gcash");
}

async function onRequest(req: Request, res: Response): Promise<void> {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyPaymongoSignature(raw, req.header("paymongo-signature"), process.env.PAYMONGO_WEBHOOK_SECRET)) {
    // No detail in the response. Anyone probing this endpoint learns only that
    // they were turned away.
    res.status(401).json({ received: false });
    return;
  }

  let event: PaymongoEvent;
  try {
    event = JSON.parse(raw.toString("utf8")) as PaymongoEvent;
  } catch {
    res.status(400).json({ received: false });
    return;
  }

  const type = event.data?.attributes?.type;
  const sessionId = event.data?.attributes?.data?.id;

  if (type === PAID_EVENT && sessionId) {
    try {
      await handlePaidEvent(sessionId);
    } catch (err) {
      console.error(`[webhook] failed to settle checkout session ${sessionId}:`, err);
    }
  }

  res.status(200).json({ received: true });
}

/**
 * Mount the webhook.
 *
 * Call this before the app installs its JSON body parser. express.raw here
 * only wins if nothing has already consumed the stream, and a parsed body
 * cannot be turned back into the exact bytes the signature covers.
 */
export function registerPaymongoWebhook(app: Express): void {
  app.post(PATH, express.raw({ type: "application/json", limit: "1mb" }), onRequest);
}
