-- Prove bookings_active_slot_unique actually refuses a double booking.
--
-- Run in the Supabase SQL editor. It prints a result table; the editor does not
-- show RAISE NOTICE output, which is why nothing here relies on notices.
--
-- Safety: every row it writes carries the marker player_name below and is
-- deleted in an EXCEPTION WHEN OTHERS handler as well as on the happy path, so
-- an unexpected error still cleans up after itself. The date is in 2099 so the
-- rows cannot collide with a real booking even in the window they exist.
--
-- Read the `result` column. Four rows, all PASS, or the guarantee is not there.

CREATE TEMP TABLE IF NOT EXISTS verify_results (
  seq INT, check_name TEXT, result TEXT, detail TEXT
) ON COMMIT DROP;
DELETE FROM verify_results;

DO $$
DECLARE
  v_venue INT;
  v_court INT;
  v_date  VARCHAR(10) := '2099-01-01';
  v_mark  VARCHAR(128) := 'INDEX VERIFICATION - DELETE ME';
  v_first INT;
BEGIN
  -- 0. Negative control. The detection query must say "absent" for an index
  --    that was never created. Without this, a query that always returns true
  --    would make check 1 pass for the wrong reason.
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'bookings' AND indexname = 'bookings_active_slot_unique_NOPE'
  ) THEN
    INSERT INTO verify_results VALUES (0, 'negative control', 'FAIL',
      'The detection query reports an index that does not exist. Checks below prove nothing.');
  ELSE
    INSERT INTO verify_results VALUES (0, 'negative control', 'PASS',
      'Detection query correctly reports a nonexistent index as absent.');
  END IF;

  -- 1. The index exists.
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'bookings' AND indexname = 'bookings_active_slot_unique'
  ) THEN
    INSERT INTO verify_results VALUES (1, 'index exists', 'PASS',
      (SELECT indexdef FROM pg_indexes WHERE indexname = 'bookings_active_slot_unique'));
  ELSE
    INSERT INTO verify_results VALUES (1, 'index exists', 'FAIL',
      'bookings_active_slot_unique is missing. The migration did not apply.');
    RETURN;
  END IF;

  SELECT c.venue_id, c.id INTO v_venue, v_court FROM courts c LIMIT 1;
  IF v_court IS NULL THEN
    INSERT INTO verify_results VALUES (2, 'setup', 'FAIL', 'No courts exist, cannot test.');
    RETURN;
  END IF;

  INSERT INTO bookings (reference, court_id, venue_id, player_date, start_hour, end_hour,
                        player_name, channel, payment_status, total_amount)
  VALUES ('VERIFY-A', v_court, v_venue, v_date, '06:00', '07:00',
          v_mark, 'online', 'pending', 0)
  RETURNING id INTO v_first;

  -- 2. A second live booking for the same slot must be refused.
  BEGIN
    INSERT INTO bookings (reference, court_id, venue_id, player_date, start_hour, end_hour,
                          player_name, channel, payment_status, total_amount)
    VALUES ('VERIFY-B', v_court, v_venue, v_date, '06:00', '07:00',
            v_mark, 'online', 'pending', 0);
    INSERT INTO verify_results VALUES (2, 'refuses double booking', 'FAIL',
      'A second live booking for the same court, date, and hour was accepted.');
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO verify_results VALUES (2, 'refuses double booking', 'PASS',
      'Second live booking rejected with SQLSTATE 23505.');
  END;

  -- 3. Cancelling must free the slot. This is what separates the Postgres
  --    partial index from the MySQL index it replaced.
  UPDATE bookings SET payment_status = 'cancelled' WHERE id = v_first;
  BEGIN
    INSERT INTO bookings (reference, court_id, venue_id, player_date, start_hour, end_hour,
                          player_name, channel, payment_status, total_amount)
    VALUES ('VERIFY-C', v_court, v_venue, v_date, '06:00', '07:00',
            v_mark, 'online', 'pending', 0);
    INSERT INTO verify_results VALUES (3, 'cancel frees the slot', 'PASS',
      'A cancelled booking no longer occupies its court.');
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO verify_results VALUES (3, 'cancel frees the slot', 'FAIL',
      'A cancelled booking still blocks its court. The index is not partial.');
  END;

  DELETE FROM bookings WHERE player_name = v_mark;

EXCEPTION WHEN OTHERS THEN
  DELETE FROM bookings WHERE player_name = 'INDEX VERIFICATION - DELETE ME';
  INSERT INTO verify_results VALUES (9, 'unexpected error', 'FAIL', SQLERRM);
END $$;

-- Nothing this script wrote should remain. A non-zero count here is a bug in
-- the script, and it is reported rather than left for somebody to find.
INSERT INTO verify_results
SELECT 4, 'cleanup', CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
       count(*) || ' verification rows left behind'
FROM bookings WHERE player_name = 'INDEX VERIFICATION - DELETE ME';

SELECT check_name, result, detail FROM verify_results ORDER BY seq;
