import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
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
    user = await decodeSessionCookie(opts.req);
  } catch {
    user = null;
  }

  // Fallback: if the environment still hands out Manus OAuth sessions, honour
  // them so legacy admin flows keep working alongside the new auth.
  if (!user) {
    try {
      const oauthUser = await sdk.authenticateRequest(opts.req);
      if (oauthUser) {
        user = {
          id: oauthUser.id,
          type: "customer",
          identity: oauthUser.email ?? String(oauthUser.id),
          name: oauthUser.name,
          email: oauthUser.email ?? null,
          role: oauthUser.role === "admin" || oauthUser.role === "owner" ? "owner" : "customer",
        };
      }
    } catch {
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
