-- Promo toolkit schema: rich announcements + promo codes + booking discounts
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS promo_code_id int;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS discount_amount decimal(10,2) DEFAULT 0;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS kind text DEFAULT 'announcement';
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS event_date text;

CREATE TABLE IF NOT EXISTS promo_codes (
  id bigserial PRIMARY KEY,
  venue_id bigint NOT NULL,
  code varchar(32) NOT NULL UNIQUE,
  discount_pct decimal(6,2),
  discount_flat decimal(10,2),
  min_amount decimal(10,2),
  max_uses int,
  uses int NOT NULL DEFAULT 0,
  active smallint NOT NULL DEFAULT 1,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
