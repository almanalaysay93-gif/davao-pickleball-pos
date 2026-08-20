import { afterEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import type { Request } from "express";
import { decodeSessionCookie, getSessionSecret } from "./auth";
import * as db from "./db";

/**
 * The key every session cookie is signed with.
 *
 * A fixed fallback is the same as no authentication at all. Anyone holding a
 * copy of this source can mint an ownerSession cookie for any venue and sign
 * in as its owner, and the server cannot tell that token from one it issued.
 */

const REAL = "a-real-secret-of-quite-sufficient-length";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/** A request carrying one owner cookie, as express would present it. */
function reqWith(token: string): Request {
  return { cookies: { ownerSession: token } } as unknown as Request;
}

/**
 * The master admin's id, read through the same helper the app uses.
 *
 * The MySQL version of this ran raw SQL against a pool the router exported.
 * That pool is gone with the Supabase migration, and reaching for a private
 * connection would test a path the app no longer takes.
 */
async function masterAdminId(): Promise<number> {
  const row = await db.getOwnerCredentialByUsername("owner");
  if (!row) throw new Error("No master admin account exists. Run: pnpm admin:bootstrap");
  return Number(row.id);
}

describe("session secret", () => {
  it("uses the configured secret", () => {
    vi.stubEnv("JWT_SECRET", REAL);
    expect(getSessionSecret()).toBe(REAL);
  });

  it("reads the secret when asked, not when this module was loaded", () => {
    vi.stubEnv("JWT_SECRET", REAL);
    expect(getSessionSecret()).toBe(REAL);
    vi.stubEnv("JWT_SECRET", `${REAL}-rotated`);
    // A value captured at import cannot be rotated without a redeploy, and it
    // also cannot be tested, because the first test to run fixes it forever.
    expect(getSessionSecret()).toBe(`${REAL}-rotated`);
  });

  it("refuses to run in production without a secret", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", "");
    expect(() => getSessionSecret()).toThrow(/JWT_SECRET/);
  });

  it("refuses a secret short enough to guess in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", "short");
    expect(() => getSessionSecret()).toThrow(/JWT_SECRET/);
  });

  it("refuses when nobody said which environment this is", () => {
    // An unset or misspelled NODE_ENV must not be read as permission to use a
    // development fallback. Being wrong in the strict direction costs a boot
    // failure; being wrong the other way costs every venue's account.
    vi.stubEnv("NODE_ENV", "staging");
    vi.stubEnv("JWT_SECRET", "");
    expect(() => getSessionSecret()).toThrow(/JWT_SECRET/);
  });

  it("falls back only when the environment says development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("JWT_SECRET", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(getSessionSecret()).toBeTruthy();
    // Silent is how a fallback ends up in production. It has to be noisy.
    expect(warn).toHaveBeenCalled();
  });
});

describe("session cookies signed with the wrong secret", () => {
  it("accepts a cookie it signed itself", async () => {
    vi.stubEnv("JWT_SECRET", REAL);
    const id = await masterAdminId();
    const token = jwt.sign({ sub: id, type: "owner", username: "owner", venueId: null }, REAL);

    const user = await decodeSessionCookie(reqWith(token));

    expect(user?.type).toBe("owner");
    expect(user?.id).toBe(id);
  });

  it("rejects a cookie minted with a different secret", async () => {
    const id = await masterAdminId();
    // What an attacker holding the source would forge if the key were known.
    const forged = jwt.sign({ sub: id, type: "owner", username: "owner", venueId: null }, "dev-secret");
    vi.stubEnv("JWT_SECRET", REAL);

    expect(await decodeSessionCookie(reqWith(forged))).toBeNull();
  });
});
