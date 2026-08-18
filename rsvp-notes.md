# RSVP + Confirmation follow-up notes (Aug 19)

## Capability decision
The built-in `notifyOwner` (server/_core/notification.ts) only pushes to the project owner, NOT to customers. No built-in email/SMS service found in Manus forge API or API Hub for end users (search confirmed none). So:

- **Confirmation "email/SMS"**: implement as in-app/web notification delivery via the Manus notification service directed at the venue owner is wrong — instead: record confirmations in the DB, deliver via the booking receipt page + a shareable "your booking" confirmation link with full receipt (incl. discount line). SMS/Email real delivery requires an external provider (Twilio/Resend) + user API keys — offer as option, default = rich shareable confirmation. Best practical: add `email` and `sendConfirmation` via notifyOwner is owner-only; so I'll build:
  1. Booking receipt page already shows discount line (verify/extend Confirmation page).
  2. New `bookings.confirmationUrl` public query → generates shareable deep link with all booking details + discount line → "Send to myself" share buttons (WhatsApp/Facebook/Copy) on the receipt.
  3. Owner portal notifications (existing notification bell) already fire on new booking; extend content to include the discount line so owner sees savings applied.
- **Event RSVP**: `event_attendance` table (announcement_id, player_name, contact optional, created_at, unique per announcement+player_name); public join/leave/count + owner attendees list + count badges in Owner announcements rows and customer event cards.

## Schema plan (Supabase Postgres, via Management API SQL; supa.ts mapping: camelCase↔snake_case)
- `event_attendance` (id, announcement_id, player_name, contact, created_at)
- announcements already has kind='event'; promo_codes table exists.

## Key files
- server/db.ts: add eventAttendance helpers (create/list/count/toggle/delete); existing db helper patterns use supa client via supa.ts
- server/supa.ts: TABLE_ALIASES + column maps for event_attendance
- server/routers.ts: events router (public): join/leave/attendance/list; bookings.confirmation payload already has discount (verify)
- client/src/components/AnnouncementsBanner.tsx: add RSVP button on event cards
- client/src/pages/Owner.tsx: event rows show "N coming" count; attendee dialog
- Confirmation page (client/src/pages/Confirmation.tsx): add discount line + share confirmation
- Tests: server/rsvp.test.ts (join, toggle off, count, owner attendees list, scoping)

## Env/deployment
Auto-publish ON; checkpoint = publish. Vitest fileParallelism: false (shared live Supabase DB). Test adminCtx: {user: {id:1,type:'owner',role:'owner',venueId:null}}.

## Schema findings (verified live)
- bookings columns: `contact` (phone), `player_name`, `customer_email` does NOT exist; no email column on bookings. customer_accounts HAS email.
- So for email confirmations: send to customer_account email when linked, else skip (graceful). Add `player_email` optional to bookingInput? Simpler: optional email field on booking form (stores in new `player_email` column? no — avoid schema churn; add column `player_email` nullable to bookings via Management API SQL).
- Resend key is send-only restricted (domains list = 401); validated via real send to onboarding@resend.dev ✓. From address must be verified domain — use onboarding@resend.dev for now (allowed pre-verified on free tier).
- RSVP: need `event_attendance` table — create via Management API SQL.
- supa.ts: bookings reverse map line ~49, column map ~140; announcements map at 146 (kind, event_date exist).
- createBookingInput (routers.ts ~123) inserts + applies promo; bookings.create (line ~532) returns {reference}; owner.createBooking ~842.
- Hook point for email: after db.insertBooking success in createBookingInput or in each caller. createBookingInput returns reference string; callers can't inject async hook easily → add email sending in createBookingInput after insert (fire-and-forget with catch log).

## Current state (23:15)
- Schema DONE & verified live (200): `bookings.player_email` TEXT nullable; `event_attendance` (id SERIAL PK, announcement_id, player_name, contact, created_at TIMESTAMPTZ).
- Migration scripts were run by USER via Supabase SQL Editor (both RSVP/Email migration = "Success. No rows returned"). Management API token still 403; DO NOT ask for tokens again unless needed.
- Resend key validated OK (send-only key; from=onboarding@resend.dev works; tested to onboarding@resend.dev). Env: RESEND_API_KEY set.
- Schema facts: bookings has contact (phone), player_name, NO email col before → player_email added now. customer_accounts has email.

## Implementation plan (from here)
1. supa.ts: add eventAttendance table alias ("event_attendance"), MAPS row map (id, announcementId, playerName, contact, createdAt), REVERSE map. bookings MAPS add playerEmail, REVERSE add playerEmail→player_email.
2. db.ts: add RSVP helpers + email helper.
3. server/resend.ts (new): sendBookingConfirmationEmail — from onboarding@resend.dev, to player_email, HTML receipt incl discount line; fire-and-forget from createBookingInput; never throw.
4. routers.ts: bookingInput add playerEmail z.string().email().optional(); createBookingInput passes player_email through; after insert: fire sendBookingConfirmationEmail if playerEmail || (customerAccountId → look up account email). Add `events` public router: join/leave/attendance (count + my join) scoped by announcement venue. Owner: announcements list should show attendance count — extend owner.announcements list response with attendance counts.
5. UI: Booking form (Checkout.tsx) add optional Email field; Confirmation page add share buttons + discount line display + "email sent" note. AnnouncementsBanner/AnnouncementsList: event cards get "I'm coming" button + count (polling 15s). Owner: AnnouncementsSection rows show "N coming" + attendee dialog.
6. Tests: rsvp.test.ts (join/toggle/count/scoping/owner list) + resend.test.ts exists (email key validation — keep). Cleanup migrate files from repo after done.
7. Vitest config runs files sequentially (fileParallelism false) due to shared live DB.

## Progress log (23:20)
- DONE: supa.ts (eventAttendance alias+maps, bookings playerEmail in MAPS/REVERSE), db.ts (toggleAttendance/listAttendanceByAnnouncementIds + Row import), resend.ts module (sendBookingConfirmation fire-and-forget, FROM onboarding@resend.dev, HTML receipt w/ discount line).
- DONE: routers.ts — bookingInput.playerEmail (email z.optional); createBookingInput passes playerEmail + fires sendBookingConfirmation (playerEmail > customer account email) with venueName/courtLabel/discountAmount; events router added: toggleRsvp (public; validates ann.kind==="event" && active via db.getAnnouncementById — NEEDS db helper!) + attendance query.
- TODO: add db.getAnnouncementById helper; owner.announcements.list enrich with attendance counts + listAttendance owner endpoint (view attendees per announcement); UI: Checkout.tsx email field, Confirmation shareable receipt w/ discount line, AnnouncementsBanner event "I'm coming" button+count (poll), Owner AnnouncementsSection "N coming" badge + attendee dialog.
- Reminder: BookingRow interface in db.ts lacks playerEmail field — extend BookingRow { playerEmail?: string|null } to avoid tsc error.
- tsc currently fails on getAnnouncementById missing.
- Vitest sequential files. Existing test files: resend.test.ts (key ok), supabase-token.test.ts (PAT still 403 — can delete after done or leave). feature-batch.test.ts has promo tests.
- Repo has migrate-supabase.mjs at /tmp/migrate-supabase.mjs? No — deleted from repo at checkpoint 2b44706; migration SQL in migrations/2026-08-19_rsvp_email.sql; migrate-rsvp.mjs at repo root (delete before checkpoint).

## Progress log (23:21)
Backend COMPLETE: db helpers (toggleAttendance, listAttendanceByAnnouncementIds, getAnnouncementById, BookingRow.playerEmail), routers (bookingInput.playerEmail + confirmation email firing in createBookingInput; events.toggleRsvp + events.attendance public; owner.announcements enriched w/ rsvpCount/recentAttendees/attendees; owner.announcementAttendees). Typecheck clean (tsc 0 errors; stale vite console pre-transform error is old).

UI so far: AnnouncementsBanner.tsx — event cards now have "N coming" chip + "I'm coming"/"You're coming" toggle button (prompt for name first time, saved in localStorage rsvp-player-name, polls 15s). Owner.tsx AnnouncementsSection — event rows show "N coming" button opening Dialog listing attendees (name + contact).

STILL TODO (UI): Checkout.tsx — add optional Email field to booking form + Confirmation page shows discount line + shareable receipt card (WhatsApp/Facebook/Copy). Then tests: rsvp.test.ts (toggle on/off, count, event-only validation, owner attendee scoping). Then vitest full run, screenshots (schedule page event card w/ RSVP; owner announcements rows; checkout w/ email field; mobile 375), todo.md mark complete, remove migrate-rsvp.mjs from repo, checkpoint + deliver.

## Progress log (23:22)
Owner UI done: RSVP count chip + attendee dialog in Owner.tsx AnnouncementsSection. Confirmation.tsx done: promo discount line in receipt + ShareButtons (WhatsApp/Facebook/Copy) — typecheck clean.

Book.tsx: form state playerName/contact at lines 42-43; submit at 126-151 sets draft (needs playerEmail added); player name input around line 212; summary Row at 350. Draft shape in client/src/contexts/BookingContext.tsx:21 (playerName: string|null; add playerEmail). Quote input has playerName "_". Checkout.tsx submit() passes contact; need to add playerEmail param there too (backend already accepts playerEmail on bookingInput).

Backend already: bookings.create sends confirmation email via server/resend.ts (sendBookingConfirmation) when playerEmail provided.

REMAINING:
1. Book.tsx + BookingContext: add playerEmail field (optional), wire into draft + Checkout submit.
2. Tests: rsvp.test.ts in server/ (toggle join+leave, count, owner announcementAttendees scoping).
3. Vitest full run; screenshots (schedule event card RSVP, owner announcements, checkout email field, confirmation share buttons; mobile 375).
4. todo.md mark items; rm migrate-rsvp.mjs; checkpoint+deliver.

## Progress log (23:25) — KEY FACTS (do not lose)
Client done: BookingContext playerEmail; Book.tsx email field; Checkout.tsx playerEmail passthrough + summary row + promo toast mention; Confirmation.tsx discount line + ShareButtons (WhatsApp/Facebook/Copy). Typecheck clean on client.

TEST FACTS (rsvp.test.ts):
- createAnnouncement input: { venueId, title, message (NOT body), expireAt, photoUrl, kind default "announcement", eventDate }; returns {success:true}
- events.toggleRsvp returns { joined, count } (NOT attending)
- events.attendance input: { announcementIds: number[] } returns map id→rows
- owner.announcementAttendees({announcementId}) — returns rows for that id
- owner.announcements enriched rows have rsvpCount (by announcement id)
- db helpers added at tail of server/db.ts use `supa` which is NOT imported in db.ts → TS errors TS2304. FIX: import supa in db.ts (it already imports * from supa.ts? No — check existing db.ts imports: feature-batch uses helpers from db.ts; existing deletes use e.g. `deletePromoCode`. Find how existing delete helpers delete rows and mirror them.)
- bookings.create returns { reference } + bookings.get returns { booking: {..., playerEmail} }

NEXT: fix db.ts import (or use existing delete pattern from db.ts), run rsvp test, then full suite, screenshots, todo, checkpoint.
