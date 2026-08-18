// Run SQL against the Supabase Postgres database via the Management API.
// Usage: node migrate-supabase.mjs [sql-file]
import { readFileSync } from "node:fs";

const token = process.env.SUPABASE_MANAGEMENT_API_TOKEN ?? "";
const ref = process.env.SUPABASE_REF ?? "tfwyrbqygbhrkmlapxxu";
const sqlFile = process.argv[2];

if (!token) {
  console.error("SUPABASE_MANAGEMENT_API_TOKEN is not set");
  process.exit(1);
}

const sql = readFileSync(sqlFile, "utf8");
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query: sql }),
});
const text = await res.text();
console.log("HTTP", res.status);
console.log(text.slice(0, 2000));
process.exit(res.ok ? 0 : 1);
