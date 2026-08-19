import { TRPCError } from "@trpc/server";
import * as db from "./db";

/**
 * How a booking becomes paid.
 *
 * Two callers reach this now: the tRPC procedures the venue and the player
 * use, and the PayMongo webhook, which is an Express route and has no business
 * importing a router to settle money. Keeping the rule in one module means
 * there is one answer to "what happens when a payment lands", not two that
 * drift.
 */

type DriverError = { errno?: number; code?: string; cause?: unknown };

/**
 * Match a driver error anywhere in the chain Drizzle wrapped it in.
 *
 * Drizzle throws its own error and hangs the mysql2 one off cause, sometimes
 * more than one link down, so the errno is never on the object that arrives.
 */
function hasDriverCode(err: unknown, errnos: number[], codes: string[]): boolean {
  for (let e = err as DriverError | undefined; e; e = e.cause as DriverError | undefined) {
    if (typeof e.errno === "number" && errnos.includes(e.errno)) return true;
    if (typeof e.code === "string" && codes.includes(e.code)) return true;
  }
  return false;
}

/**
 * MySQL raises errno 1062 when the bookings_slot_unique index rejects a second
 * booking for the same court, date, and start hour.
 */
export function isDuplicateSlotError(err: unknown): boolean {
  return hasDriverCode(err, [1062], ["ER_DUP_ENTRY"]);
}

/**
 * The two ways InnoDB refuses a write because somebody else holds the rows.
 *
 * 1213 is a deadlock, where InnoDB picked this transaction as the victim and
 * rolled it back. 1205 is a lock wait that ran out of patience. Neither means
 * the booking is wrong, and both usually succeed on a second attempt, which
 * makes them a different answer from a slot that is genuinely taken.
 */
function isContentionError(err: unknown): boolean {
  return hasDriverCode(err, [1213, 1205], ["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"]);
}

/**
 * Turn a failed booking write into something safe to show a person.
 *
 * A raw driver error is not safe. Drizzle puts the failing statement and its
 * parameters in the message, and for these tables the parameters are player
 * names and contact numbers, so letting one reach a tRPC caller publishes
 * somebody's phone number to whoever provoked the error. Every write on a
 * booking goes through here for that reason, including the failures nobody
 * predicted: those are precisely the ones that would otherwise leak.
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
 * Hold a court, do the write, and let nothing raw escape either half.
 *
 * The guard has to sit outside the lock, not inside the callback. Taking the
 * lock is itself a statement - SELECT ... FOR UPDATE on the court row - and a
 * transaction already holding that row makes it wait and then fail. That
 * failure happens before the callback runs, so a try/catch around the write
 * never sees it. Reproduced against a running server: the lock query and its
 * parameters came back to the caller in full.
 *
 * Every path that moves a court between players goes through here, so the
 * answer to "what does a failed booking write say" is written once.
 */
export async function withBookingWrite<T>(
  courtId: number,
  duplicateMessage: string,
  fn: (tx: db.Executor) => Promise<T>,
): Promise<T> {
  try {
    return await db.withCourtLock(courtId, fn);
  } catch (err) {
    rethrowBookingWriteError(err, duplicateMessage);
  }
}

export async function settleBookingPaid(id: number, paymentMethod: string) {
  const preview = await db.getBookingById(id);
  if (!preview) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });

  await withBookingWrite(
    preview.courtId,
    "Another booking already holds this slot. Create a new booking instead.",
    async tx => {
      const booking = await db.getBookingById(id, tx);
      if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });
      if (booking.paymentStatus === "cancelled" || booking.paymentStatus === "expired") {
        throw new TRPCError({
          code: "CONFLICT",
          message: `This booking is ${booking.paymentStatus} and has released its court. Create a new booking instead.`,
        });
      }
      // The re-read above rules out the statuses that rebuild a slot key, so a
      // duplicate here is something neither check foresaw. withBookingWrite
      // still keeps it from reaching the venue as a statement and parameters.
      await db.updateBookingStatus(id, { paymentStatus: "paid", paymentMethod }, tx);
    },
  );
}
