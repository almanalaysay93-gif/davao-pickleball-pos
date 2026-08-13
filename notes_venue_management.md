# Venue Management Task — State Notes

## Task
User wants "option to add more areas and courts" → Master admin (global "owner" session) can
create/edit/delete entire venues (areas) with courts + rate tiers from System Admin console.

## Backend DONE
- server/db.ts: createVenue(data, initialCourts, rates[]), updateVenue(venueId, data), deleteVenue(venueId)
  - createVenue: dedupe by LOWER(name); creates courts "Court 1..N"; default rate tier if none given
  - deleteVenue: blocks if upcoming bookings (playerDate >= today, pending/paid); deletes leaf→root
    (rateTiers, announcements, venueOwners, courts, bookings, ownerCredentials rows, then venue)
  - updateVenue: dedupe check on name, sql`${venues.id} <> ${venueId}`
- server/routers.ts: venues.create / venues.update / venues.delete added to existing `venues` router (line ~238), all globalAdminProcedure. Note: duplicate `venues:` router was merged (removed) — routers.ts compiles clean (tsc 0 errors).
- venues.create input: name, address, district?, surfaceType (indoor/outdoor/covered, default indoor),
  openTime/closeTime (HH:MM), phone?, description?, courtCount (1-20), dayRate?, nightRate?
  - If dayRate+nightRate both given → daytime tier openTime→18:00 and nighttime 18:00→closeTime; else single all-day tier.

## UI TODO (Phase 2)
- client/src/pages/Admin.tsx: add a "Manage venues" card in admin router (~line 40-70 area, System Admin /owner-app/admin)
  - Card with list of all venues (use trpc.venues.list.useQuery), buttons: Edit, Delete per venue + "Add venue" button
  - AddVenueDialog: form fields above; use trpc.venues.create.mutate; onSuccess invalidate queries
  - EditVenueDialog: prefill, trpc.venues.update.mutate
  - Delete confirmation: trpc.venues.delete.mutate with toast
- Reference existing patterns: OwnershipCard / OwnerAccountsCard components already in Admin.tsx;
  WalkInDialog uses shadcn Dialog (import from "@/components/ui/dialog"), Select, Input, Label, Button, toast from "sonner".
- globalAdminProcedure guard: user.type === "owner" && venueId null (master); venue owners get FORBIDDEN.

## Tests TODO
- Append to server/bookings.test.ts: venues.create/update/delete via appRouter (use master ctx helper);
  guest/venue-owner denial (FORBIDDEN); duplicate name; delete blocked by upcoming booking; venue login row cleanup on delete.
- Test ctx helper: masterCtx() — type owner, venueId null; venueCtx(venueId) type owner venueId set.

## Deliver TODO
- Mark todo.md items [x]: backend, UI, vitest, typecheck/checkpoint/deliver.
- Checkpoint then message user: new "Manage venues" panel in System Admin; how to add area (name, address,
  district, hours, # courts, day/night rates); edit/delete; auto owner login row created? (NOTE: currently
  deleteVenue removes ownerCredentials but createVenue does NOT create one — mention master can create an
  owner login for new venue from Owner login accounts panel).

## Existing info
- Master admin: username "owner" / password Pickleyard2026! at /owner-login → System Admin tab.
- Venue owner accounts: 8 seeded, username = venue name, password Davao2026!.
- Site live: https://davaopickpos-jrhmrcab.manus.space (auto-publish on checkpoint).
- Latest checkpoint before this task: 7ffb6cc5 (45/45 tests).

## Status (latest)
- Backend DONE, UI DONE (ManageVenuesCard + VenueFormDialog in Admin.tsx, mounted at line ~229).
- Tests: 6 new venue management specs; 61/61 passing in full suite (pnpm test 105s). rates.all test adjusted to tolerate single-tier test venues.
- Login mutation: trpc.auth.ownerLogin ({username, password}) — works on /api/trpc/auth.ownerLogin; cookie ownerSession set; auth.me returns type owner, venueId null (master).
- Browser on /owner-login: form prefilled "owner" but password field masked — need to submit password "Pickleyard2026!" and check /owner-app/admin shows Manage venues card.
- Remaining: verify card in browser, mark todo.md [x], checkpoint, deliver to user.
- Deliver message points: System Admin → Manage venues card; Add venue (name, address, district, surface, hours, # courts 1-20, day rate + optional night rate split at 18:00); Edit per venue; Delete (blocked if upcoming/paid bookings; removes courts/rates/announcements/bookings/owner login).
