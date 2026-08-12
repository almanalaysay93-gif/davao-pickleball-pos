# Per-venue owner login — debug notes (Aug 12, 2026)

## Current state of implementation (all done except this bug)
- schema: ownerCredentials.venueId added + migration applied
- seeded 8 venue owner accounts (username = venue name, id 30001..30008, password Davao2026!, venueId 1..8). Global "owner" (id 1) stays venueId=NULL, password Pickleyard2026!
- auth.ts: OwnerPayload includes venueId; decodeSessionCookie returns venueId; setOwnerCookie takes venueId param
- routers.ts: ownerProcedure uses session venueId (ownsAllVenues = sessionVenueId==null && type==="owner"); fallback legacy venueOwners rows for type customer role owner. owner.myVenues returns only owned venue for scoped owners.
- ownerLogin mutation selects venueId and passes to setOwnerCookie
- UI: OwnerLayout hides System Admin tab for isGlobalOwner (venueId == null); Admin.tsx gated to global owner; OwnerLogin.tsx has venue quick-select dropdown
- Tests: 45/45 passing incl. 5 new per-venue tests (baseCtx emulated decoded user works fine)

## THE BUG (current, in progress)
Browser + curl login as CrisRon succeeds (success:true) but auth.me right after returns null.
- JWT payload decoded: {"sub":30005,"type":"owner","username":"CrisRon","venueId":null,...}
- DB row for CrisRon: venueId = 5 (correct)
- So row.venueId is being passed as null/undefined to setOwnerCookie!
- Hypothesis: mysql2 raw query returns venueId as a BigInt/number but "row.venueId ?? null" with "row.venueId ?? null" in router: `setOwnerCookie(ctx.res, row.username, row.id, row.venueId ?? null)` — if row.venueId is bigint-like or undefined in the SELECT... Actually the SELECT includes venueId column and DB returns "5" as string in tool, but mysql2 returns numbers.
- More likely: the router's getAuthPool() in the SAME dev process — the tsx restart may have used stale code when I ran curl earlier? No — curl result is fresh.
- KEY observation: setOwnerCookie called with row.venueId ?? null. The JWT shows venueId:null → row.venueId must have been null/undefined at mutation time.
- Wait: mysql2 `query` with SELECT venueId on a column just added — should work (curl login worked with venueId null).
- Possibly `row.venueId` field name casing: column named `venueId` (camel) in drizzle schema, but MySQL column name is `venueId` too (drizzle camelCase). OK.
- Actually: could be mysql2's `database URL` mismatch: the project may run on a DIFFERENT DATABASE than the one webdev_execute_sql queried! dev server DATABASE_URL env might differ. CHECK .manus env / devserver process env DATABASE_URL vs tool connection.
  - The seed script (pnpm tsx scripts/seedVenueOwners.mjs) created rows id 30001..30008 seen BOTH by webdev_execute_sql (tool) and by login (login found CrisRon username → same DB at least partially).
  - Hmm but login worked → row found → venueId should be 5.
- Another possibility: `row.venueId ?? null` — if mysql2 returns venueId as BigInt `5n`, `??` wouldn't null it. Not the issue.
- TODO: add logging to ownerLogin mutation to print row; check env DATABASE_URL of dev server process vs tool DB.

## Credentials
- Global: owner / Pickleyard2026!
- Each venue: username = venue name (Arena Athletics, Southside Davao, Matina Town Square, Paddle Up Davao, CrisRon, PickleVille, Durian Pickleball House, 929 Pickleyard), password Davao2026!

## Test run status
pnpm test: 45/45 passing.

## ROOT CAUSE FOUND & FIXED
- Express app in server/_core/index.ts never had cookie-parser middleware, so
  req.cookies was undefined → decodeSessionCookie always returned null → auth.me
  returned null after ANY login (owner AND customer sessions). Only surfaced now
  because before, the owner login was tested right after the cookie was set in
  a request context that DID parse cookies? No — actually the earlier tests
  passed via emulated ctx in vitest; browser flow was always broken.
- FIX: pnpm add cookie-parser + @types/cookie-parser; added app.use(cookieParser())
  in index.ts before tRPC middleware. Verified via curl (auth.me now returns
  CrisRon with venueId:5) and customer signup flow also works.
- Verified: myVenues returns only venue 5 for CrisRon; courtsForVenue venueId=2
  returns FORBIDDEN. Cross-venue isolation confirmed.
- Next: verify browser login renders owner portal dashboard correctly,
  remove debug console.log (done via sed), tests pass, checkpoint, deliver.
