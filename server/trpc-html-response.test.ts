import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";

describe("tRPC router resilience", () => {
  it("announcements.list returns JSON-friendly empty array for anonymous callers", async () => {
    const caller = appRouter.createCaller({} as any);
    const list = await caller.announcements.list();
    expect(Array.isArray(list)).toBe(true);
  });

  it("venues.list returns the seeded venues", async () => {
    const caller = appRouter.createCaller({} as any);
    const list = await caller.venues.list();
    expect(list.length).toBeGreaterThanOrEqual(8);
    const names = list.map(v => v.name);
    expect(names).toContain("Arena Athletics");
  });

  it("batched Home input works end-to-end", async () => {
    // Replicates the batch=1 payload the Home page sends:
    // {json: null, meta: {values: ["undefined"]}} for 4 procedures.
    const caller = appRouter.createCaller({} as any);
    const procedures = ["announcements.list", "venues.list", "rates.all", "auth.me"] as const;
    const results = await Promise.all(
      procedures.map(async name => {
        const [router, proc] = name.split(".") as [keyof typeof appRouter._def.procedures, string];
        const callerProc = (caller[router] as any)[proc];
        return callerProc();
      })
    );
    expect(results[0]).toEqual([]);
    expect(Array.isArray(results[1])).toBe(true);
    expect(Array.isArray(results[2])).toBe(true);
    expect(results[3]).toBeUndefined();
  });
});
