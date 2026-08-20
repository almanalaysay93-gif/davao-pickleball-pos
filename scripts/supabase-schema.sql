-- Schema for the Davao Pickleball POS Supabase database.
--
-- Regenerated 2026-08-20 from a live introspection of production
-- (scripts/dump-schema.sql), because the previous version of this file had
-- drifted behind production by 12 tables and 13 columns.
--
-- This file mirrors production faithfully, including two defects that are
-- called out inline. Do not "clean up" those while copying - a test database
-- that is healthier than production hides the bugs it exists to catch.
--
-- Idempotent. Safe to run more than once.

-- ---------------------------------------------------------------------------
-- Core: venues, courts, rate tiers
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS venues (
  id SERIAL PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  address TEXT NOT NULL,
  district VARCHAR(64),
  court_count INT NOT NULL DEFAULT 1,
  surface_type TEXT NOT NULL DEFAULT 'indoor' CHECK (surface_type IN ('indoor','outdoor','covered')),
  open_time VARCHAR(5) NOT NULL,
  close_time VARCHAR(5) NOT NULL,
  phone VARCHAR(32),
  description TEXT,
  image_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS courts (
  id SERIAL PRIMARY KEY,
  venue_id INT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  court_number VARCHAR(16) NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','maintenance'))
);

CREATE TABLE IF NOT EXISTS rate_tiers (
  id SERIAL PRIMARY KEY,
  venue_id INT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  tier_name TEXT NOT NULL CHECK (tier_name IN ('daytime','nighttime')),
  start_hour VARCHAR(5) NOT NULL,
  end_hour VARCHAR(5) NOT NULL,
  price_per_hour NUMERIC(10,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS venue_gallery (
  id SERIAL PRIMARY KEY,
  venue_id INT NOT NULL,
  image_key TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Identity: users, accounts, ownership, staff
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  open_id VARCHAR(64) NOT NULL UNIQUE,
  name TEXT,
  email VARCHAR(320),
  login_method VARCHAR(64),
  role VARCHAR(10) NOT NULL DEFAULT 'player',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_signed_in TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_accounts (
  id SERIAL PRIMARY KEY,
  email VARCHAR(320) NOT NULL UNIQUE,
  name VARCHAR(128),
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS owner_credentials (
  id SERIAL PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  venue_id INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS venue_owners (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  venue_id INT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS staff (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  venue_id BIGINT NOT NULL,
  role TEXT NOT NULL DEFAULT 'staff',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, venue_id)
);

-- ---------------------------------------------------------------------------
-- Commerce: memberships, promo codes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS memberships (
  id BIGSERIAL PRIMARY KEY,
  venue_id BIGINT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC(12,2) NOT NULL,
  credits INT NOT NULL DEFAULT 1,
  validity_days INT NOT NULL DEFAULT 30,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS member_accounts (
  id BIGSERIAL PRIMARY KEY,
  customer_account_id BIGINT,
  phone TEXT,
  name TEXT NOT NULL,
  membership_id BIGINT NOT NULL,
  credits_remaining INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS promo_codes (
  id BIGSERIAL PRIMARY KEY,
  venue_id BIGINT NOT NULL,
  code VARCHAR(32) NOT NULL UNIQUE,
  discount_pct NUMERIC(6,2),
  discount_flat NUMERIC(10,2),
  min_amount NUMERIC(10,2),
  max_uses INT,
  uses INT NOT NULL DEFAULT 0,
  active SMALLINT NOT NULL DEFAULT 1,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  reference VARCHAR(16) NOT NULL UNIQUE,
  -- NOTE: court_id carries no foreign key in production. venue_id does.
  -- Deleting a court therefore orphans its bookings instead of cascading.
  court_id INT NOT NULL,
  venue_id INT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  player_date VARCHAR(10) NOT NULL,
  start_hour VARCHAR(5) NOT NULL,
  end_hour VARCHAR(5) NOT NULL,
  player_name VARCHAR(128) NOT NULL,
  contact VARCHAR(64),
  player_email TEXT,
  customer_account_id INT,
  channel TEXT NOT NULL DEFAULT 'online' CHECK (channel IN ('online','walkin')),
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending','paid','cancelled','expired')),
  payment_method VARCHAR(32),
  day_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  night_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(10,2) NOT NULL,
  discount_amount NUMERIC(10,2) DEFAULT 0,
  promo_code_id INT,
  membership_id BIGINT,
  series_id TEXT,
  seen_by_owner BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ,
  paymongo_session_id VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Engagement: announcements, RSVP, reviews, waitlist
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS announcements (
  id SERIAL PRIMARY KEY,
  venue_id INT NOT NULL,
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  active INT NOT NULL DEFAULT 1,
  expire_at TIMESTAMPTZ,
  photo_url VARCHAR(512),
  kind VARCHAR(16) NOT NULL DEFAULT 'announcement',
  event_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_attendance (
  id SERIAL PRIMARY KEY,
  announcement_id INT NOT NULL,
  player_name TEXT NOT NULL,
  contact TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reviews (
  id BIGSERIAL PRIMARY KEY,
  venue_id BIGINT NOT NULL,
  player_name TEXT NOT NULL,
  player_email TEXT,
  rating SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT NOT NULL,
  -- NOTE: booking_ref is BIGINT in production, but bookings.reference is
  -- VARCHAR(16). The two can never be joined as typed.
  booking_ref BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS review_replies (
  id BIGSERIAL PRIMARY KEY,
  review_id BIGINT NOT NULL,
  owner_user_id BIGINT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS waitlist (
  id BIGSERIAL PRIMARY KEY,
  venue_id BIGINT NOT NULL,
  court_id BIGINT NOT NULL,
  player_date TEXT NOT NULL,
  start_hour TEXT NOT NULL,
  end_hour TEXT NOT NULL,
  player_name TEXT NOT NULL,
  contact TEXT,
  notified BOOLEAN NOT NULL DEFAULT false,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_courts_venue ON courts(venue_id);
CREATE INDEX IF NOT EXISTS idx_rate_tiers_venue ON rate_tiers(venue_id);
CREATE INDEX IF NOT EXISTS idx_gallery_venue ON venue_gallery(venue_id);
CREATE INDEX IF NOT EXISTS idx_announcements_venue ON announcements(venue_id);
CREATE INDEX IF NOT EXISTS idx_reviews_venue_id ON reviews(venue_id);
CREATE UNIQUE INDEX IF NOT EXISTS venue_owners_user_venue_idx ON venue_owners(user_id, venue_id);

CREATE INDEX IF NOT EXISTS idx_bookings_court ON bookings(court_id);
CREATE INDEX IF NOT EXISTS idx_bookings_venue_date ON bookings(venue_id, player_date);
CREATE INDEX IF NOT EXISTS bookings_court_day_idx ON bookings(court_id, player_date);
CREATE INDEX IF NOT EXISTS bookings_hold_expiry_idx ON bookings(payment_status, expires_at);

-- The slot guarantee. A court-hour may hold at most one live booking.
-- 'cancelled' and 'expired' rows are excluded, so releasing a slot frees it.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_active_slot_unique
  ON bookings (court_id, player_date, start_hour)
  WHERE payment_status IN ('pending', 'paid');

-- DEFECT, mirrored deliberately. Production also carries an older slot index
-- whose predicate is payment_status <> 'cancelled'. That predicate still
-- covers 'expired', so a lapsed hold keeps blocking its own court and the
-- slot can never be rebooked. Superseded by bookings_active_slot_unique.
-- Dropping it in production is a write and needs the project owner's sign-off.
CREATE UNIQUE INDEX IF NOT EXISTS bookings_slot_unique_idx
  ON bookings (venue_id, court_id, player_date, start_hour, end_hour)
  WHERE payment_status <> 'cancelled';

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
--
-- Supabase grants the anon role access to public tables by default. RLS is
-- what takes it back, and with no policy attached these tables deny anon and
-- authenticated outright. The server is unaffected: it connects with the
-- service_role key, which bypasses RLS.
--
-- Stated here rather than left to the SQL editor's "Run and enable RLS"
-- prompt, so the schema is reproducible without a dialog click. Production
-- carries this on 17 of 19 tables - users and venue_owners are missing it,
-- which is tracked as F29.

ALTER TABLE public.venues            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_tiers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_gallery     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_owners      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_accounts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_attendance  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_replies    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist          ENABLE ROW LEVEL SECURITY;
