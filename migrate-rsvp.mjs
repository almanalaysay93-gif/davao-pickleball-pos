import { readFileSync } from "node:fs";

const REF = process.env.SUPABASE_REF;
const TOKEN = process.env.SUPABASE_MANAGEMENT_API_TOKEN;
if (!REF || !TOKEN) {
  console.error("Missing SUPABASE_REF or SUPABASE_MANAGEMENT_API_TOKEN");
  process.exit(1);
}

const sql = readFileSync(new URL("migrations/2026-08-19_rsvp_email.sql", import.meta.url), "utf8");
const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query: sql }),
});
const body = await res.text();
console.log("HTTP:", res.status);
console.log(body.slice(0, 2000));
process.exit(res.ok ? 0 : 1);
