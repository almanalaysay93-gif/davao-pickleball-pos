import { createClient } from "@supabase/supabase-js";

const SUPA_URL = process.env.SUPABASE_URL ?? "https://tfwyrbqygbhrkmlapxxu.supabase.co";
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const supa = createClient(SUPA_URL, SUPA_KEY);

const { data, error } = await supa.from("reviews").select("id").limit(5);
console.log("error:", error?.message ?? null);
console.log("rows:", JSON.stringify(data));
process.exit(0);
