import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { bookings as bookingsTable } from "../drizzle/schema";
import * as db from "./db";
import { getDb, listVenues } from "./db";

/**
 * The two write paths that move a court between players: creating a booking
 * and moving an existing one. Both decide whether a slot is free and then act
 * on that decision, so both have to hold the court while they do it, and
 * neither may answer a database failure with the statement that failed.
 */

const day = "2027-09-16";

function ctx(user: NonNullable<TrpcContext["user"]> | null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: { host: "pos.example" } } as TrpcContext["req"],
    res: { clearCookie: () => undefined, cookie: () => undefined } as unknown as TrpcContext["res"],
  };
}

const guest = () => appRouter.createCaller(ctx(null));
const admin = () =>
  appRouter.createCaller(
    ctx({ id: 1, type: "owner", identity: "owner", name: "owner", email: null, role: "owner" }),
  );

/**
 * A driver failure as it actually arrives.
 *
 * Drizzle wraps the mysql2 error and puts the failing statement in its own
 * message, so a fake carrying only an errno would let a handler pass this test
 * while still leaking SQL in production. The parameters include a contact
 * number for the same reason: that is the field whose escape actually matters.
 */
function driverError(errno: number, code: string): Error {
  const err = new Error(
    `Failed query: insert into \`bookings\` (\`playerName\`, \`contact\`) values (?, ?)\nparams: Leak Probe,09170000123`,
  );
  (err as { cause?: unknown }).cause = { errno, code, sqlMessage: code };
  return err;
}

/** Nothing about the failing statement may reach the caller. */
function expectNoStatementLeak(message: string) {
  expect(message).not.toMatch(/insert into|update `bookings`|select .* for update|Failed query/i);
  expect(message).not.toContain("09170000123");
}

async function courtsOfArena() {
  const venue = (await listVenues()).find(v => v.name === "Arena Athletics")!;
  const courts = (await db.listCourtsByVenue(venue.id)).filter(c => c.status === "available");
  return { venue, courts };
}

async function makeBooking(hour: string, name: string, courtIndex = 0) {
  const { venue, courts } = await courtsOfArena();
  const res = await guest().bookings.create({
    venueId: venue.id,
    courtId: courts[courtIndex]!.id,
    playerDate: day,
    startHour: hour,
    endHour: `${String(Number(hour.slice(0, 2)) + 1).padStart(2, "0")}:00`,
    playerName: name,
    contact: "09170000123",
    channel: "online",
  });
  return (await db.getBookingByReference(res.reference))!;
}

beforeEach(async () => {
  const raw = await getDb();
  if (raw) await raw.delete(bookingsTable).where(eq(bookingsTable.playerDate, day));
});

afterEach(async () => {
  vi.restoreAllMocks();
  const raw = await getDb();
  if (raw) await raw.delete(bookingsTable).where(eq(bookingsTable.playerDate, day));
});

describe("booking writes survive a database failure without leaking one", () => {
  it("answers a lock deadlock on create with a retryable conflict", async () => {
    const { venue, courts } = await courtsOfArena();
    vi.spyOn(db, "insertBooking").mockRejectedValue(driverError(1213, "ER_LOCK_DEADLOCK"));

    const err = await guest()
      .bookings.create({
        venueId: venue.id,
        courtId: courts[0]!.id,
        playerDate: day,
        startHour: "08:00",
        endHour: "09:00",
        playerName: "Leak Probe",
        contact: "09170000123",
        channel: "online",
      })
      .then(() => null, (e: Error) => e);

    expect(err).not.toBeNull();
    // A deadlock is InnoDB choosing a victim between two live transactions.
    // The loser's work is simply gone, and repeating it usually succeeds, so
    // the caller is told to repeat rather than told the booking failed.
    expect((err as TRPCError).code).toBe("CONFLICT");
    expect(err!.message).toMatch(/busy right now/i);
    expectNoStatementLeak(err!.message);
  });

  it("answers a lock wait timeout the same way", async () => {
    const { venue, courts } = await courtsOfArena();
    vi.spyOn(db, "insertBooking").mockRejectedValue(driverError(1205, "ER_LOCK_WAIT_TIMEOUT"));

    const err = await guest()
      .bookings.create({
        venueId: venue.id,
        courtId: courts[0]!.id,
        playerDate: day,
        startHour: "08:00",
        endHour: "09:00",
        playerName: "Leak Probe",
        contact: "09170000123",
        channel: "online",
      })
      .then(() => null, (e: Error) => e);

    expect((err as TRPCError).code).toBe("CONFLICT");
    expect(err!.message).toMatch(/busy right now/i);
    expectNoStatementLeak(err!.message);
  });

  it("hides the statement behind any unforeseen database failure", async () => {
    const { venue, courts } = await courtsOfArena();
    vi.spyOn(db, "insertBooking").mockRejectedValue(driverError(1146, "ER_NO_SUCH_TABLE"));

    const err = await guest()
      .bookings.create({
        venueId: venue.id,
        courtId: courts[0]!.id,
        playerDate: day,
        startHour: "08:00",
        endHour: "09:00",
        playerName: "Leak Probe",
        contact: "09170000123",
        channel: "online",
      })
      .then(() => null, (e: Error) => e);

    // Not a case anyone can act on, and the reason it is caught at all is that
    // the ones nobody foresaw are exactly the ones that leak. It must not be
    // dressed up as a conflict either: a missing table is not something the
    // caller can resolve by trying again.
    expect((err as TRPCError).code).toBe("INTERNAL_SERVER_ERROR");
    expectNoStatementLeak(err!.message);
  });

  it("answers a failure to take the court lock itself", async () => {
    const { venue, courts } = await courtsOfArena();
    // The lock is a SELECT ... FOR UPDATE taken before the write runs, so a
    // timeout waiting for it never reaches a guard wrapped around the write.
    // This was reproduced against a live server: the lock query came back to
    // the caller in full.
    vi.spyOn(db, "withCourtLock").mockRejectedValue(
      driverError(1205, "ER_LOCK_WAIT_TIMEOUT"),
    );

    const err = await guest()
      .bookings.create({
        venueId: venue.id,
        courtId: courts[0]!.id,
        playerDate: day,
        startHour: "08:00",
        endHour: "09:00",
        playerName: "Leak Probe",
        contact: "09170000123",
        channel: "online",
      })
      .then(() => null, (e: Error) => e);

    expect((err as TRPCError).code).toBe("CONFLICT");
    expect(err!.message).toMatch(/busy right now/i);
    expectNoStatementLeak(err!.message);
  });

  it("keeps the same guarantee when settling a payment", async () => {
    const booking = await makeBooking("09:00", "Settle Probe");
    vi.spyOn(db, "updateBookingStatus").mockRejectedValue(driverError(1213, "ER_LOCK_DEADLOCK"));

    const err = await admin()
      .bookings.markPaid({ id: booking.id })
      .then(() => null, (e: Error) => e);

    expect((err as TRPCError).code).toBe("CONFLICT");
    expect(err!.message).toMatch(/busy right now/i);
    expectNoStatementLeak(err!.message);
  });
});

describe("bookings.modify holds the court it is moving onto", () => {
  it("takes the court lock for the destination court", async () => {
    const booking = await makeBooking("10:00", "Mover", 0);
    const { courts } = await courtsOfArena();
    const destination = courts[1]!;
    const lock = vi.spyOn(db, "withCourtLock");

    await admin().bookings.modify({ id: booking.id, courtId: destination.id });

    // The court being moved onto is the contended one. Without the lock the
    // overlap check and the write that acts on it are two steps, and a booking
    // created between them takes the slot this move just claimed.
    expect(lock).toHaveBeenCalled();
    expect(lock.mock.calls[0]![0]).toBe(destination.id);
  });

  it("releases a lapsed hold on the destination before calling the slot taken", async () => {
    const stale = await makeBooking("11:00", "Abandoned");
    const raw = await getDb();
    await raw!
      .update(bookingsTable)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(bookingsTable.id, stale.id));

    // On a different court on purpose. Creating a booking sweeps lapsed holds
    // for its own court-day, so a mover created on the same court would clear
    // the stale hold before modify ever ran and the test would pass without
    // modify doing anything.
    const mover = await makeBooking("11:00", "Mover", 1);
    const { courts } = await courtsOfArena();

    // The hold on 11:00 lapsed, so that court-hour is free. A move refused
    // here is the same bug as a booking refused here: an abandoned checkout
    // keeping a court off the market.
    await admin().bookings.modify({ id: mover.id, courtId: courts[0]!.id });

    const moved = await db.getBookingById(mover.id);
    expect(moved!.courtId).toBe(courts[0]!.id);
    expect((await db.getBookingById(stale.id))!.paymentStatus).toBe("expired");
  });

  it("still refuses a move onto a slot somebody is holding", async () => {
    await makeBooking("13:00", "Holder");
    const mover = await makeBooking("14:00", "Mover");

    await expect(
      admin().bookings.modify({ id: mover.id, startHour: "13:00", endHour: "14:00" }),
    ).rejects.toThrow(/already booked/i);
  });

  it("reports a duplicate slot on a move as a conflict, not a driver error", async () => {
    const mover = await makeBooking("15:00", "Mover");
    vi.spyOn(db, "updateBookingStatus").mockRejectedValue(driverError(1062, "ER_DUP_ENTRY"));

    const err = await admin()
      .bookings.modify({ id: mover.id, startHour: "16:00", endHour: "17:00" })
      .then(() => null, (e: Error) => e);

    expect(err!.message).toMatch(/already booked|already holds/i);
    expectNoStatementLeak(err!.message);
  });
});
