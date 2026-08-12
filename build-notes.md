# Build Notes — Dual-Role Login (in progress)

## Current task
Add Player login (my bookings, search by phone/name, cancel) + Owner login (own venues, courts status, rate tiers edit, bookings mark-paid/cancel, scoped to owned venues) + admin.grantOwnership to assign venues to owner accounts by email.

## Done
- Schema: role enum ["user","admin","player","owner"] (default player); venueOwners table (userId, venueId). Migration applied.
- db.ts: getUserByEmail, grantVenueOwnership(+setRole "owner"), listOwnerVenueIds, listOwnerVenues, listOwnerBookings(ownedVenueIds,input), getCourtById, listVenuesByIds, updateRateTier, listPlayerBookings.
- routers.ts: bookings.myBookings (playerProcedure + identifier), bookings.cancelMine, owner.* (myVenues, courtsForVenue, ratesForVenue, updateRateTier, setCourtStatus, bookings, markPaid, cancel) with ownerProcedure RBAC; admin.grantOwnership.
- findConflictingBooking NOW REQUIRES venueId as first arg (just updated in db.ts). Callers in routers.ts lines ~147 and ~214 still need updating → TS errors: `server/routers.ts(147,33): Expected 5-6 args got 4`, `(214,69)`.
  - Line ~147: `db.findConflictingBooking(input.courtId, input.playerDate, input.startHour, input.endHour)` → prepend input.venueId
  - Line ~214: `db.findConflictingBooking(courtId, playerDate, startHour, endHour, id)` → prepend venueId
- Frontend: SiteLayout nav (Owner link role=owner, My Bookings signed-in), routes /my-bookings and /owner registered.
- client/src/pages/MyBookings.tsx DONE (player portal: search, cards, cancel dialog; uses any casts).
- client/src/pages/Owner.tsx DONE (owner dashboard: stats, venues w/ courts toggle + rate edit dialog, reservations table mark-paid/cancel; any casts on data).

## Still to do
1. Fix both findConflictingBooking call sites in server/routers.ts (add venueId arg).
2. pnpm check && pnpm test (tests: 17+3 RBAC; conflict test deletes rows on 2026-12-25 before first create; cleaned via execute_sql previously; tests clean up venueOwners in finally).
3. Screenshot-verify pages.
4. Update todo.md items, checkpoint, deliver.

## Key facts
- Project: /home/ubuntu/davao-pickleball-pos. Palette: deep green + gold, cream bg, Fraunces + Inter fonts.
- Rate tiers: daytime/nighttime, 6:00 PM boundary (shared/rates.ts: formatHour, formatPHP, priceSlot, generateSlots).
- Booking reference format DV-PB-[A-Z0-9]+. 8 venues seeded.
- Admin grants owner status: admin.grantOwnership({venueId,email}) — user must have signed in once (getUserByEmail finds them).
- Admin page: /admin (role admin); Owner: /owner; Player: /my-bookings (search identifier = contact or player name).
