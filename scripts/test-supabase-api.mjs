// Quick test: does the service key work on the Management API /v1/sql endpoint?
// POST https://api.supabase.com/v1/projects/{ref}/sql with Authorization: Bearer <service_key>
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const REF = "tfwyrbqygbhrkmlapxxu";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sql = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "supabase-schema.sql"), "utf8");

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/sql`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query: sql }),
});
const body = await res.text();
console.log("Status:", res.status);
console.log(body.slice(0, 1500));
