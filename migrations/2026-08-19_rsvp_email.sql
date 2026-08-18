-- RSVP + booking email migration (Supabase Postgres)

-- Booking email address (optional) for confirmation emails
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings' AND column_name = 'player_email'
  ) THEN
    ALTER TABLE bookings ADD COLUMN player_email TEXT;
  END IF;
END $$;

-- Event attendance (RSVP)
CREATE TABLE IF NOT EXISTS event_attendance (
  id SERIAL PRIMARY KEY,
  announcement_id INTEGER NOT NULL,
  player_name TEXT NOT NULL,
  contact TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
