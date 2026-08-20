import { vi } from "vitest";

/**
 * Replace global fetch for PayMongo only, and leave every other call alone.
 *
 * The database used to speak Postgres over a socket, so a test could hand the
 * whole of `fetch` to a canned gateway response and nothing else cared. It
 * cares now: `server/supa.ts` reaches PostgREST over the same global fetch, so
 * a blanket stub answers a Supabase query with a checkout session and the row
 * mapper receives an object where it expects an array.
 *
 * The real implementation is captured at import time, before any test installs
 * a stub, so a pass-through survives `vi.unstubAllGlobals`.
 */
const GATEWAY = "https://api.paymongo.com";
const realFetch: typeof fetch = globalThis.fetch.bind(globalThis);

export type GatewayHandler = (url: string, init: RequestInit) => Response | Promise<Response>;

export function stubGatewayFetch(handler: GatewayHandler): void {
  vi.stubGlobal("fetch", async (input: unknown, init: RequestInit = {}) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : ((input as Request | undefined)?.url ?? String(input));
    if (!url.startsWith(GATEWAY)) return realFetch(input as RequestInfo, init);
    return handler(url, init);
  });
}
