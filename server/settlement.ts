import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { expireCheckoutSession } from "./paymongo";

/**
 * How a booking becomes paid.
 *
 * Two callers reach this: the tRPC procedures the venue and the player use,
 * and the PayMongo webhook, which is an Express route and has no business
 * importing a router to settle money. Keeping the rule in one module means
 * there is one answer to "what happens when a payment lands", not two that
 * drift.
 *
 * Ported from MySQL. The transaction machinery this file used to carry is
 * gone, because the database is now reached over PostgREST, which is one HTTP
 * request per statement and cannot hold a lock across a check and a write.
 * The guarantee moved into the schema instead: bookings_active_slot_unique in
 * migrations/2026-08-20_paymongo.sql refuses a second live booking for a
 * court, date, and hour. The write is attempted and the database is allowed
 * to say no, rather than the application asking first and hoping.
 */

type PostgresError = { code?: string; message?: string; cause?: unknown };

/**
 * Match a Postgres SQLSTATE anywhere in the chain the client wrapped it in.
 *
 * supabase-js throws a PostgrestError carrying the SQLSTATE in `code`, but a
 * failure raised inside the fetch layer arrives wrapped, so the code is not
 * always on the object that reaches this function.
 */
function hasSqlState(err: unknown, codes: string[]): boolean {
  for (let e = err as PostgresError | undefined; e; e = e.cause as PostgresError | undefined) {
    if (typeof e.code === "string" && codes.includes(e.code)) return true;
  }
  return false;
}

/**
 * SQLSTATE 23505 is unique_violation: bookings_active_slot_unique rejected a
 * second live booking for the same court, date, and start hour.
 *
 * On MySQL this was errno 1062 against an index that had to cover every row,
 * which is why the old schema carried a generated column to blank the slot key
 * for cancelled bookings. The Postgres index is partial, so a cancelled or
 * expired booking falls out of it and no longer occupies the slot.
 */
export function isDuplicateSlotError(err: unknown): boolean {
  return hasSqlState(err, ["23505"]);
}

/**
 * The transient refusals: 40001 is a serialization failure, 40P01 a deadlock
 * detected. Neither means the booking is wrong, and both usually succeed on a
 * second attempt, which makes them a different answer from a slot that is
 * genuinely taken.
 */
function isContentionError(err: unknown): boolean {
  return hasSqlState(err, ["40001", "40P01"]);
}

/**
 * Turn a failed booking write into something safe to show a person.
 *
 * A raw driver error is not safe. PostgREST puts the offending row in the
 * `details` field, and for this table that row holds player names and contact
 * numbers, so letting one reach a tRPC caller publishes somebody's phone
 * number to whoever provoked the error. Every write on a booking goes through
 * here for that reason, including the failures nobody predicted: those are
 * precisely the ones that would otherwise leak.
 *
 * duplicateMessage differs per caller because a unique-key collision means
 * something different when creating a booking than when moving one.
 */
export function rethrowBookingWriteError(err: unknown, duplicateMessage: string): never {
  // Already shaped for a person, by this function or by a check upstream.
  if (err instanceof TRPCError) throw err;

  if (isDuplicateSlotError(err)) {
    throw new TRPCError({ code: "CONFLICT", message: duplicateMessage });
  }
  if (isContentionError(err)) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "This court is busy right now. Try again in a moment.",
    });
  }

  // The detail is worth keeping, on the server, where the venue's staff and
  // nobody else can read it.
  console.error("[booking write] unexpected database failure:", err);
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "The booking could not be saved. Try again, and tell the venue if it keeps happening.",
  });
}

/**
 * Do a booking write and let nothing raw escape.
 *
 * Every path that moves a court between players goes through here, so the
 * answer to "what does a failed booking write say" is written once.
 */
export async function withBookingWrite<T>(
  duplicateMessage: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    rethrowBookingWriteError(err, duplicateMessage);
  }
}

export async function settleBookingPaid(id: number, paymentMethod: string) {
  const booking = await db.getBookingById(id);
  if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });

  if (booking.paymentStatus === "cancelled" || booking.paymentStatus === "expired") {
    throw new TRPCError({
      code: "CONFLICT",
      message: `This booking is ${booking.paymentStatus} and has released its court. Create a new booking instead.`,
    });
  }

  await withBookingWrite(
    "Another booking already holds this slot. Create a new booking instead.",
    async () => {
      // Marking a pending booking paid does not change its slot key, so the
      // unique index cannot fire here under normal operation. The guard stays
      // because a status check and the write that follows it are two separate
      // requests now: a cancel landing between them would rebuild the key.
      await db.updateBookingStatus(id, {
        paymentStatus: "paid",
        paymentMethod,
        expiresAt: null,
      });
    },
  );
}

/**
 * Release the courts held by holds that ran out, and shut the checkout sessions
 * that were paying for them.
 *
 * Expiring the row alone is not enough, and this is the gap the MySQL branch
 * shipped with. A booking whose hold lapsed stops holding its court, but its
 * PayMongo session stays payable, so a player who wandered off, left the tab
 * open, and paid an hour later hands money over for a slot somebody else now
 * holds. Closing the session at the gateway is what makes the release real.
 *
 * Scope this wherever the caller knows the court or venue. Unscoped, it
 * rewrites every lapsed row in the table, and it sits on the public
 * availability path.
 *
 * A gateway failure is logged, not thrown. The court has already been released
 * in the database by that point, and refusing to answer an availability query
 * because PayMongo is slow would take the whole schedule down with it. The log
 * line names the session so a stuck one can be closed by hand.
 */
export async function releaseLapsedHolds(
  now: Date = new Date(),
  scope?: { courtId?: number; venueId?: number; playerDate: string },
): Promise<number> {
  const expired = await db.expireStaleHolds(now, scope);
  if (expired.length === 0) return 0;

  await Promise.all(
    expired
      .filter(b => b.paymongoSessionId)
      .map(async b => {
        try {
          await expireCheckoutSession(b.paymongoSessionId!);
        } catch (err) {
          console.error(
            `[payments] booking ${b.reference} expired but its PayMongo session ${b.paymongoSessionId} could not be closed. It may still be payable. Close it in the dashboard.`,
            err,
          );
        }
      }),
  );

  return expired.length;
}
