/**
 * Direct database access for assertions, against the TEST Supabase project.
 *
 * Same guard pattern as scripts/setupTestDb.mjs and vitest.setup.ts, for the
 * same reason: these helpers delete rows, and a missing line in .env must not
 * silently redirect that at production.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const PRODUCTION_REF = "tfwyrbqygbhrkmlapxxu";

const url = process.env.SUPABASE_URL_TEST;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY_TEST;

if (!url || !key) {
  throw new Error(
    "SUPABASE_URL_TEST and SUPABASE_SERVICE_ROLE_KEY_TEST are not both set. " +
      "The browser suite deletes rows and will not run against the production project.",
  );
}
if (url === process.env.SUPABASE_URL) {
  throw new Error("SUPABASE_URL_TEST points at the same project as SUPABASE_URL. Refusing to run.");
}
if (url.includes(PRODUCTION_REF)) {
  throw new Error(
    `SUPABASE_URL_TEST points at the production project (${PRODUCTION_REF}). Refusing to run.`,
  );
}

export const testProjectUrl = url;

export const supaTest = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: "public" },
});

export type BookingRow = {
  id: number;
  reference: string;
  player_name: string;
  player_date: string;
  start_hour: string;
  end_hour: string;
  court_id: number;
  venue_id: number;
  channel: string;
  payment_status: string;
  payment_method: string | null;
  paymongo_session_id: string | null;
  total_amount: string;
};

const COLUMNS =
  "id,reference,player_name,player_date,start_hour,end_hour,court_id,venue_id,channel,payment_status,payment_method,paymongo_session_id,total_amount";

/** The booking a test just made, found by the unique player name it used. */
export async function bookingByPlayerName(playerName: string): Promise<BookingRow | null> {
  const { data, error } = await supaTest
    .from("bookings")
    .select(COLUMNS)
    .eq("player_name", playerName)
    .order("id", { ascending: false })
    .limit(1);
  if (error) throw new Error(`bookingByPlayerName(${playerName}): ${error.message}`);
  return (data?.[0] as BookingRow | undefined) ?? null;
}

/**
 * Wait for the booking row to exist. bookings.create returns before the row is
 * visible to a second connection often enough to matter, and the alternative
 * is a flaky read immediately after the click.
 */
export async function waitForBooking(playerName: string, timeoutMs = 20_000): Promise<BookingRow> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const row = await bookingByPlayerName(playerName);
    if (row) return row;
    if (Date.now() > deadline) {
      throw new Error(`No booking row appeared for player "${playerName}" within ${timeoutMs}ms`);
    }
    await new Promise(r => setTimeout(r, 400));
  }
}

export async function bookingByReference(reference: string): Promise<BookingRow | null> {
  const { data, error } = await supaTest
    .from("bookings")
    .select(COLUMNS)
    .eq("reference", reference)
    .limit(1);
  if (error) throw new Error(`bookingByReference(${reference}): ${error.message}`);
  return (data?.[0] as BookingRow | undefined) ?? null;
}

/**
 * Remove every booking this run created.
 *
 * server/bookings.test.ts leaks rows when a test fails, and a leaked row makes
 * the next run fail with "This slot is already booked". Deleting by the run's
 * name prefix runs regardless of which assertion failed.
 */
export async function deleteBookingsByPlayerPrefix(prefix: string): Promise<number> {
  const { data, error } = await supaTest
    .from("bookings")
    .delete()
    .like("player_name", `${prefix}%`)
    .select("id");
  if (error) throw new Error(`deleteBookingsByPlayerPrefix(${prefix}): ${error.message}`);
  return data?.length ?? 0;
}
