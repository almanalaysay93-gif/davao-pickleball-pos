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

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";

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
};

const OWNER_COOKIE = "ownerSession";
const CUSTOMER_COOKIE = "customerSession";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

type OwnerPayload = { sub: number; type: "owner"; username: string };
type CustomerPayload = { sub: number; type: "customer"; accountId: number; email: string };

function signToken(payload: OwnerPayload | CustomerPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: MAX_AGE_SECONDS });
}

export async function decodeSessionCookie(req: Request): Promise<AppUser | null> {
  try {
    const ownerToken = req.cookies?.[OWNER_COOKIE];
    const customerToken = req.cookies?.[CUSTOMER_COOKIE];

    if (ownerToken) {
      const payload = jwt.verify(ownerToken, JWT_SECRET) as unknown as OwnerPayload;
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
          };
        }
      }
    }

    if (customerToken) {
      const payload = jwt.verify(customerToken, JWT_SECRET) as unknown as CustomerPayload;
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

export function setOwnerCookie(res: any, username: string, id: number) {
  res.cookie(OWNER_COOKIE, signToken({ sub: id, type: "owner", username }), {
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
