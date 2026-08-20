/**
 * The safety gate for the browser suite.
 *
 * `server/supa.ts` reads SUPABASE_URL and defaults to the production project
 * ref when it is absent. `.env` does not define SUPABASE_URL, so a dev server
 * started plainly talks to production. playwright.config.ts injects the _TEST
 * values, and this fixture refuses to let a single test touch the UI until the
 * running server has proved it reads the test database.
 *
 * The proof is a sentinel row rather than a name match. Production runs this
 * same app and holds the same eight seeded venue names, so recognising the
 * fixtures proves nothing. A row written through the test project's service
 * key, and then read back out of the server's own venues.list, can only appear
 * if the server and the test project are the same database.
 */
import { test as base, expect } from "@playwright/test";
import { supaTest, testProjectUrl } from "./db";

const PRODUCTION_REF = "tfwyrbqygbhrkmlapxxu";
const EXPECTED_TEST_REF = "dwbilhkjqsppcmahooaf";

async function proveServerUsesTestProject(baseURL: string): Promise<void> {
  if (!testProjectUrl.includes(EXPECTED_TEST_REF)) {
    throw new Error(
      `SUPABASE_URL_TEST does not point at the expected test project (${EXPECTED_TEST_REF}). Refusing to run.`,
    );
  }

  const sentinelName = `__e2e-sentinel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { data: inserted, error: insertError } = await supaTest
    .from("venues")
    .insert({
      name: sentinelName,
      address: "sentinel row written by the Playwright suite",
      district: "sentinel",
      court_count: 0,
      surface_type: "indoor",
      open_time: "06:00",
      close_time: "22:00",
      phone: "0000 000 0000",
      description: "Temporary row. Proves the server under test reads the test project.",
    })
    .select("id")
    .single();
  if (insertError) throw new Error(`Could not write the sentinel venue: ${insertError.message}`);

  try {
    const res = await fetch(`${baseURL}/api/trpc/venues.list?input=%7B%7D`);
    const body = await res.text();
    if (!res.ok) {
      throw new Error(`venues.list answered HTTP ${res.status} while proving the target project.`);
    }
    if (body.includes(PRODUCTION_REF)) {
      throw new Error("The server response mentions the production project ref. Stopping.");
    }
    if (!body.includes(sentinelName)) {
      throw new Error(
        "The server under test did NOT return the sentinel venue written to the test project. " +
          "It is reading some other database, possibly production. Refusing to run any test.",
      );
    }
  } finally {
    await supaTest.from("venues").delete().eq("id", inserted.id);
  }
}

/* eslint-disable @typescript-eslint/no-empty-object-type */
export const test = base.extend<{}, { testProjectProof: boolean }>({
  testProjectProof: [
    async ({}, use, workerInfo) => {
      const baseURL = workerInfo.project.use.baseURL;
      if (!baseURL) throw new Error("No baseURL configured; cannot prove the target project.");
      await proveServerUsesTestProject(baseURL);
      await use(true);
    },
    { scope: "worker", auto: true },
  ],
});

export { expect };
