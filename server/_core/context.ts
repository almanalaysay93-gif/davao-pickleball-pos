import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { decodeSessionCookie, type AppUser } from "../auth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: AppUser | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  // Independent app auth: owner portal + customer app use their own
  // session cookies (ownerSession / customerSession).
  let user: AppUser | null = null;

  try {
    // Independent app auth: owner portal + customer app use their own
    // session cookies (ownerSession / customerSession). No OAuth fallback.
    user = await decodeSessionCookie(opts.req);
  } catch {
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
