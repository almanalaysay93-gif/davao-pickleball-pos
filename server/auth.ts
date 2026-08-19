import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Request } from "express";
import mysql from "mysql2/promise";

let _pool: mysql.Pool | null = null;
function getPool(): mysql.Pool {
  if (!_pool && process.env.DATABASE_URL) {
    _pool = mysql.createPool(process.env.DATABASE_URL);
  }
  return _pool!;
}

/**
 * The key every session cookie is signed with.
 *
 * A fallback baked into this file is not a weaker secret, it is no
 * authentication at all: the value is in every clone of this repository, so
 * anyone can mint an ownerSession cookie naming any venue and the server has no
 * way to tell it from one it issued. That is why an unconfigured production
 * boot has to fail rather than carry on quietly.
 *
 * Read per call, not at module load. A value captured at import cannot be
 * rotated without a redeploy, and it fixes itself before any test can set it.
 */
const DEV_FALLBACK = "dev-secret";

/** Below this a secret is a delay rather than an obstacle, given HS256. */
const MIN_SECRET_LENGTH = 32;

/**
 * Only these two environments may fall back, and only when named outright.
 *
 * An unset or misspelled NODE_ENV counts as production here. Being wrong in
 * this direction costs a boot that fails with a clear message; being wrong the
 * other way costs every venue's account, silently.
 */
function isDevelopmentLike(): boolean {
  const env = process.env.NODE_ENV;
  return env === "development" || env === "test";
}

let warnedAboutFallback = false;

export function getSessionSecret(): string {
  const configured = process.env.JWT_SECRET?.trim() ?? "";
  const usable =
    configured.length >= MIN_SECRET_LENGTH && configured !== DEV_FALLBACK;
  if (usable) return configured;

  if (!isDevelopmentLike()) {
    throw new Error(
      configured
        ? `JWT_SECRET is too weak to sign sessions with. It must be at least ${MIN_SECRET_LENGTH} characters and must not be the development fallback. Generate one with: openssl rand -base64 48`
        : "JWT_SECRET is not set, so session cookies cannot be signed. Generate one with: openssl rand -base64 48",
    );
  }

  if (!warnedAboutFallback) {
    warnedAboutFallback = true;
    console.warn(
      "[auth] JWT_SECRET is unset or too short. Using a development key that is published in this repository. Sessions signed with it are forgeable.",
    );
  }
  return configured || DEV_FALLBACK;
}

/**
 * Fail at boot rather than at the first sign-in.
 *
 * A misconfigured deployment otherwise looks completely healthy until somebody
 * tries to log in, which is the worst moment to discover it.
 */
export function assertSessionSecret(): void {
  getSessionSecret();
}

export type SessionType = "owner" | "customer";

export type AppUser = {
  id: number;
  type: SessionType;
  /** For owner: fixed username. For customer: account email. */
  identity: string;
  name?: string | null;
  email?: string | null;
  /** Owner session role: "owner". */
  role: "owner" | "customer";
  /** Set for venue-specific owner logins; null for the global system owner. */
  venueId?: number | null;
};

const OWNER_COOKIE = "ownerSession";
const CUSTOMER_COOKIE = "customerSession";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

type OwnerPayload = {
  sub: number;
  type: "owner";
  username: string;
  venueId?: number | null;
};
type CustomerPayload = { sub: number; type: "customer"; accountId: number; email: string };

function signToken(payload: OwnerPayload | CustomerPayload): string {
  return jwt.sign(payload, getSessionSecret(), { expiresIn: MAX_AGE_SECONDS });
}

export async function decodeSessionCookie(req: Request): Promise<AppUser | null> {
  try {
    const ownerToken = req.cookies?.[OWNER_COOKIE];
    const customerToken = req.cookies?.[CUSTOMER_COOKIE];

    if (ownerToken) {
      const payload = jwt.verify(ownerToken, getSessionSecret()) as unknown as OwnerPayload;
      if (payload?.type === "owner" && payload.username) {
        const [rows] = await getPool().query(
          "SELECT id FROM ownerCredentials WHERE id = ?",
          [payload.sub]
        );
        if ((rows as any[]).length > 0) {
          return {
            id: payload.sub,
            type: "owner",
            identity: payload.username,
            name: payload.username,
            email: null,
            role: "owner",
            venueId: payload.venueId ?? null,
          };
        }
      }
    }

    if (customerToken) {
      const payload = jwt.verify(customerToken, getSessionSecret()) as unknown as CustomerPayload;
      if (payload?.type === "customer") {
        const [rows] = await getPool().query(
          "SELECT id, email, name FROM customerAccounts WHERE id = ?",
          [payload.accountId]
        );
        const row = (rows as any[])[0];
        if (row) {
          return {
            id: payload.accountId,
            type: "customer",
            identity: String(row.email),
            name: row.name,
            email: String(row.email),
            role: "customer",
          };
        }
      }
    }
  } catch {
    // Invalid or expired token — treat as signed out.
  }
  return null;
}

export function setOwnerCookie(
  res: any,
  username: string,
  id: number,
  venueId: number | null = null
) {
  res.cookie(
    OWNER_COOKIE,
    signToken({ sub: id, type: "owner", username, venueId }),
    {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS * 1000,
  });
}

export function setCustomerCookie(res: any, accountId: number, email: string) {
  res.cookie(
    CUSTOMER_COOKIE,
    signToken({ sub: accountId, type: "customer", accountId, email }),
    {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: MAX_AGE_SECONDS * 1000,
    }
  );
}

export function clearAuthCookies(res: any) {
  res.clearCookie(OWNER_COOKIE, { path: "/" });
  res.clearCookie(CUSTOMER_COOKIE, { path: "/" });
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
