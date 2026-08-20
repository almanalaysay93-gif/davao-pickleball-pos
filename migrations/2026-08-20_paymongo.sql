-- PayMongo online payment migration (Supabase Postgres)
--
-- Ported from the MySQL branch feat/paymongo-payments. Two things changed in
-- the port and both are simplifications:
--
-- 1. MySQL needed a generated column (`activeSlot`) to make the slot key go
--    NULL for cancelled and expired bookings, because a MySQL UNIQUE index
--    covers every row. Postgres takes a WHERE clause on the index instead, so
--    the generated column is gone and the rule is stated directly.
-- 2. payment_status is a CHECK constraint here, not an enum type, so adding
--    'expired' means replacing the constraint rather than altering a type.

-- Hold expiry: when an unpaid booking stops holding its court.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE bookings ADD COLUMN expires_at TIMESTAMPTZ;
  END IF;
END $$;

-- The PayMongo checkout session this booking is being paid through.
-- Needed to expire the session when the hold lapses, and to reconcile a
-- payment back to its booking when the webhook arrives.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'paymongo_session_id'
  ) THEN
    ALTER TABLE bookings ADD COLUMN paymongo_session_id VARCHAR(64);
  END IF;
END $$;

-- 'expired' is a distinct outcome from 'cancelled': nobody chose it, the hold
-- simply ran out. The two are kept apart because a payment that lands after an
-- expiry is reported to the venue, while one that lands after a cancellation
-- is a refund question.
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_payment_status_check
  CHECK (payment_status IN ('pending', 'paid', 'cancelled', 'expired'));

-- One booking per court per hour, enforced by the database rather than by a
-- check-then-write in the application.
--
-- The WHERE clause is the whole point. A cancelled or expired booking has
-- released its court, so it falls out of the index and stops occupying the
-- slot. Without it, a cancelled 8pm booking would block the court forever.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_active_slot_unique
  ON bookings (court_id, player_date, start_hour)
  WHERE payment_status IN ('pending', 'paid');

-- Availability sweeps read a court's whole day. Without this they seq-scan the
-- table on the public booking path.
CREATE INDEX IF NOT EXISTS bookings_court_day_idx
  ON bookings (court_id, player_date);

-- expireStaleHolds scans for lapsed holds by status and time.
CREATE INDEX IF NOT EXISTS bookings_hold_expiry_idx
  ON bookings (payment_status, expires_at);
