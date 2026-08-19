import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { bookings as bookingsTable } from "../drizzle/schema";
import * as db from "./db";
import { getDb, listVenues } from "./db";

/**
 * What a booking's court is called, as opposed to which row it is.
 *
 * courtId is a key that is unique across every venue, so venue eight's first
 * court can be id 52. Printing it beside a venue name tells that venue's staff
 * to send players to a court number it does not have, and the venue whose
 * courts happen to be ids 1 to 11 sees correct numbers throughout, which is
 * what let this survive: the first venue in the list looks right.
 */

const day = "2027-11-04";

function guest(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: { host: "pos.example" } } as TrpcContext["req"],
    res: { clearCookie: () => undefined, cookie: () => undefined } as unknown as TrpcContext["res"],
  };
}

const admin = () =>
  appRouter.createCaller({
    user: { id: 1, type: "owner", identity: "owner", name: "owner", email: null, role: "owner" },
    req: { protocol: "https", headers: { host: "pos.example" } } as TrpcContext["req"],
    res: { clearCookie: () => undefined, cookie: () => undefined } as unknown as TrpcContext["res"],
  } as TrpcContext);

/**
 * A court whose id is not its name.
 *
 * Asserting against a court where the two coincide would pass on the broken
 * code, so the fixture looks for one where they differ and says so plainly if
 * the seed data no longer contains one.
 */
async function courtWithDistinctName() {
  for (const venue of await listVenues()) {
    const courts = await db.listCourtsByVenue(venue.id);
    const court = courts.find(c => c.status === "available" && c.courtNumber !== String(c.id));
    if (court) return { venue, court };
  }
  throw new Error("No seeded court has a name that differs from its id, so this test cannot bite.");
}

async function clean() {
  const raw = await getDb();
  if (raw) await raw.delete(bookingsTable).where(eq(bookingsTable.playerDate, day));
}

beforeEach(clean);
afterEach(clean);

describe("a booking list names its court", () => {
  it("gives the admin list the court's name, not its row id", async () => {
    const { venue, court } = await courtWithDistinctName();
    await appRouter.createCaller(guest()).bookings.create({
      venueId: venue.id,
      courtId: court.id,
      playerDate: day,
      startHour: "08:00",
      endHour: "09:00",
      playerName: "Court Name Alpha",
      channel: "online",
    });

    const rows = await admin().bookings.list({ limit: 500 });
    const row = rows.find(r => r.playerName === "Court Name Alpha");

    expect(row?.courtNumber).toBe(court.courtNumber);
  });

  it("gives the owner's own list the same name", async () => {
    const { venue, court } = await courtWithDistinctName();
    await appRouter.createCaller(guest()).bookings.create({
      venueId: venue.id,
      courtId: court.id,
      playerDate: day,
      startHour: "10:00",
      endHour: "11:00",
      playerName: "Court Name Bravo",
      channel: "online",
    });

    const rows = await admin().owner.bookings({ limit: 500 });
    const row = rows.find(r => r.booking.playerName === "Court Name Bravo");

    expect(row?.booking.courtNumber).toBe(court.courtNumber);
  });
});
