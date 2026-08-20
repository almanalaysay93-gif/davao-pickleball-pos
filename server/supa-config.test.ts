import { describe, expect, it } from "vitest";
import { PRODUCTION_URL, resolveSupabaseUrl } from "./supa";

/**
 * Every case below is a value that SUPABASE_URL actually held at some point
 * while this was being configured. Each one reached PostgREST and came back as
 * "Invalid path specified in request URL" or a bare 401, neither of which names
 * the variable at fault.
 */
describe("resolveSupabaseUrl", () => {
  it("falls back to the production project when the variable is absent", () => {
    expect(resolveSupabaseUrl(undefined)).toBe(PRODUCTION_URL);
    expect(resolveSupabaseUrl("")).toBe(PRODUCTION_URL);
    expect(resolveSupabaseUrl("   ")).toBe(PRODUCTION_URL);
  });

  it("accepts a bare origin unchanged", () => {
    expect(resolveSupabaseUrl("https://dwbilhkjqsppcmahooaf.supabase.co")).toBe(
      "https://dwbilhkjqsppcmahooaf.supabase.co",
    );
  });

  it("tolerates a trailing slash, because that is how the dashboard copies it", () => {
    expect(resolveSupabaseUrl("https://dwbilhkjqsppcmahooaf.supabase.co/")).toBe(
      "https://dwbilhkjqsppcmahooaf.supabase.co",
    );
  });

  it("rejects the REST path suffix, which createClient would double", () => {
    // The client appends /rest/v1 itself, so this produced /rest/v1/rest/v1.
    expect(() => resolveSupabaseUrl("https://x.supabase.co/rest/v1/")).toThrow(/\/rest\/v1/);
  });

  it("rejects a Postgres connection string, and says that is what it is", () => {
    // The https check alone would also reject this, but with "served over
    // postgresql", which reads like a scheme typo rather than the wrong string
    // off the dashboard. Assert the message that actually helps.
    expect(() => resolveSupabaseUrl("postgresql://postgres:pw@db.x.supabase.co:5432/postgres")).toThrow(
      /Postgres connection string/,
    );
    expect(() => resolveSupabaseUrl("postgres://postgres:pw@db.x.supabase.co:5432/postgres")).toThrow(
      /Postgres connection string/,
    );
  });

  it("never repeats a password back into the error message or a log", () => {
    const secret = "Sup3rSecretPassw0rd";
    let message = "";
    try {
      resolveSupabaseUrl(`postgresql://postgres:${secret}@db.x.supabase.co:5432/postgres`);
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).not.toBe("");
    expect(message).not.toContain(secret);
  });

  it("rejects credentials embedded in an https URL", () => {
    const secret = "hunter2";
    expect(() => resolveSupabaseUrl(`https://postgres:${secret}@x.supabase.co`)).toThrow();
    try {
      resolveSupabaseUrl(`https://postgres:${secret}@x.supabase.co`);
    } catch (err) {
      expect((err as Error).message).not.toContain(secret);
    }
  });

  it("rejects plain http", () => {
    expect(() => resolveSupabaseUrl("http://x.supabase.co")).toThrow(/https/i);
  });

  it("names the variable so the fix is obvious", () => {
    expect(() => resolveSupabaseUrl("https://x.supabase.co/rest/v1/")).toThrow(/SUPABASE_URL/);
  });
});
