import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getAuthPoolForTests } from "./routers";
import { verifyPassword } from "./auth";
import { ensureMasterAdmin, findMasterAdmin } from "./adminBootstrap";

/**
 * The master admin is the account that can reach every venue, and nothing in
 * the application creates one. A deployment that has run its migrations has a
 * complete schema, an empty ownerCredentials table, and no way for anybody to
 * sign in - including the person who would create the first venue.
 */

const pool = () => getAuthPoolForTests();

/** Long enough to be a real password and not published anywhere. */
const GOOD = "kalachuchi-court-19-north";

type Row = { id: number; username: string; passwordHash: string };
let saved: Row[] = [];

beforeAll(async () => {
  // The test database is seeded with a master admin that other suites sign in
  // with, so it is put back byte for byte when this file is done.
  const [rows] = await pool().query("SELECT id, username, passwordHash FROM ownerCredentials WHERE venueId IS NULL");
  saved = rows as Row[];
});

afterAll(async () => {
  await pool().query("DELETE FROM ownerCredentials WHERE venueId IS NULL");
  for (const r of saved) {
    await pool().query(
      "INSERT INTO ownerCredentials (id, username, passwordHash, venueId) VALUES (?, ?, ?, NULL)",
      [r.id, r.username, r.passwordHash],
    );
  }
});

beforeEach(async () => {
  await pool().query("DELETE FROM ownerCredentials WHERE venueId IS NULL");
  await pool().query("DELETE FROM ownerCredentials WHERE username LIKE 'bootstrap-%'");
});

describe("master admin bootstrap", () => {
  it("creates the first master admin when the database has none", async () => {
    expect(await findMasterAdmin(pool())).toBeUndefined();

    const res = await ensureMasterAdmin(pool(), { username: "owner", password: GOOD });

    expect(res.created).toBe(true);
    const [rows] = await pool().query(
      "SELECT username, passwordHash, venueId FROM ownerCredentials WHERE username = 'owner' LIMIT 1",
    );
    const row = (rows as { username: string; passwordHash: string; venueId: number | null }[])[0]!;
    // venueId null is what makes it the master rather than one venue's login.
    expect(row.venueId).toBeNull();
    expect(await verifyPassword(GOOD, row.passwordHash)).toBe(true);
  });

  it("leaves an existing master admin exactly as it was", async () => {
    await ensureMasterAdmin(pool(), { username: "owner", password: GOOD });
    const before = await findMasterAdmin(pool());

    // Safe to run on every deploy is the point. Rewriting the hash here would
    // reset the venue's password to whatever the last deploy script held.
    const res = await ensureMasterAdmin(pool(), { username: "owner", password: "an-entirely-different-one" });

    expect(res.created).toBe(false);
    const [rows] = await pool().query(
      "SELECT passwordHash FROM ownerCredentials WHERE id = ? LIMIT 1",
      [before!.id],
    );
    const hash = (rows as { passwordHash: string }[])[0]!.passwordHash;
    expect(await verifyPassword(GOOD, hash)).toBe(true);
  });

  it("does not add a second master admin under a different name", async () => {
    await ensureMasterAdmin(pool(), { username: "owner", password: GOOD });

    // The unique index on username does not cover this: a second row named
    // something else inserts cleanly and the deployment ends up with two
    // accounts that can reach every venue, one of them holding a password
    // whoever ran the script last happened to have.
    const res = await ensureMasterAdmin(pool(), { username: "bootstrap-second", password: GOOD });

    expect(res.created).toBe(false);
    const [rows] = await pool().query("SELECT id FROM ownerCredentials WHERE venueId IS NULL");
    expect(rows as unknown[]).toHaveLength(1);
  });

  it("does not mistake a venue's own login for the master admin", async () => {
    await pool().query(
      "INSERT INTO ownerCredentials (username, passwordHash, venueId) VALUES ('bootstrap-venue', 'x', 1)",
    );

    // A venue-scoped login can only reach its own venue, so a deployment that
    // has one and nothing else is still locked out of every other venue.
    expect(await findMasterAdmin(pool())).toBeUndefined();
    expect((await ensureMasterAdmin(pool(), { username: "owner", password: GOOD })).created).toBe(true);
  });

  it("creates one master admin when two deploys start at once", async () => {
    const both = await Promise.all([
      ensureMasterAdmin(pool(), { username: "owner", password: GOOD }),
      ensureMasterAdmin(pool(), { username: "owner", password: GOOD }),
    ]);

    // Both read an empty table and both insert. The unique index on username
    // settles it, and the loser has to report the truth rather than fail.
    expect(both.filter(r => r.created)).toHaveLength(1);
    const [rows] = await pool().query("SELECT id FROM ownerCredentials WHERE venueId IS NULL");
    expect(rows as unknown[]).toHaveLength(1);
  });

  it("refuses a password short enough to guess", async () => {
    await expect(ensureMasterAdmin(pool(), { username: "owner", password: "short1234" })).rejects.toThrow(
      /12 characters/i,
    );
    expect(await findMasterAdmin(pool())).toBeUndefined();
  });

  it("refuses a password that is published in this repository", async () => {
    // The seed scripts carry these, so they are in the git history and in
    // anybody's clone. Long enough to pass a length check and worth nothing.
    await expect(
      ensureMasterAdmin(pool(), { username: "owner", password: "Pickleyard2026!" }),
    ).rejects.toThrow(/published|repository|development/i);
    await expect(
      ensureMasterAdmin(pool(), { username: "owner", password: "Davao2026!" }),
    ).rejects.toThrow(/published|repository|development|12 characters/i);
    expect(await findMasterAdmin(pool())).toBeUndefined();
  });

  it("refuses a blank username", async () => {
    await expect(ensureMasterAdmin(pool(), { username: "   ", password: GOOD })).rejects.toThrow(
      /username/i,
    );
  });
});
