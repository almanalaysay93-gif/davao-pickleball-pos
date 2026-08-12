# Build Notes — Two Independent Apps Rebuild (state)

## User request
Remove Manus OAuth. Two independent apps: Customer app (guest booking + optional email/password accounts + payment in booking flow) and Owner app (fixed password login).
Owner credentials (deliver to user): https://davaopickpos-jrhmrcab.manus.space/owner-login — username: owner / password: Pickleyard2026!

## COMPLETED
1. DB: customerAccounts + ownerCredentials tables (applied); bookings.customerAccountId (migration 0005 applied). seed-owner.mjs seeded owner row.
2. server/auth.ts: AppUser {id,type:'owner'|'customer',identity,name?,email?,role:'owner'|'customer'}; cookies ownerSession/customerSession; bcrypt + JWT.
3. server/_core/context.ts: decodeSessionCookie first; Manus OAuth fallback mapped to owner/customer.
4. server/routers.ts: adminProcedure/customerAccountProcedure→protectedProcedure; ownerProcedure now async-enriches ownsAllVenues (type==='owner') + ownedVenueIds (db.listOwnerVenueIds) — IMPORTANT: ownerProcedure IS async now.
5. auth router: ownerLogin/ownerLogout (cookie-based, fixed password), signup + customerLogin (bcrypt on customer_accounts), logout clears both cookies. getAuthPool() in routers.ts.
6. bookings.create passes customerAccountId + paymentMethod; paymentStatus='paid' when paymentMethod set.
7. main.tsx: removed OAuth redirect + header block. typecheck passes.
8. CustomerLogin.tsx (/customer-login, sign in + sign up tabs). OwnerLogin.tsx (/owner-login).
9. App.tsx: routes wired; /owner-login outside shells.
10. CustomerLayout: Sign In → /customer-login; Sign Out via trpc.auth.logout; My Bookings always visible; identity display.
11. OwnerLayout: Sign In → /owner-login; Sign Out via trpc.auth.ownerLogout; isOwner = user.type==='owner'||user.role==='owner'.
12. MyBookings.tsx rewritten: signed-in customer → bookings.myAccountBookings (auto); guests → identifier search; cancel via bookings.cancelMine.
13. Owner.tsx: gate uses user.type!=='owner' → /owner-login card; removed navigate guard.
14. Admin.tsx: gate requires type==='owner'||role==='owner', links /owner-login.
15. bookings.test.ts: context builders fixed to AppUser shape (adminCtx role owner; playerCtx type customer/role customer; ownerCtx no-arg, type owner/role owner).

## VERIFIED (screenshots)
- /customer-login: sign-in/create-account tabs, guest link, footer quick links — renders correctly.
- /owner-login: owner sign-in card with username/password — renders correctly.
- /my-bookings (signed in customer): account bookings + guest search — renders correctly. (Note: browser has a real customer session logged in as almanalaysay93@gmail.com — that's why My Bookings + courts shows signed-in state; /courts was still loading skeletons in screenshot, expected fine.)
- /courts: loading skeletons visible; /book renders with the booking form; sign-in state persists via cookie.
- All 28 tests pass; pnpm check clean.

## REMAINING
A. Fix failing tests (26/28 pass, 2 fail):
   - Test "denies owner-scoped actions when no venues are owned" line ~437: ownerCtx() now has type='owner' so ownsAllVenues=true → myVenues returns ALL venues instead of []. FIX: make a legacy-scope context: { id, type:'customer', role:'owner', identity:'legacy-owner' } — but then ownerProcedure requires role==='owner' ✓. So ownerCtxForTestLegacy = baseCtx({id, type:'customer', identity:`owner-${id}`, role:'owner'}).
   - Other failing test: likely "isolates two owners" (line ~370): uses upsertUser + grantOwnership + owner-scoped callers. Since ownerProcedure enforces role==='owner' and grantOwnership only writes venueOwners (no user role change), callers with role from upsertUser (role 'user'?) are FORBIDDEN now. FIX: construct owner caller contexts with role:'owner', type:'customer' to stay legacy-scoped (ownsAllVenues=false, ownedVenueIds from DB via... wait, enrichment reads ctx.user.id → must equal seeded user id). Approach: baseCtx({...user, type:'customer', identity:user.email, role:'owner'}).
   - Also inline playerCtx at line ~354 and ~514 use role:'player' → must become role:'customer'.
   - Non-admin user test line ~330: role:'user' → role:'customer' (still blocked since adminProcedure requires role==='owner').
   - ownerCtx("owner-no-venues@example.com") call at 437 must drop arg.
B. Update build notes/remaining list as fixed.
C. Run pnpm test → all pass; pnpm check; screenshots /, /customer-login, /owner-login, /owner-app, /my-bookings; checkpoint; deliver with owner credentials.

## Key facts
- AppUser: { id, type, identity, name?, email?, role } role 'owner'|'customer'.
- Owner ctx for legacy scoping: { id, type:'customer', identity:string, role:'owner' } → ownsAllVenues=false, ownedVenueIds from db.listOwnerVenueIds(id).
- ownerProcedure middleware is async ({ ctx, next }) => {... return next({ ctx:{...ctx, ownsAllVenues, ownedVenueIds} }); }.
- dev server: tsx watch; .manus-logs/devserver.log (stale 14:34 errors are old).
- Domain davaopickpos-jrhmrcab.manus.space auto-publish on checkpoint.
- Owner portal routes: /owner-app (dashboard), /owner-app/bookings, /owner-app/announcements, /owner-app/admin.
- Customer routes: /, /courts, /schedule, /book, /checkout, /confirmation/:ref, /my-bookings, /customer-login.
- Admin panel (System Admin, /owner-app/admin): grantOwnership by email (requires user exists in users table via upsertUser/OAuth sign-in) + owners list — legacy but still works for existing data.
