import { createClient } from "@supabase/supabase-js";
const c = createClient("https://tfwyrbqygbhrkmlapxxu.supabase.co", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", { auth: { persistSession: false, autoRefreshToken: false } });

// Try fetching actual rows from candidate tables — schema cache miss shows real missing tables
const candidates = ["venue_owners", "users", "customer_accounts"];
for (const t of candidates) {
  const r = await c.from(t).select("*").limit(1);
  console.log(t, "-> rows:", r.data?.length ?? null, "err:", r.error?.message ?? null);
  if (r.data?.[0]) console.log("  cols:", Object.keys(r.data[0]).join(","));
}
// venueOwners usage: check what table the app expects. Maybe the table is named "venue_owners" but the user_id column differs
const r2 = await c.from("venue_owners").select("*").limit(2);
console.log("venue_owners rows:", r2.data?.length ?? null, "err:", r2.error?.message ?? null);
if (r2.data?.[0]) console.log("  cols:", Object.keys(r2.data[0]).join(","));
process.exit(0);
