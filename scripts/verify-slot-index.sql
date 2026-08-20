-- Prove bookings_active_slot_unique actually refuses a double booking.
--
-- Run in the Supabase SQL editor. Everything happens inside a transaction that
-- rolls back, so no row survives this script even when it fails. The far-future
-- date and the marker name are a second layer of safety, not the first.
--
-- Expected output, in order:
--   NOTICE:  index present: bookings_active_slot_unique
--   NOTICE:  PASS 1/2: second live booking refused (SQLSTATE 23505)
--   NOTICE:  PASS 2/2: cancelled booking released its slot
--   NOTICE:  rolled back, no rows kept
--
-- Any FAIL line, or a missing PASS, means the guarantee is not in place.

BEGIN;

DO $$
DECLARE
  v_venue INT;
  v_court INT;
  v_date  VARCHAR(10) := '2099-01-01';
  v_mark  VARCHAR(128) := 'INDEX VERIFICATION - DELETE ME';
  v_first INT;
BEGIN
  -- The index has to exist before anything else is worth testing.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'bookings' AND indexname = 'bookings_active_slot_unique'
  ) THEN
    RAISE EXCEPTION 'FAIL: bookings_active_slot_unique does not exist. The migration did not apply.';
  END IF;
  RAISE NOTICE 'index present: bookings_active_slot_unique';

  SELECT c.venue_id, c.id INTO v_venue, v_court FROM courts c LIMIT 1;
  IF v_court IS NULL THEN
    RAISE EXCEPTION 'FAIL: no courts exist, cannot test.';
  END IF;

  -- A live booking holding 06:00.
  INSERT INTO bookings (reference, court_id, venue_id, player_date, start_hour, end_hour,
                        player_name, channel, payment_status, total_amount)
  VALUES ('VERIFY-A', v_court, v_venue, v_date, '06:00', '07:00',
          v_mark, 'online', 'pending', 0)
  RETURNING id INTO v_first;

  -- Test 1: a second live booking for the same slot must be refused.
  BEGIN
    INSERT INTO bookings (reference, court_id, venue_id, player_date, start_hour, end_hour,
                          player_name, channel, payment_status, total_amount)
    VALUES ('VERIFY-B', v_court, v_venue, v_date, '06:00', '07:00',
            v_mark, 'online', 'pending', 0);
    RAISE EXCEPTION 'FAIL 1/2: the index allowed a second live booking for the same slot.';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS 1/2: second live booking refused (SQLSTATE 23505)';
  END;

  -- Test 2: cancelling the first booking must free the slot. This is the whole
  -- point of the partial index; without the WHERE clause a cancelled booking
  -- would block the court permanently.
  UPDATE bookings SET payment_status = 'cancelled' WHERE id = v_first;

  BEGIN
    INSERT INTO bookings (reference, court_id, venue_id, player_date, start_hour, end_hour,
                          player_name, channel, payment_status, total_amount)
    VALUES ('VERIFY-C', v_court, v_venue, v_date, '06:00', '07:00',
            v_mark, 'online', 'pending', 0);
    RAISE NOTICE 'PASS 2/2: cancelled booking released its slot';
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'FAIL 2/2: a cancelled booking is still blocking its court. The index is not partial.';
  END;
END $$;

-- Belt and braces: named delete in case this is ever run outside a transaction.
DELETE FROM bookings WHERE player_name = 'INDEX VERIFICATION - DELETE ME';

DO $$ BEGIN RAISE NOTICE 'rolled back, no rows kept'; END $$;

ROLLBACK;
