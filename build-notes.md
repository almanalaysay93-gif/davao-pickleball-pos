# Build Notes — Two-App Split (customer + owner)

## User request
"split this into 2 apps: 1st for customers booking, 2nd for business owners" — user chose option 2: one project, two fully separated app shells. Customer app on main domain; owner app on /owner-app.

## Status (Phase 4, pre-checkpoint)
- CustomerLayout.tsx + OwnerLayout.tsx created; App.tsx split into CustomerApp/OwnerApp w/ redirects /owner → /owner-app, /admin → /owner-app/admin.
- Owner.tsx: route-aware (Dashboard / /owner-app/bookings / /owner-app/announcements); admin role allowed through gate.
- tsc clean, 28/28 tests pass.
- Screenshots: customer home OK (no owner/admin links). Owner shell renders nav (Dashboard/Bookings/Announcements/System Admin) but content = infinite spinner on /owner-app and /owner-app/bookings for admin user.

## Remaining bug to fix
Owner() gate checks user.role !== "owner" && !== "admin" — passes for admin. But OwnerDashboard() uses trpc.owner.myVenues — ADMIN role may get 0 venues → "No venues assigned" card, NOT spinner. Spinner suggests page stuck loading OR gate path changed. Likely cause: Owner.tsx now renders OwnerDashboard only when venues loaded... Actually spinner is venues.isLoading=true forever? Check trpc.owner.myVenues fails silently (role !== owner?) — ownerProcedure allows owner only! ADMIN cannot call owner.myVenues → error state maybe rendered as spinner by ErrorBoundary? Check OwnerDashboard usage; also need to handle ownerProcedure for admins OR gate admin → redirect to /owner-app/admin.
- SIMPLEST FIX: in Owner(), if role === "admin" redirect to /owner-app/admin (admin should manage via admin page anyway).

## Remaining issue (2nd screenshot pass)
/owner-app and /owner-app/bookings still show spinner for admin user. Cause: my redirect `if (user.role === "admin" && String(location) === "/owner-app")` only matches the dashboard route, and admin hits owner.myVenues query (ownerProcedure blocks admin?) → isLoading stuck? Actually ownerProcedure only requires owner — admin blocked → query errors, but venues.isLoading false; bookings section same. The spinner may be the ErrorBoundary catching unhandled query error silently (no error UI in OwnerDashboard render path for query error). FIX: make gate route-level — in App.tsx, for /owner-app/* routes, when user is admin AND path not /owner-app/admin → redirect; better: in Owner.tsx, if role === "admin" and path != /owner-app/admin, show card "Use System Admin console" with button → /owner-app/admin instead of redirect; also for role owner on /owner-app/bookings|announcements those work. For admin on /owner-app/bookings|announcements redirect to admin too.
Simpler robust fix: add in Owner() an `if (user.role !== "owner" && user.role !== "admin")` gate already exists, then:
- role admin && !isAdminRoute → render card w/ link to /owner-app/admin (no redirect loops).

## Key facts
- Domain davaopickpos-jrhmrcab.manus.space, auto-publish on. Prior checkpoint 959dcffb.
- Test user is admin role (id 1).
