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

/**
 * MySQL raises errno 1062 when the bookings_slot_unique index rejects a second
 * booking for the same court, date, and start hour. Drizzle wraps the driver
 * error, so walk the cause chain to find it.
 */
export function isDuplicateSlotError(err: unknown): boolean {
  for (let e = err as { errno?: number; code?: string; cause?: unknown } | undefined; e; e = e.cause as typeof e) {
    if (e.errno === 1062 || e.code === "ER_DUP_ENTRY") return true;
  }
  return false;
}

export async function settleBookingPaid(id: number, paymentMethod: string) {
  const preview = await db.getBookingById(id);
  if (!preview) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });

  await db.withCourtLock(preview.courtId, async tx => {
    const booking = await db.getBookingById(id, tx);
    if (!booking) throw new TRPCError({ code: "NOT_FOUND", message: "Booking not found" });
    if (booking.paymentStatus === "cancelled" || booking.paymentStatus === "expired") {
      throw new TRPCError({
        code: "CONFLICT",
        message: `This booking is ${booking.paymentStatus} and has released its court. Create a new booking instead.`,
      });
    }
    try {
      await db.updateBookingStatus(id, { paymentStatus: "paid", paymentMethod }, tx);
    } catch (err) {
      // The re-read above rules out the statuses that rebuild a slot key, so a
      // duplicate here is something neither check foresaw. It still must not
      // reach the venue as a statement and its parameters.
      if (isDuplicateSlotError(err)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Another booking already holds this slot. Create a new booking instead.",
        });
      }
      throw err;
    }
  });
}
