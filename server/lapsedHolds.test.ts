import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Releasing a lapsed hold has two halves, and the MySQL branch shipped only
 * one of them: the booking row was expired but its PayMongo session stayed
 * payable. A player who left the tab open could then pay, an hour later, for a
 * court somebody else had already taken.
 *
 * Both halves are mocked here rather than reached through a database, because
 * what is being checked is that the second half happens at all, and which
 * sessions it happens for.
 */
vi.mock("./db", () => ({ expireStaleHolds: vi.fn() }));
vi.mock("./paymongo", () => ({ expireCheckoutSession: vi.fn() }));

import * as db from "./db";
import { expireCheckoutSession } from "./paymongo";
import { releaseLapsedHolds } from "./settlement";

const expireStaleHolds = vi.mocked(db.expireStaleHolds);
const expireSession = vi.mocked(expireCheckoutSession);

/** Only the fields releaseLapsedHolds reads. */
function lapsed(reference: string, paymongoSessionId: string | null) {
  return { reference, paymongoSessionId } as unknown as Awaited<
    ReturnType<typeof db.expireStaleHolds>
  >[number];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("releasing a lapsed hold", () => {
  it("closes the checkout session of every booking it expired", async () => {
    expireStaleHolds.mockResolvedValue([lapsed("AAA111", "cs_a"), lapsed("BBB222", "cs_b")]);

    const count = await releaseLapsedHolds();

    expect(count).toBe(2);
    expect(expireSession).toHaveBeenCalledTimes(2);
    expect(expireSession).toHaveBeenCalledWith("cs_a");
    expect(expireSession).toHaveBeenCalledWith("cs_b");
  });

  it("leaves the gateway alone when no hold lapsed", async () => {
    expireStaleHolds.mockResolvedValue([]);

    expect(await releaseLapsedHolds()).toBe(0);
    // Availability is a public page load. A gateway call on every view of an
    // empty schedule would be a bill and a latency cost for nothing.
    expect(expireSession).not.toHaveBeenCalled();
  });

  it("skips a booking that never opened a checkout", async () => {
    expireStaleHolds.mockResolvedValue([lapsed("CCC333", null), lapsed("DDD444", "cs_d")]);

    await releaseLapsedHolds();

    expect(expireSession).toHaveBeenCalledTimes(1);
    expect(expireSession).toHaveBeenCalledWith("cs_d");
  });

  it("passes the caller's scope through rather than sweeping the table", async () => {
    expireStaleHolds.mockResolvedValue([]);
    const now = new Date("2026-08-20T10:00:00Z");

    await releaseLapsedHolds(now, { venueId: 7, playerDate: "2026-08-21" });

    expect(expireStaleHolds).toHaveBeenCalledWith(now, { venueId: 7, playerDate: "2026-08-21" });
  });

  it("still reports the release when the gateway refuses to close a session", async () => {
    expireStaleHolds.mockResolvedValue([lapsed("EEE555", "cs_e")]);
    expireSession.mockRejectedValue(new Error("PayMongo is down"));

    // The court is already free in the database. Throwing here would take the
    // whole availability grid down because one session could not be closed.
    await expect(releaseLapsedHolds()).resolves.toBe(1);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("cs_e"),
      expect.any(Error),
    );
  });

  it("closes the remaining sessions when one of them fails", async () => {
    expireStaleHolds.mockResolvedValue([lapsed("FFF666", "cs_f"), lapsed("GGG777", "cs_g")]);
    expireSession.mockRejectedValueOnce(new Error("PayMongo is down"));

    await releaseLapsedHolds();

    expect(expireSession).toHaveBeenCalledTimes(2);
    expect(expireSession).toHaveBeenCalledWith("cs_g");
  });
});
