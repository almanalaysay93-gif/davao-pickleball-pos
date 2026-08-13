# Auto owner account on venue creation — state notes

## Done
- server/routers.ts venues.create mutation now auto-inserts ownerCredentials row
  (username = input.name.toLowerCase(), password Davao2026!, venueId = created.venueId).
  Duplicate name guard in db.createVenue (LOWER(name) match) prevents double inserts;
  skipped only if an owner credential row already exists with that username.
  Returns { ...created, ownerAccount: { username, password } | null }.
- client/src/pages/Admin.tsx VenueFormDialog create.onSuccess shows toast with
  data.ownerAccount.username + password Davao2026! (server-confirmed values).
- server/bookings.test.ts: added describe "auto owner account on venue creation"
  with one test verifying ownerAccount returned, row in DB, password verifies via
  verifyPassword (imported from ./auth), and ownerLogin works.

## Remaining
1. Fix edit in bookings.test.ts: `expect(res.venueId).toBeGreaterThan(0);` — there are
   2 occurrences; only add ownerAccount assertions in the NEW test (describe starting
   near line ~1635 "auto owner account on venue creation"). Add unique context: match
   the line followed by `const courts = await db.listCourtsByVenue(res.venueId);` for
   the old one (do NOT edit) — better: use find text that includes the next line of the
   new test's res.
2. Run: pnpm vitest run server/bookings.test.ts -t "auto owner account" then pnpm test
   (expect 64/64).
3. Typecheck: npx tsc --noEmit
4. Mark todo items complete (section "Auto Owner Account on Venue Creation" lines 133-137).
5. webdev_save_checkpoint then deliver: message user — when adding a venue via
   System Admin > Manage venues > + Add venue, an owner login is auto-created:
   username = venue name (lowercase), password Davao2026!. Toast shows the credentials.
   Live URL: https://davaopickpos-jrhmrcab.manus.space/owner-login

## Key facts
- Master admin: owner / Pickleyard2026!
- Venue owner password default: Davao2026!
- Owner login page: /owner-login; System Admin tab only for master admin.
- Project: /home/ubuntu/davao-pickleball-pos
