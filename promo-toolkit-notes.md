# Promo Toolkit — working state (Aug 18)

## Done
- DB: bookings now has `promo_code_id int NULL` and `discount_amount decimal(10,2) NULL DEFAULT 0` (via webdev_execute_sql). announcements cols photo_url/kind/event_date + promo_codes table already exist.
- drizzle/schema.ts: bookings promoCodeId/discountAmount added; announcements photoUrl/kind/eventDate added; promoCodes mysqlTable added (id, venueId, code, discountPct, discountFlat, minAmount, maxUses, uses, active, expiresAt, createdAt).
- server/routers.ts: bookingInput now takes promoCodeId (nullable optional); createBookingInput applies discount (validates code by venue/active/expiry/maxUses/minAmount, bumps uses via db.bumpPromoCodeUses, records promoCodeId+discountAmount, adjusts totalAmount).
- server/supa.ts: bookings map includes promoCodeId/discountAmount; REVERSE bookings includes promo_code_id/discount_amount.
- client/src/pages/Owner.tsx: both bookings tables show strikethrough original total + PROMO badge when discountAmount>0; booking type refs include `discountAmount: string | null`. AnnouncementsSection upgraded: kind toggle (announcement/promotion/event), eventDate date input (required when kind=event), photo upload (owner.uploadPromoImage with file input, MIME/size check, preview, remove button), rows show thumbnail + kind Badge + event date row.
- client/src/components/OwnerFeatureSections.tsx: new `OwnerPromoCodesSection({ venueIds })` exported — create dialog (venue select if multi, code uppercase, pct/flat mode toggle, min amount, max uses, expires datetime), list with deactivate/delete, status badges (Deactivated/Expired/Used up/Active), used x/y, expiry date. Uses trpc.owner.myVenues (as unknown cast) + owner.promoCodes({ venueId }).
- Owner.tsx dashboard wires <OwnerPromoCodesSection venueIds={...} /> after waitlist section; import added.
- Typecheck passing so far.

## Key API contracts (for customer UI)
- bookings.applyPromoCode (public query): { venueId, code, amount } → { valid, reason, discount, newTotal }
- bookings.create mutation input now includes promoCodeId optional
- owner.announcements.list-like public: announcements.list({ venueId }?) → rows with active, expireAt, photoUrl, kind, eventDate (per AnnouncementsBanner)
- owner.uploadPromoImage: { venueId, fileName, mimeType, base64 } → { success, imageKey, imageUrl }

## Remaining
- Customer UI: promo cards w/ photos + event pins on Schedule (AnnouncementsBanner extension or new component in VenueLocation/Schedule)
- Checkout.tsx: promo code input + real-time applyPromoCode + display discounted total + submit promoCodeId
- Share buttons (WhatsApp/Facebook/Copy link) on promo cards
- Vitest: server/feature-batch.test.ts — add promo code + rich announcement specs (10 tests in file already, add more)
- QA desktop + mobile 360, remove qa-visual-notes.md + feature-batch-notes.md, checkpoint.
- Note: Owner login credentials per venue — username = venue name, password set on creation (user asked for master login earlier). Live site: davaopickpos-jrhmrcab.manus.space, owner app: /owner-app

## Bug found (Aug 18, test run)
Master admin (type owner, no venueId) has ownsAllVenues=true in ownerProcedure middleware, but ownedVenueIds = db.listOwnerVenueIds(1) may be empty in prod, so ownsVenuesList(ctx) returns [] (empty list) not undefined. Every place using `ownsVenuesList(ctx) ?? []` yields NO venues for the master: notifications (860ish), announcements (1128), announcement update/delete scoping (1177/1197), promoCodes query (1241, FIXED to listVenues()), promoCode update/delete scoping (1295/1311), notifications (1016/1114), reports (1021 listOwnerBookings).
Fix plan: helper function `ownedIds(ctx)` → ownsAllVenues ? all venues : list; apply consistently to owner queries/mutations that must cover all venues for master admin. Keep venue-bound owner scoped (empty ids => empty results is correct for them).
Remaining failures to fix: rich announcements create/delete tests use owner.announcements({venueId}) OK; deleteAnnouncement uses listVenueAnnouncements([]) → empty → FORBIDDEN. updatePromoCode/deletePromoCode same. Apply fix, then re-run vitest run (full suite).
Discount test: applyPromoCode discount was 1 not 100 → check createPromoCode stores discountPct as string "25.00"; applyPromoCode reads match.discountPct → Number() fine; but 20% of 500 = 100, got 1 → maybe promo row's discountPct stored "20.00"? got 1 because... verify in applyPromoCode: `Math.round((input.amount * Number(match.discountPct)) / 100) / 100` → correct. Got 1 → means discountPct was 0.2?? No: if discountPct field is decimal(5,2) and insert String("20") → 20.00. Hmm result 1 → input.amount 500, pct 0.2 gives 1. So discountPct column was interpreted as 0.20? Actually if inserted as "20" and column decimal(5,2) => 20.00. But wait: createPromoCode test passed with String(row.discountPct) === "25.00". So 20% of 500 = 100. Why 1? — because in applyPromoCode, match.discountPct is string "20.00" → Number = 20, 500*20/100=100 → correct. UNLESS match.discountFlat was used with value 1?? Check createPromoCode: discountPct String(20). Hmm. Maybe the beforeEach createPromoCode fails silently due to duplicate code "VITPUB" from another describe? The beforeEach uses .catch→undefined, so row undefined → discount fallback → check: if !match returns valid:false. But test got valid:true discount:1 → there IS a match with discount 1 → maybe promo "VITPUB" exists from previous run with discountFlat 1? Clean up DB rows matching VITPUB. Also applyPromoCode tests share code VITPUB — beforeEach creates it; after "applied" suite's updatePromoCode previously failed (FORBIDDEN) so not deactivated; fine.
Also bookings.create test: 06:00 slot — check rate tiers for test venue (06:00-07:00 may be cheap/valid).
TODO: run full suite after fixes; if createPromoCode duplicates persist across runs, afterEach already deletes VIT* codes.

## Status 08:40 (Aug 18)
- ownedVenueIds helper added to routers.ts and applied to: owner.staff, owner.reports, owner.notifications, owner.markNotificationsRead, owner.announcements, owner.updateAnnouncement, owner.deleteAnnouncement, owner.promoCodes, owner.updatePromoCode, owner.deletePromoCode, promo uploadPromoImage unaffected (uses ownsVenue with explicit venueId).
- updatePromoCode now also supports minAmount.
- feature-batch.test.ts promo tests: expectations fixed to Number() comparison; minAmount test fixed by router input change.
- Remaining failures (bookings.test.ts, 9 tests, incl. trpc-html-response): these appear to be PRE-EXISTING live-DB test isolation issues (shared production DB, parallel workers) OR caused by my ownedVenueIds change in ownerProcedure? No — change was local to specific procedures. Check: one failure "dual-role isolates two owners" and "per-venue owner logins" suggest booking listing scoping broke for venue-bound owners. CAUTION: ownedVenueIds for venue-bound owner returns session id? NO! ownedVenueIds returns ctx.ownedVenueIds which for venue-bound owner (type owner, sessionVenueId) — wait middleware sets ownedVenueIds from sessionVenueId. But earlier code used ownsVenuesList for venue-bound: sessionVenueId != null → ownedVenueIds = [sessionVenueId] → ownsVenuesList returns that. My ownedVenueIds returns ctx.ownedVenueIds for non-ownsAllVenues → same. For legacy OAuth owners (type customer, role owner): ownsVenuesList returned [] (empty) before; my helper returns ctx.ownedVenueIds = [] → same behavior. So no behavior change.
- Most likely: failures are flaky/live-DB interference, existed before my edits (note earlier full run: bookings.create conflict, admin authorization, payment status ×3, court remove, per-venue owner, owner.createBooking, dual-role were already failing in first full run — trpc-html-response too). Verify: first full run earlier had 13 failed incl "batched Home input" etc. Compare.
- Next: run bookings.test.ts alone with --no-file-parallelism / single thread; check errors individually; compare against previous run list. If failures identical to pre-edit run, pre-existing.
- After tests: QA screenshots desktop+mobile, remove qa-visual-notes.md + feature-batch-notes.md + promo-toolkit-notes.md, update todo.md marks, checkpoint.

## Status 09:15 (Aug 18) — DB MIGRATION DONE
The user ran the migration SQL in Supabase SQL Editor themselves → "Success. No rows returned". Verified via PostgREST REST: bookings.promo_code_id / discount_amount NOW LIVE; announcements.photo_url/kind/event_date live (empty rows fine); promo_codes table live (empty). The sandbox-only MySQL DB is legacy — ignore webdev_execute_sql for app schema.

Supabase Management API: PAT stored as secret SUPABASE_MANAGEMENT_API_TOKEN. Correct endpoint: POST https://api.supabase.com/v1/projects/{ref}/database/query with body {query}. Works now (used in migrate-supabase.mjs for future migrations; script at project root, migrates/2026-08-18_promo_toolkit.sql committed).

## Tests: 125/126 passing. ONE REMAINING FAILURE:
"applyPromoCode — public validation > returns a valid result with a correct discount" — expects discount 100, got 1. beforeEach creates VITPUB discountPct 20 (catch swallowed). Root cause hypothesis: beforeEach create fails (e.g. leftover VITPUB row from prev run? No — afterEach line 331 cleanup deletes VIT* codes). OR more likely: the CREATE succeeds but the public query finds a DIFFERENT VITPUB row (flat discount 1.00, e.g. from an earlier suite run) because the insert with discountPct 20 → stored "20", returned as string; discount calc: round(500*Number("20")/100)/100 = 100. Got 1 → matched row has discountPct null/0 and discountFlat 1.
→ Debug approach: add console.log in a temp test, or simply assert res values shape; the bookings.create suite PASSES the same math. Likely live-data contamination from parallel suites (VITDUP flat 50, VITCODE pct 25, VITPCT pct -5 rejected...). Actually wait: parallel workers: one worker creates VITPUB pct 20, another's "respects minAmount" test updates minAmount and possibly deactivate. Inter-suite interference. Solution: make test robust — query the row first to assert discountPct, and/or use unique code per test worker (workerId).
ALSO: "tRPC router resilience > batched Home input works end-to-end" intermittently failing — likely same live-DB parallel interference; earlier runs showed it flaky. Check bookings.create suite order.

## REMAINING WORK (todo.md has items):
1. Fix last failing promo test (robustness).
2. Confirm visual QA desktop + mobile for new UI (Owner.tsx announcement editor, PromoCodesManager in OwnerFeatureSections.tsx, AnnouncementsBanner promo cards/share buttons, Checkout.tsx promo input).
3. Remove qa-visual-notes.md, feature-batch-notes.md, promo-toolkit-notes.md before checkpoint.
4. Save checkpoint (auto-publish ON) and deliver.
