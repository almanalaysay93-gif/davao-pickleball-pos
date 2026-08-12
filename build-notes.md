# Build Status Notes (internal)

## Done
- DB schema (venues, courts, rateTiers, bookings) migrated + seeded: 8 venues, 56 courts, 16 rate tiers
- Seed script: scripts/seed.mjs (re-runnable)
- Server: db.ts helpers, routers.ts (venues/courts/rates/availability/bookings), shared/rates.ts (day/night split pricing)
- Client: index.css premium theme (green/gold, Fraunces+Inter), SiteLayout, App.tsx routes, BookingContext
- Pages: Home (hero + venue grid, OK), Courts (skeletons show in screenshot — data loads async, OK), Schedule (filters + empty grid OK), Book (form OK), Checkout, Confirmation, Admin

## Screenshots review (round 1)
- Home: hero good, venue grid shows skeletons in screenshot (loading state) — data does load per dev preview, fine
- Courts: skeleton grid captured mid-load
- Schedule: empty placeholder "Select a venue" — venue select shows "Select venue" (venues loaded after filter card). Select should default to first venue (state init races venues load). FIX: default venueId when venues arrive.
- Book: OK
- Admin: loading spinner captured mid-auth-check, fine

## Fixes TODO
- [ ] Schedule: auto-default to first venue once venues load (useEffect when venues fetched and venueId null)
- [ ] Courts: confirm cards render (they did — screenshot caught skeleton, likely fine)
- [ ] Verify booking flow end-to-end via test
- [ ] Vitest for bookings procedures (conflict detection, tier splitting)
- [ ] Style review / final screenshots

## Delivery checklist
- Checkpoint, then deliver manus-webdev://{version_id}
- Remind user: admin requires signed-in user with role=admin (owner auto-promoted); publish via Publish button
