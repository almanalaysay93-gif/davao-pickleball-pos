# Visual QA notes (owner dashboard, 2026-08-18)

Signed in as "929 Pickleyard" / Davao2026! — all new sections render correctly:
- Notification bell in header: shows count badge "44" → "9+", dropdown "New bookings / All caught up" works.
- Player reviews, Team & staff, Reports (date inputs + summary cards), Membership packages, Slot waitlist sections all present.
- Reservations bar now shows "New walk-in booking" and "Recurring booking" buttons.
- Reports section: date inputs visible; note the labels "From"/"To" render without visible values in markdown but inputs show 2026-08-01 → 2026-08-18 in element list.

Pending QA: Schedule waitlist dialog on booked slot, recurring booking dialog, add staff dialog OTP toast, reports CSV download.

## ROOT CAUSE FOUND (02:45 UTC)
- Live Supabase bookings for venue 8 on 2099-12-31: 44 rows, ALL payment_status='cancelled' → grid correctly shows Open. Earlier MySQL QA insert (QA-WL-1) went to wrong DB and is irrelevant.
- The availability/booking pipeline is healthy. To QA waitlist: book via the API with owner cookie on a fresh date, or just rely on tests.

## 2026-08-18 02:40 UTC status

- QA booking inserted via SQL: reference QA-WL-1, venue 8, court 1, 2026-08-18, 09:00-10:00, paid. BUT grid reload still shows "Open" at 9AM court 1 — the availability query may map via court table differently OR bookings insert went to the MySQL schema not PostgREST. Verify via API: curl "http://localhost:3000/api/trpc/availability.forVenueDate?batch=1" with {"0":{"json":{"venueId":8,"playerDate":"2026-08-18"}}} to confirm booked slots.
- Owner login works: username "929 Pickleyard", password "Davao2026!". All 8 new sections render on /owner-app. Bell dropdown works ("New bookings / All caught up" — the "9+" was from old bookings query count, dropdown shows recent 10).
- Schedule page: waitlist copy updated; grid still all open so waitlist dialog not triggered yet; need to confirm booking visibility or use venue with real bookings.
- Next: run pnpm test (should include server/*.test.ts; new test files for waitlist/reviews/memberships already exist per earlier session? Check ls server/*.test.ts: auth.logout, bookings, reviews, trpc-html-response, venues.gallery, venues.image). Need to add test coverage for new features per todo.

## 2026-08-18 02:50 UTC QA STATUS

QA booking created via API: owner.createBooking venue 8, court id 570266 (Court 1), 2026-08-19, 09:00-10:00, paid cash 300 → reference DV-PB-S4KK. Availability API now shows Court 1 occupied ['09:00'] on 2026-08-19. Owner login cookie at /tmp/owner_cookie.txt (user "929 Pickleyard", pw Davao2026!).

IMPORTANT: the Schedule page ignores the `date` query param — it opened Aug 18 (today) despite date=2026-08-19 in URL. Need to click "Next day" to reach Aug 19 to test the waitlist dialog on the 09:00 booked slot.

Remaining QA plan: 1) tap next-day to Aug 19, tap booked 9AM slot → Join Waitlist dialog appears, submit name+contact → success toast + row in owner dashboard waitlist section. 2) Test OwnerSeriesDialog (Recurring booking button) via owner dashboard still logged in browser? (browser cookie for owner lost after navigation to customer site — re-login at /owner-login). 3) Add staff dialog + OTP toast. 4) Reports CSV. Then: run pnpm test (add vitest specs for new features if missing: server/*.test.ts currently auth.logout, bookings, reviews, trpc-html-response, venues.gallery, venues.image — need spec for waitlist/reports/memberships/staff), then checkpoint + push.

Note: diag script /home/ubuntu/davao-pickleball-pos/diag-bookings.mjs and qa scripts /home/ubuntu/qa_book.sh, /home/ubuntu/qa-visual-notes.md are temporary; delete diag files before checkpoint (do NOT commit them — check .gitignore and remove before saving).

## 2026-08-18 02:46 UTC — Join waitlist QA: PASS

Tapped booked Court 1 09:00 slot on Aug 19 → "Join the waitlist" dialog with name + phone fields. Submitted "Manus QA Tester / 09179999999" → toast "You're #1 on the waitlist — we'll reach out when this slot opens up". Next: verify owner dashboard waitlist section shows the entry, then QA remaining owner features.

## 2026-08-18 02:47 UTC — Owner dashboard QA: 2 bugs found

Waitlist section works perfectly: "Manus QA Tester | 929 Pickleyard Court 1 | 2026-08-19 09:00–10:00 | Notify" row rendered. Notifications bell shows count badge. Bookings section shows DV-PB-S4KK Paid ₱300.

Bugs: (1) Rate tiers render as "12:undefined AM – 12:undefined AM ₱0.00/hr" — tier startHour/endHour undefined in the mapped row, likely MAPS.rateTiers mapping issue (pricePerHour.toFixed on "0" string?) OR the rateTiers table uses null start/end for all-day. Need to inspect rate_tiers rows + MAPS. (2) Owner bookings table shows "Court 570266" (raw id) instead of court number. Fix: join court number into owner.bookings list (add courtNumber to db.listOwnerBookings or similar).

Also to check: reports revenue shows 0 while paid bookings=1 and revenue card shows ₱300 → the per-day summary table says "No bookings in this range"; maybe range defaults fine but table query differs. Verify reports API.

## 2026-08-18 02:52 UTC — Reports API verified working (venueId=8 → revenue 300, paid 1, CSV ok). Dashboard default To date = today (8/18) so no rows shown for 8/19 booking — that's expected. But note: the OwnerFeatureSections Reports section should perhaps default To=today AND show "paid bookings 1" card inconsistency? The top revenue card shows 300 but reports section shows 0 — different queries. Acceptable? Investigate after fixing the two hard bugs: (1) rate tiers "12:undefined AM", (2) bookings table "Court 570266".

## 2026-08-18 02:49 UTC — Rate tiers: NOT a bug (transient loading state rendered "12:undefined" briefly, then "daytime 6:00 AM – 6:00 PM ₱300.00/hr" correct). Add a loading placeholder to RateRow to hide transient undefined.

REAL remaining bug: bookings table row shows "Court 570266" instead of court number. Fix: in Owner.tsx bookings section (OwnerBookingsSection, the table rendering booking.courtId) map courtId → court number. Options: (a) owner.bookings db helper join courts table for court_number; (b) local lookup from myVenues courts list (OwnerBookingsSection has access to venues list? check props).

## 2026-08-18 03:05 UTC — Progress on fixes

Done:
- db.listCourtsByIds added (server/db.ts ~line 162).
- owner.bookings now returns { booking, venue, courtNumber } (routers.ts line ~683-689: joined courts via listCourtsByIds).
- Owner.tsx bookings table line ~279: now maps ({ booking, venue, courtNumber }) and renders {courtNumber ?? `#${booking.courtId}`}.
- OwnerFeatureSections.tsx bell dropdown row: renders {(b as any).courtNumber ?? b.courtId} (need to also add courtNumber to owner.notifications row shape — procedure at routers.ts:1004 uses db.listUnreadBookings(ids, 20); enrich db.listUnreadBookings with court_number via listCourtsByIds + Map, or leave fallback as is).

Remaining:
1. Optionally enrich db.listUnreadBookings (server/db.ts near line ~430?) with courtNumber so bell shows proper court name.
2. Add loading placeholder in RateRow (Owner.tsx:1145 RateRow) to avoid transient "12:undefined" while rates.all loads.
3. Run npx tsc, pnpm test.
4. Clean up temp files (diag-bookings.mjs if exists, check git status), add vitest specs for new features (replies/staff/waitlist/reports/memberships) if time.
5. Checkpoint (auto-publish enabled) and report to user.

QA verified working: Join Waitlist end-to-end (toast + owner dashboard waitlist row + API owner.waitlist); notifications bell count badge; bookings table Paid status; reports API with venueId.

## 2026-08-18 02:58 UTC — test file debug

AppUser type (server/auth.ts): { id: number; type: SessionType; identity: string; name?; email?; role: "owner" | "customer"; venueId? }. SessionType is "owner" | "customer" (not "staff", not "admin"). role is only "owner"|"customer" — my test staffCtx used role "staff" which breaks AppUser; ownerProcedure checks ctx.user.role !== "owner" → FORBIDDEN (but I got "No procedure found" because role:"staff" not assignable, TS allowed at runtime? Actually createCaller bypasses input validation... the "No procedure found" came from path casing: I called caller.owner.staff.addStaff but router nesting is under owner.staff — check if it's owner.staff or staff under owner... reviews.test's adminCtx works: type 'owner', role 'owner'.

Fixes needed in server/feature-batch.test.ts:
1. Remove `deleteOwnerCredentialByUsername` from imports (typo; only deleteOwnerCredentialsByPattern exists).
2. staffCtx role must be "customer" with different type — use type "customer", role "customer" for a plain customer; ownerProcedure denies → FORBIDDEN.
3. adminCtx: type "owner", role "owner" (OK).
4. venueOwnerCtx: reviews.test uses legacyOwnerCtx = { type: "customer", role: "owner", id, identity: email } — keep that.
5. reports({venueId: 999999}) for master admin does NOT throw — admin owns all venues? No: ownsVenue checks venue exists then id in list; check ownsVenue impl — likely returns true only if venue exists AND in ids; 999999 not in ids → FORBIDDEN. But resolved 0 — maybe adminCtx venueIds list includes 999999? No. Check ownsVenue code. Test resolved successfully → maybe ownsVenue returns true when ownsAllVenues? (master can't own a nonexistent venue). Actually listVenueStaff returns [] for bad venue id. Need to check reports: it filters rows by ownsVenue but doesn't throw for bad venue id — so the test expectation is wrong; fix test to assert it returns zero data instead, or drop that test.
6. membershipsPublic is under public router? It's at server/routers.ts inside owner router? path "membershipsPublic" not found — it's under owner.membershipsPublic? earlier grep showed "membershipsPublic: publicProcedure" at line ~897 inside the owner router. Fix caller path.
7. reviews router: replies.list is under "reviews.replies" (I used caller.reviews.replies — but error said No procedure found? That failure also had "No procedure found on path"?) — recheck: first failures include "public replies.list requires review ids array" failed — earlier first-run error was for reviews list; check.
8. upsertUser duplicate key: beforeEach runs per test and inserts same openId → move user creation inside the single test and clean up in afterEach via deleteUserByOpenId("vit-staff-waitlist").
9. waitlist.join with playerName "" — zod min(1) → throws. But all 16 failed; maybe createCaller with adminCtx but procedure under top-level "waitlist"? Path: caller.waitlist.join — exists at line 1097. Verify exact router nesting.

Other key shapes (verified):
- ownerProcedure checks ctx.user.role !== "owner" (FORBIDDEN).
- ownerProcedure also checks sessionVenueId; ownsAllVenues = venueId null && type === "owner".
- addStaff returns { success, userId, provisioned, oneTimePassword?, username? }.
- reports returns { revenue, paidCount, pendingCount, totalBookings, days[], csv string }.
- createSeries weekdays 0-6, startDate field (NOT playerDate), returns { seriesId, createdCount, skippedCount, skipped[] }.
- owner.notifications({ venueId? }) returns { count, rows[] with courtNumber now }.
- staff query: owner.staff({ venueId? }) returns rows with userId field (listVenueStaff enriched).
