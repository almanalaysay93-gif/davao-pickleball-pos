# Live venue reviews feature — progress notes (Aug 17 2026)

User request: add a live feed of reviews for each venue in the blank space on the owner dashboard.

## Todo.md section
"## Live venue reviews (Aug 17 2026)" — 7 items (table, db helpers, tRPC, customer review form, owner live feed, rating display on customer cards, test/checkpoint).

## DB state
- webdev_execute_sql routes to TiDB (Manus DB) — NOT our app DB. Ignore that; our app uses user's Supabase via REST (server/supa.ts: SUPABASE_URL env, SUPABASE_SERVICE_ROLE_KEY env).
- Supabase credentials from earlier session: URL https://tfwyrbqygbhrkmlapxxu.supabase.co, service key = SUPABASE_SERVICE_ROLE_KEY env (value [REDACTED] per user message earlier).
- In Supabase SQL Editor (browser, logged in): DDL injected via monaco API (Ctrl+Enter ran it):
  CREATE TABLE reviews (id BIGSERIAL PRIMARY KEY, venue_id BIGINT NOT NULL, player_name TEXT NOT NULL, player_email TEXT, rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5), comment TEXT NOT NULL, booking_ref BIGINT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
  CREATE INDEX idx_reviews_venue_id ON reviews (venue_id);
- TODO next: verify table created in Supabase (run supa.from("reviews").select("id") via npx tsx script), then build backend+UI.

## Backend plan
- server/db.ts: createReview(data), listVenueReviews(venueId), venueReviewStats(venueId) (avg, count).
- server/supa.ts "reviews" table mapped automatically if column-map covers snake_case → camelCase (check MAPS constant; reviews uses snake keys already in DB; our SupaQuery maps snake_case DB names to camelCase? — actually db.ts passes snake_case directly; MAPS converts camelCase param keys to snake).
- server/routers.ts: reviews.createProcedure (public, z.object {venueId, playerName, playerEmail?, rating 1-5, comment, bookingRef?}), reviews.listByVenue (venueId), reviews.stats (venueId), reviews.forOwner (protected ownerProcedure; returns reviews for owner's venues).
- Owner feed polling every 10s via useQuery refetchInterval.

## UI plan
- Customer: MyBookings page — after a completed/past booking, show "Leave a review" form (stars + comment). Venue rating stars + count on customer venue cards (Home + Courts + Schedule).
- Owner dashboard: "Recent reviews" card in blank space of owner main page (client/src/pages/OwnerHome or similar), average rating header, live feed w/ timestamps.

## Key paths
- Owner dashboard page: client/src/pages/*Owner*.tsx (check App.tsx /owner route)
- server/db.ts helpers pattern: q("ownerCredentials")...
- supa client: import { createClient } from "@supabase/supabase-js" for ad-hoc verification scripts (tmp-*.mts, DO NOT commit).

## Status
- [x] reviews table DDL executed in Supabase SQL editor via Supabase dashboard (Run without RLS; consistent with all other tables accessed server-side only)
- [x] Verified via tmp-verify-reviews.mts: error=null, table exists, empty rows.
- [x] supa.ts: added "reviews" table alias, MAPS review mapper (camelCase), REVERSE map entry.
- [x] db.ts: ReviewRow interface + helpers: createReview, listVenueReviews, listAllReviews, listReviewsForVenues, venueReviewStats, allVenueReviewStats, deleteReviewsByVenue, deleteReviewsAll; deleteVenue cascade deletes reviews.
- [x] routers.ts: reviews router added after announcements router (lines ~810-858): reviews.list (public, optional venueId), reviews.stats (public), reviews.create (public, validates venue + bookingRef belongs to venue, stores bookingRef id).
- [x] owner.reviews procedure added (ownerProcedure, optional venueId input, returns {rows, stats}) in routers.ts.
- [x] client/src/components/OwnerReviewsFeed.tsx created: live feed card w/ aggregate stats chips, refetchInterval 15s, star avatars, verified booking label. Types cast via select:(data:any).
- [x] Wired into client/src/pages/Owner.tsx: <OwnerReviewsFeed venueIds={venuesList.map(v=>v.id)} /> added after "Your venues" panels (before reservations card); import added.
- [x] client/src/components/ReviewForm.tsx created: StarPicker, ReviewForm (name/rating/comment/optional bookingRef), VenueReviews read-only list w/ verified badge.
- [x] DONE: ReviewForm + VenueReviews added to Confirmation.tsx (below receipt/map, max-w-md, passes venueId + bookingRef) (below receipt, inside max-w-md card area; only when booking exists — pass booking.ref and venueId from data.booking). Consider also on Schedule/Book pages — at minimum Confirmation page.
- [ ] Vitest: add reviews tests to server/bookings.test.ts (create/list/stats + deleteVenue cascade). Remove tmp-verify-reviews.mts and tmp-list-owners.mts before checkpoint.
- [ ] Final: pnpm test, tsc, screenshot owner portal + confirmation page, checkpoint, push github, deliver.

## Final state (Aug 17, ~10:10 AM)
- [x] Confirmation.tsx wired with VenueReviews + ReviewForm (venueId from data.venue.id, bookingRef = reference).
- [x] server/reviews.test.ts added (9 tests, all pass; matches actual API: reviews.create returns {success:true}; reviews.stats() returns map; stats only computed when ids.length===1; owner.reviews venueId filter now scoped to owned venues via ownsVenue()).
- [x] db.ts deleteVenuesByNamePattern now cascades reviews.
- [x] 90/90 tests pass (vitest run twice clean; earlier failures were tsx-watch stale + flaky timeouts).
- [x] tsc clean.
- [x] Dev server restarted (procedures were 404 until restart — tsx watch hadn't picked up routers.ts edits). owner.reviews now returns FORBIDDEN (correct, unauthenticated).
- [x] Owner dashboard screenshot verified: "Player reviews" section renders below Your Venues cards, before Reservations table.
- [x] Sample review row inserted in Supabase (id 104, venue_id 2 Arena Athletics, player "Sample Player") for UI verification — REMOVE BEFORE CHECKPOINT (delete via supa client, service key [REDACTED], url https://tfwyrbqygbhrkmlapxxu.supabase.co).
- [ ] Remove seed review row id 104.
- [ ] Update todo.md items to [x], save checkpoint (auto-publishes), push to github, deliver.
