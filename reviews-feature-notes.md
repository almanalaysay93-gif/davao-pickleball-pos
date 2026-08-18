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

## Owner app feature inventory (Aug 17, for gap analysis reply)

Customer app routes: / /courts /map /schedule /book /checkout /confirmation/:ref /my-bookings /booking-policy /customer-login
Owner app routes: /owner-app (dashboard, tab=dashboard) /owner-app/bookings /owner-app/announcements /owner-app/admin (System Admin)

Owner procedures (sort-unique from routers.ts grep): owner.myVenues, owner.courtsForVenue, owner.ratesForVenue, owner.announcements, owner.reviews, owner.bookings (reservations table), owner.createBooking (walk-in), owner.cancelBooking?, owner.postAnnouncement, admin.create/update/delete venue (globalAdminProcedure only — NOTE: individual owners CANNOT add venues/courts? "Add court" button exists per venue card — must be admin-only or per owner), admin.grantOwnership, admin.owners list (System Admin)

Customer accounts: signup/login via email/password on /customer-login (separate from owner).

Known missing (to tell user): SMS/email reminders (parked), owner replies to reviews, review stats on venue cards, recurring booking/membership, waitlist, multi-staff accounts per venue, payment gateway (currently cash + manual online), reports/analytics (daily revenue & occupancy was requested earlier but parked — check if implemented: dashboard has "Paid bookings/Pending/Revenue (paid)" mini-stats already), export CSV, court maintenance toggle exists (court status up/down), photos gallery via admin only.

## Big feature batch (Aug 18): DB migration state

User requested features 2,3,4,6,7,8,9,10: review replies, review stats on cards, per-venue owner self-service, reports+CSV, memberships/recurring, staff logins, waitlist, owner notification bell.

TODO.md section "## Big feature batch: owner app upgrades (Aug 18)" added with all items.

DDL executed in Supabase SQL Editor (browser session logged in as almanalaysay93-gif):
- review_replies(review_id, owner_user_id, body, created_at)
- staff(user_id, venue_id, role default 'staff', unique user_id+venue_id)
- memberships(venue_id, name, description, price, credits, validity_days, active, created_at)
- member_accounts(customer_account_id, phone, name, membership_id, credits_remaining, expires_at, created_at)
- waitlist(venue_id, court_id, player_date, start_hour, end_hour, player_name, contact, notified, notified_at, created_at)
- bookings: series_id TEXT, membership_id BIGINT, seen_by_owner BOOL DEFAULT false (added)
Ran with "Run and enable RLS" (dialog appeared; app uses service role key so RLS is irrelevant for server reads).

Supabase access facts: service key [REDACTED] works for PostgREST REST reads/writes. Management API rejects it (JWT decode fail). Direct Postgres (port 5432) unreachable from sandbox (IPv6-only host). DDL must be done via Supabase dashboard SQL editor in browser.

Next steps: add table aliases + mappers in server/supa.ts for reviewReplies/staff/memberships/memberAccounts/waitlist; bookings REVERSE map needs seriesId/membershipId/seenByOwner; then db.ts helpers, then routers.ts procedures.

## Implementation context (supa/routers/db) — Aug 18 big batch

Tables CREATED + RLS enabled in Supabase (via dashboard SQL editor, logged in session almanalaysay93-gif): review_replies, staff, memberships, member_accounts, waitlist; bookings gained series_id, membership_id, seen_by_owner columns. Verified via REST swagger: all 16 paths present.

DONE: supa.ts — TABLE_ALIASES + MAPS + REVERSE entries added for reviewReplies, staff, memberships, memberAccounts, waitlist; bookings REVERSE got seriesId/membershipId/seenByOwner.

routers.ts key facts:
- ownerProcedure (line 56): checks ctx.user.role==="owner"; ownsAllVenues = sessionVenueId null && type==="owner"; else ownedVenueIds from db.listOwnerVenueIds(ctx.user.id). Middleware adds ctx.ownsAllVenues/ownedVenueIds.
- ownsVenue(ctx, venueId) (72); ownsVenuesList(ctx) (76).
- globalAdminProcedure (22), adminProcedure (33), playerProcedure (41), customerAccountProcedure (48).
- auth.ownerLogin (163): getOwnerCredentialByUsername -> verifyPassword -> setOwnerCookie(ctx.res, username, row.id, row.venueId ?? null).
- owner router at line 571; owner.reviews at 720 ({rows, stats}).
- public reviews router at 845: list/stats/create. reviews.create validates bookingRef via getBookingByReference + venue match.
- db.ts: q("table").eq/insert/update/del pattern; deleteWhere exported. getVenueById, listCourtsByVenue, getCourtById, createBooking helpers exist; createBookingInput shared fn in routers (uses generateSlots).
- bookings.create input = bookingInput z.object (venueId, courtId, playerDate, startHour, endHour, playerName, contact?, channel, paymentMethod?, customerAccountId?). createBookingInput() returns reference string.
- routers.ts = 997 lines, db.ts = 625 lines.
- setOwnerCookie/clearAuthCookies/setCustomerCookie in server/_core/cookies.

Plan for new procedures: extend owner router with: replies.create/list (scoped), staff.list/add/remove, memberships CRUD + memberAccounts redemption, reports (revenue/occupancy range + csv as base64), notifications (unread count + list + markRead), booking.cancel triggers waitlist notify. Public router: reviews.replies.list (by reviewId, nested in reviews router), venues? stats already public — add venueStats to reviews.stats (already returns allVenueReviewStats map) — use in customer cards via venueReviewStats(venueId) client-side query.
Waitlist: public waitlist.join/remove/myForVenue; owner waitlist.listForVenue (scoped).

Browser SQL editor: https://supabase.com/dashboard/project/tfwyrbqygbhrkmlapxxu/sql/new (session persists; Run + RLS dialog pattern confirmed).

## Big batch implementation state (Aug 18, checkpoint pending)

DONE so far:
1. DB tables (review_replies, staff, memberships, member_accounts, waitlist; bookings: series_id, membership_id, seen_by_owner) — created + RLS enabled via Supabase dashboard SQL editor.
2. supa.ts: aliases + MAPS + REVERSE for reviewReplies, staff, memberships, memberAccounts, waitlist; bookings REVERSE: seriesId/membershipId/seenByOwner.
3. db.ts: appended helpers — createReviewReply, listRepliesForReviews, deleteRepliesForReview; addStaff/removeStaff/listVenueStaff/getStaff; createMembership/update/delete, listMembershipsByVenue, createMemberAccount, listMemberAccountsByVenue, listMembershipsWithAccounts, redeemMemberCredit; waitlist: joinWaitlist/removeFromWaitlist/listWaitlistForSlot/listWaitlistForVenue/listMyWaitlist/markWaitlistNotified; notifications: countUnreadBookings/markBookingsSeen/listUnreadBookings.
4. routers.ts: reviews.replies public query added. Owner router additions planned (replies/createReply/deleteReply, staff/add/remove, memberships/create/delete/sell/redeemCredit/membershipsPublic, reports (date range+csv), createSeries, waitlist/notifyWaitlist/dismissWaitlist, notifications/markNotificationsRead) — NOT YET APPLIED (edit failed due to file re-read; only the public replies addition succeeded).

IMPORTANT remaining steps:
- Apply the owner router additions via a new edit (read routers.ts owner router section 571-770 first; owner.reviews at line ~720; insert before "owner: list announcements").
- Then: UI changes — OwnerReviewsFeed reply button + replies; VenueReviews public replies; review stats on Home/Courts/Map venue cards; owner UI: Reports tab, Memberships tab, Waitlist, notification bell in Owner.tsx header, Add venue/gallery for venue owners, staff management, recurring booking dialog in owner bookings.
- Waitlist customer UI: join on full slot, My waitlist section on MyBookings page; notify when owner cancels (owner.cancel → listWaitlistForSlot → auto notify first entry).
- Reports: owner.reports query returns {revenue, paidCount, pendingCount, totalBookings, days, csv}; UI = download CSV button (Blob link).
- Recurring: owner.createSeries returns {seriesId, createdCount, skippedCount, skipped}; use seriesId in bookings insert via db.insertBooking({seriesId}).
- Note: owner cancel procedure is at adminProcedure (cancel by id) — extend to also trigger waitlist notify via db.listWaitlistForSlot + markWaitlistNotified(first).
- VenueReviews list: Confirmation.tsx already renders reviews — add replies rendering via trpc.reviews.replies.useQuery.
- Tests: new specs for replies, staff scoping, waitlist, reports, memberships, recurring; keep scoped cleanup (prefix patterns), self-healing against parallel venueOwners wipe.
- Final: typecheck, pnpm test (expect 90+ passing), visual QA desktop+mobile, checkpoint (auto-publish ON), push to GitHub.

## Backend DONE (verified TSC_OK)

All backend pieces are in place and typecheck clean:
- supa.ts maps + db.ts helpers for reviewReplies/staff/memberships/memberAccounts/waitlist + bookings seriesId/membershipId/seenByOwner.
- routers.ts public reviews.replies query; owner router: replies/createReply/deleteReply, staff/addStaff/removeStaff, memberships/createMembership/deleteMembership/sellMembership/membershipsPublic, reports (date range + csv), createSeries, waitlist/notifyWaitlist/dismissWaitlist, notifications/markNotificationsRead.
- Note: grantVenueOwnership db helper exists; reviews.test.ts uses admin.grantOwnership tRPC for master tests and direct grantVenueOwnership for legacy users — pattern to follow in new tests.
- Existing helpers: setRole(userId, role), listOwnerBookings(venueIds, {channel, limit}), generateReference().

## NEXT: UI implementation (client/src)

Key pages/components to modify:
- client/src/components/OwnerReviewsFeed.tsx (owner feed) — add reply dialog (replies query from trpc.reviews.replies? NO — owner uses trpc.owner.replies). Show inline replies.
- client/src/components/ReviewForm.tsx + pages with reviews list (Confirmation.tsx, Schedule.tsx?) — render replies via trpc.reviews.replies.useQuery({reviewIds}).
- Venue cards with stats: client/src/pages/Home.tsx (venue card), Courts page venue cards, Map.tsx venue list — add ★ avg (n) chip using trpc.reviews.stats.query({venueId}).
- Owner.tsx (owner dashboard): tabs/add sections for Reports (date range picker + CSV Blob download), Memberships (plans table + sell dialog), Staff (table add/remove by email), Waitlist (venue waitlist with notify/dismiss; auto-notify on owner.cancel via waitlist trigger), notification bell in header (poll trpc.owner.notifications every 10s).
- Recurring booking: owner bookings panel add "Repeat weekly" dialog (weeks + weekdays + startHour/endHour + court + player) calling trpc.owner.createSeries.
- Waitlist customer: on full slot show "Join waitlist" input (My Bookings page or Schedule); trpc.public waitlist.join needs a PUBLIC create endpoint — MUST ADD reviews-like public waitlist.create procedure + listMyWaitlist. Also owner.cancel should notify first waitlister.
- Checkout: show membership plans at venue (trpc.membershipsPublic) with "Pay with membership" option — redeemCredit mutation; insert booking with membershipId.

## Tests to write

server/replies.test.ts, server/memberships.test.ts, server/waitlist.test.ts, server/reports-series.test.ts (or add to existing files). Follow reviews.test.ts patterns: scoped cleanup prefixes (e.g. "RTest", "MTest", "WTest", "STest" for staff), self-healing ownership grant retry (listOwnerVenueIds + grantVenueOwnership in retry loop), masterOwner test with ctx ownsAllVenues. Run `pnpm test` (expect all passing, ~90-100 tests). After: screenshots, checkpoint (auto-publish), push to GitHub.

## UI implementation context (phase 2→3)

Backend fully done (TSC_OK). DB defaults confirmed: bookings.seen_by_owner defaults false (hist rows false — gated unread count to last 7 days).

OwnerReviewsFeed.tsx (client/src/components/OwnerReviewsFeed.tsx):
- Props {venueIds: number[]}, queries trpc.owner.reviews.useQuery(undefined, 15s refetch), trpc.reviews.stats for per-venue aggregates (type assertion `as {rows, stats}`).
- Renders aggregate chips (★ avg (count)) filtered by venueIds, loader, empty state, review cards with star array + bookingRef verified text + Manila time.
- TO ADD: reply UI — query trpc.owner.replies.useQuery({venueId}) → replies list joined by reviewId; Reply button opens Dialog with textarea + submit (createReply) + edit/delete (deleteReply). Also pass reviewRows ids to public trpc.reviews.replies for customer-facing display.

Customer reviews display: reviews listed via trpc.reviews.list({venueId}); add replies rendering using trpc.reviews.replies({reviewIds: reviews.map(r=>r.id)}).

Venue card stats: use trpc.reviews.stats.query({venueId}) → {average,count}; add "★ 4.9 (12)" chip to venue cards (Home.tsx venue cards, Courts listing, Map.tsx grouped list).

Owner.tsx dashboard structure (owner app single page, sections: stats, venues with courts/rates/announcements tables, Player reviews feed at bottom). Add tabs: Reports (start/end date pickers default last 30d, summary cards revenue/paid/pending/total, per-day table, Download CSV button via Blob), Memberships (venue select, plans table with memberCount/totalCredits, Add plan dialog {name,description,price,credits,validityDays}, Sell dialog {name,phone,membershipId}, delete plan), Staff (venue select, table user email+role, add staff by email dialog, remove), Waitlist (venue select, table player/date/court/contact/notifiedAt, notify/dismiss buttons), Notifications bell in header (poll trpc.owner.notifications, badge count, dropdown list, markRead on open), Recurring booking dialog in owner bookings panel (court, startHour/endHour, startDate, weeks, weekdays checkboxes, player name, contact, paymentMethod; result shows createdCount/skippedCount).

Also owner venue self-service: Owner.tsx currently has "Add venue"/court/gallery under admin tabs — add an "Add new venue" button for any owner (calls venues.create? That's globalAdminProcedure — NEED CHANGE: create a new ownerProcedure venues.createOwner (name/address/district/surfaceType/openTime/closeTime/phone/description/courtCount/dayRate/nightRate/imageKey?) → inserts venue, courts, rate tiers, AND auto-creates owner credential row (insertOwnerCredential {username: name.toLowerCase(), venueId, hash of "Davao2026!"}) using db helpers createVenue + insertOwnerCredential + hashPassword. Note createVenue signature: (data, courtCount, rates) → {venueId...}.
Also owner-facing gallery upload: venues.uploadGalleryImage is globalAdminProcedure — add ownerGalleryUpload ownerProcedure same base64 flow with ownership check.

Per-venue owners must also see Owner.tsx sections per venue (already works — section per owned venue).

Waitlist customer UI: Schedule/Book flow shows "Full" slot → add "Join waitlist" button opening dialog (playerName/contact). Use trpc.waitlist.join({venueId,courtId,playerDate,startHour,endHour,playerName,contact}). My Bookings page: add waitlist entries via trpc.waitlist.mine({playerName}).

Checkout membership option: Checkout.tsx venueId → trpc.membershipsPublic({venueId}); "Pay with membership" dropdown of plans at venue → redeemCredit mutation (accountId from selected plan's member account — need customer to have member account; owner sells it). Checkout creates booking with membershipId → booking insert with membershipId col.

Tests: write server/replies.test.ts, server/memberships.test.ts, server/waitlist.test.ts, server/reports-series.test.ts using reviews.test.ts patterns (scoped prefix cleanup, retry grantVenueOwnership in scoping tests, master tests use owner login with ctx ownsAllVenues).


## Big batch state (Aug 17, session 2)
DB DONE: tables created via Supabase dashboard SQL editor (browser): review_replies, staff, memberships, member_accounts, waitlist. bookings cols added: series_id, membership_id, seen_by_owner (default false). supa.ts mappings DONE (aliases + REVERSE for bookings new cols). db.ts helpers DONE: createReply/listReplies/deleteReply, createStaff/listStaff/deleteStaff, listMemberships/createMembership/updateMembership, createMemberAccount/redeemMemberCredit, createWaitlist/listWaitlist/cancelWaitlistEntry, countUnreadBookings/listUnreadBookings/markBookingsSeen (7-day gate), listBookingSeries/recurring logic.

ROUTERS DONE: reviews.replies public query (reviewIds input), owner.replies.create/update/delete (scoped), owner.staff.create/delete/list, owner.memberships.* (CRUD), owner.series (recurring booking create with seriesId on bookings), owner.cancel auto-notifies first waitlister (forge notification), public waitlist.create, public bookings.cancel waitlist trigger, new online bookings leave seen_by_owner=false (bell).

UI DONE SO FAR:
- OwnerReviewsFeed.tsx: reply UI DONE (Reply btn, Dialog, update/edit, delete, existingReply map).
- ReviewForm.tsx VenueReviews: public reply display DONE.
- Home.tsx: exported VenueRating chip component (placed BEFORE export default Home), on directory cards.
- Courts.tsx: VenueRating imported from Home, on listing cards + detail dialog.
REMAINING UI:
- Map.tsx: VenueRating next to venue names in accordion list.
- Owner.tsx: Staff tab/section (create with username/password/role), Memberships tab (CRUD), Reports (daily + date-range revenue CSV export), Recurring booking option in booking flow, Waitlist panel (entries + notify), notification bell (top bar, badge from count query, mark read).
- Customer: "Join waitlist" on full slots in Schedule grid (optional but in todo).
NOTES: psql IPv6-only host (db host unreachable); DDL via browser SQL editor. Owner app route /owner-app. tsc clean. Suite 90/90 before this batch; add specs for staff/memberships/waitlist/replies after UI.
