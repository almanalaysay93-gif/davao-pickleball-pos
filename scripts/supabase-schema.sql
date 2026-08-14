-- Supabase (Postgres) schema for Davao Pickleball POS.
-- Mirrors the Manus MySQL drizzle schema (camelCase) as Postgres snake_case tables.

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

CREATE TABLE IF NOT EXISTS venue_gallery (
  id SERIAL PRIMARY KEY,
  venue_id INT NOT NULL,
  image_key TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  reference VARCHAR(16) NOT NULL UNIQUE,
  court_id INT NOT NULL,
  venue_id INT NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  player_date VARCHAR(10) NOT NULL,
  start_hour VARCHAR(5) NOT NULL,
  end_hour VARCHAR(5) NOT NULL,
  player_name VARCHAR(128) NOT NULL,
  contact VARCHAR(64),
  customer_account_id INT,
  channel TEXT NOT NULL DEFAULT 'online' CHECK (channel IN ('online','walkin')),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending','paid','cancelled')),
  payment_method VARCHAR(32),
  day_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  night_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
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

CREATE TABLE IF NOT EXISTS announcements (
  id SERIAL PRIMARY KEY,
  venue_id INT NOT NULL,
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  active INT NOT NULL DEFAULT 1,
  expire_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes matching query patterns
CREATE INDEX IF NOT EXISTS idx_courts_venue ON courts(venue_id);
CREATE INDEX IF NOT EXISTS idx_rate_tiers_venue ON rate_tiers(venue_id);
CREATE INDEX IF NOT EXISTS idx_bookings_court ON bookings(court_id);
CREATE INDEX IF NOT EXISTS idx_bookings_venue_date ON bookings(venue_id, player_date);
CREATE INDEX IF NOT EXISTS idx_gallery_venue ON venue_gallery(venue_id);
CREATE INDEX IF NOT EXISTS idx_announcements_venue ON announcements(venue_id);
