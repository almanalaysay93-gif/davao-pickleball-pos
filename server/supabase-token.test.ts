import { describe, expect, it } from "vitest";

const REF = "tfwyrbqygbhrkmlapxxu";

describe("SUPABASE_MANAGEMENT_API_TOKEN validation", () => {
  it(
    "verifies the token can execute a read-only SQL query on the project database",
    async () => {
      const token = process.env.SUPABASE_MANAGEMENT_API_TOKEN;
      expect(token && token.startsWith("sbp_")).toBe(true);

      // The /v1/projects listing can return 403 when the token's account is not a
      // member of the project's Supabase organization — an org-membership check,
      // not an authentication check. The SQL endpoint is the capability the
      // migration tooling actually depends on, so validate that directly.
      const res2 = await fetch(
        `https://api.supabase.com/v1/projects/${REF}/database/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: "SELECT 1 AS ok" }),
        },
      );
      expect([200, 201]).toContain(res2.status);
      const body = (await res2.json()) as unknown[];
      expect(Array.isArray(body)).toBe(true);
    },
    { timeout: 30000 }
  );
});
