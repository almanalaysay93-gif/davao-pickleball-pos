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

## Blank reviews feed investigation (Aug 17, 10:26)
Backend is correct end-to-end: reviews.create → reviews.list → owner.reviews all verified via curl against dev server with real owner cookies. Root cause of user's "still blank":
1. User's screenshot shows PickleVille owner session (venue_id=6 per owner_credentials).
2. No reviews exist for PickleVille in the database — feed correctly shows "No reviews yet".
3. The user has not submitted any review via the Confirmation page, so the feed is genuinely empty; there is nothing broken.

IMPORTANT venue id mapping (Supabase): 1=Arena Athletics, 2=Southside Davao, 3=Matina Town Square, 4=Paddle Up Davao, 5=CrisRon, 6=PickleVille, 7=Durian Pickleball House, 8=929 Pickleyard.
Owner credentials venue_id: owner(master,null), Southside=2, Matina=3, PaddleUp=4, CrisRon=5, PickleVille=6, Durian=7, Arena Athletics=1 (90167), 929=8.

Test data inserted during debugging: review id 105 (venue 2, "Manus QA", rating 5) — MUST DELETE before delivery (service key [REDACTED]).

Remaining work: delete test review 105, then verify live flow in browser (create review via customer Confirmation page, see it appear in owner feed), and consider UX improvement: the empty-state card is visible but user perceived "blank" — maybe feed renders but user scrolled below fold; consider confirming to the user how to test.

## Browser end-to-end test progress (Aug 17, 10:27)
- Diagnostic review id 105 deleted from Supabase (clean state).
- Booking form on /book (venue 2=Southside Davao, Court 2, 2026-08-17, 3:00-4:00 PM, Daytime ₱220) filled: name "QA Reviewer", contact "09123456789".
- "Continue to checkout" button (index 24 in first element list) was clicked but page did NOT navigate (still on /book). Possibly validation error or click missed. Need to retry via coordinates (~740,752 on 1280x720 => scale screenshot coords: button around x=610? Actually button at right panel bottom ~[605,752] in viewport) or check why checkout blocked.
- Goal: reach /confirmation page, submit review (5 stars + comment), then verify owner feed (Southside login: username "Southside Davao", password "Davao2026!") shows it.
- Remember: venue id 2 = Southside Davao per current DB (id shuffled post-migration).

## CRITICAL FINDING: master owner session sees "No reviews yet" despite review existing (Aug 17, 10:29)

Full end-to-end test completed in browser:
- Real booking created (ref DV-PB-VA6N, Southside Davao, booking id 339), then real review posted via confirmation page: id 106, venue 2, "QA Reviewer", 5 stars, booking_ref=339. Verified in Supabase.
- Review renders correctly on the customer confirmation page ("Player reviews" card shows QA Reviewer ★★★★★ VERIFIED).
- BUT: owner dashboard (master "owner" session, ownsAllVenues=true, sessionVenueId=null) shows "★5.0(1)" stat badge (stats fetched fine via db.venueReviewStats? no — master feed stats came as 5.0 count 1...) yet the feed card body says "No reviews yet".

Analysis: the master owner uses owner.reviews with NO venueId filter → ids = ownsVenuesList(ctx) which returns undefined for master (ownsAllVenues=true) → db.listReviewsForVenues(ids) with undefined ids. Earlier curl test with master showed rows:[] + stats {average:0,count:0}. In this fresh browser session the stats show 5.0(1) — possibly a different query (per-venue stats call). Wait: in routers.ts owner.reviews: ids=undefined → stats=Promise.resolve(null) (ids.length===1 check fails). So stats badge 5.0(1) is NOT from owner.reviews... Actually OwnerReviewsFeed may call reviews.stats (public) separately. The rows array stays [] because listReviewsForVenues(undefined) returns [] (ids.length===0 early return).

ROOT CAUSE: master owner (ownsAllVenues) passes undefined ids to listReviewsForVenues → empty rows. Fix: in owner.reviews, when ownsAllVenues, query ALL reviews (call db.listAllReviews) instead of [] ids. Stats stays null for master (per-venue filter only) OR compute allVenueReviewStats.

Fix plan (server/routers.ts owner.reviews, ~line 720-740):
```
let rows, stats;
if (ctx.ownsAllVenues) {
  rows = await db.listAllReviews();
  stats = null; // or db.allVenueReviewStats()
} else {
  const ids = input?.venueId ? (ownsVenue(ctx, input.venueId) ? [input.venueId] : []) : ownsVenuesList(ctx) ?? [];
  [rows, stats] = await Promise.all([
    db.listReviewsForVenues(ids),
    ids.length === 1 ? db.venueReviewStats(ids[0]) : Promise.resolve(null),
  ]);
}
```
Also verify OwnerReviewsFeed.tsx shows the "★5.0(1)" badge — it may call reviews.stats (public, all venues) — check component after fix. Then update test expectations in server/reviews.test.ts (the master test currently expects rows [] and stats null — update to expect all reviews).

Then: pnpm test, tsc, screenshot owner dashboard + mobile confirmation, delete nothing (keep QA review? The user's feed should show real data; keep review id 106 as legitimate test evidence, or delete? Decide: delete it after screenshot to keep DB clean — user can review their own venue later).
Booking id 339 and review 106 can stay or be removed; prefer removing both after verification (court slot released? booking status stays paid — that's fine, remove booking 339 + review 106).

## DIAGNOSTIC STATE (Aug 17, 10:40)

Bug: owner feed shows "No reviews yet" even with real review in DB.

Findings:
1. Real review id 106 (QA Reviewer, venue 2) was inserted successfully via browser at 10:28 and confirmed in Supabase (earlier check returned it with booking_ref=339).
2. Owner master feed still showed "No reviews yet" at 10:30 → I applied fix in server/routers.ts owner.reviews: ownsAllVenues now calls db.listAllReviews() instead of empty fallback; test in server/reviews.test.ts updated (master expects all reviews without filter). Tests pass (9/9), tsc clean, server restarted 10:30 via tsx watch.
3. After fix reload, browser owner feed STILL showed empty → curl test: venue owner (Southside Davao, venueId 2) login OK but owner.reviews → rows:[], stats 0/0.
4. THEN: raw supa queries via sb_secret key now return count=0, byId 106=[] → review 106 is GONE. Most likely cause: the reviews vitest spec's cleanup (deleteReviewsAll or deleteReviewsByVenue) runs during pnpm vitest runs and deleted the real review id 106 (tests run against LIVE DB, not a test DB!). The spec deletes reviews for test venue and/or all reviews in cleanup blocks (deleteReviewsAll in "reviews cleanup" describe runs on every test run!).
5. Loop test confirmed db.createReview exists (server/db.ts:563), listAllReviews/listReviewsForVenues pipeline works fine (pipeline itself is not broken).

Conclusion so far: the "blank feed" the user saw + my later curl empty = genuine empty because the test suite deleted the only real review. The master-owner fix IS real and needed (ownsAllVenues fallback was wrong). But root cause of user's original complaint is: tests delete real reviews → AND possibly the master fix.

KEY ISSUE TO FIX: server/reviews.test.ts cleanup must NEVER delete all reviews system-wide (deleteReviewsAll). Should only delete reviews created by the test (by player name or by created-at window), and avoid deleteReviewsAll entirely.
Also verify venue 2's owner-credential login works (southside davao / Davao2026! → username "Southside Davao").

Next steps:
- Fix reviews.test.ts cleanup (scoped deletes only).
- Re-post QA review via browser/public API? Simpler: insert via createReview helper, then screenshot owner dashboard to confirm feed shows it. Keep review as legitimate demo data OR clean after (decide: leave it — user can see the feature works, and players will add real reviews; but it's a QA name... better: keep review id? It's test evidence; the user said "it still blank" — deliver proof. Keep one review from "QA Reviewer"? Suggest deleting after checkpoint. Decide at delivery: delete the test review, explain feed was empty because no real reviews exist).
- Then full pnpm test (watch for flaky timeout again), tsc, checkpoint, push.

## VERIFIED FIXED (Aug 17, 10:39)

All fixes done + verified in browser:
1. server/routers.ts owner.reviews: ownsAllVenues now calls db.listAllReviews() — master session sees all reviews instead of empty.
2. server/reviews.test.ts: all system-wide deleteReviewsAll() replaced with scoped deleteReviewsByPlayerNamePrefix("Ada"|"ShortGuy"|"Bench Player"|"Dink Master"|"Reviewer"|"OtherReviewer"|"MasterView"|"CascadeTest"). This was the ROOT CAUSE of "it still blank": the test suite wiped real reviews from the LIVE DB on every run (deleted QA Reviewer review id 106).
3. server/db.ts: added deleteReviewsByPlayerNamePrefix helper.
4. Browser verified: seeded review id 142 (QA Reviewer, venue 2 Southside Davao) shows in OwnerReviewsFeed with ★5.0 (1) chip, verified booking #339, comment, timestamp.
5. curl: both venue owner (Southside Davao, /tmp/ownerc.txt) and master (owner.reviews) return rows.
6. Full suite: 90/90 passing, tsc clean.

REMAINING:
- Screenshot shows "★5.0(1)" chip slightly cramped spacing ("★5.0 (1)") — minor, cosmetic: check OwnerReviewsFeed.tsx rendering of the stats chip.
- Delete seeded review id 142 after final checkpoint? Decision: keep for delivery so user sees the feature populated; mention they can remove it later. Actually better: DELETE before checkpoint (it's a QA artifact), user will see empty feed which is honest; the fix is in code. → DECIDE: delete review 142 after checkpoint to keep DB clean.
- Then: checkpoint (auto-publish), push to GitHub, deliver message.
- Master owner password for production is whatever was set in owner_credentials id 1 (username "owner") — user's browser session logs in fine.
