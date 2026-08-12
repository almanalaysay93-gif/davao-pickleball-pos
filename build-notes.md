# Build Notes — Court add/remove feature (COMPLETE)

## User request
"in the admin add a option to add or remove a court"

## Done
1. server/db.ts: addCourt(venueId, courtNumber) (duplicate guard), removeCourt(courtId) (rejects if bookings.playerDate >= today YYYY-MM-DD).
2. server/routers.ts: bookings.createCourt + bookings.removeCourt (adminProcedure); owner.createCourt + owner.removeCourt (ownerProcedure, scoped via ownedVenueIds).
3. Admin.tsx: "Courts" card with AddCourtDialog (venue select + label), remove Trash2 button per court w/ confirm.
4. Owner.tsx: VenuePanel courts list with AddCourtDialog + remove buttons.
5. Tests: 28/28 passing (added 3 court add/remove tests).

## Remaining
Screenshot verified (/admin shows Courts card w/ Add court button). Next: update todo, checkpoint, deliver.
Domain: davaopickpos-jrhmrcab.manus.space. Auto-publish on.
