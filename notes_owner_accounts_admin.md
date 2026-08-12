# Master Admin Owner Accounts feature — state (Aug 13, 2026)

User request: "add a login option for me so i can have full control of the owners account"

## Plan
Phase 1 DONE — backend in server/routers.ts admin router:
- admin.ownerAccounts (query) → { accounts: [{id, username, venueId, createdAt}], venues }
- admin.createOwnerAccount (username min8-128 pw, venueId nullish; reserved "owner"; duplicate check; venue exists check)
- admin.setOwnerAccountPassword (id, password min8)
- admin.setOwnerAccountVenue (id, venueId nullish; master "owner" cannot be bound)
- admin.deleteOwnerAccount (id; master "owner" cannot be deleted)
All gated by adminProcedure (ctx.user role===owner; venueId==null only = global owner allowed via System Admin tab gating on OwnerLayout).

Fix applied: db.listAllVenues -> db.listVenues (tsc now 0 errors).

## Phase 2 TODO (UI in client/src/pages/Admin.tsx)
Add "Owner Accounts" card component after <OwnershipCard /> in AdminDashboard (line ~229: <CourtStatusCard /><OwnershipCard />). New function `OwnerAccountsCard()`:
- trpc.admin.ownerAccounts.useQuery, trpc.admin.{createOwnerAccount,setOwnerAccountPassword,setOwnerAccountVenue,deleteOwnerAccount}.useMutation with utils.admin.ownerAccounts.invalidate on success.
- Table columns: Username, Venue (map venueId to name; null=GLOBAL/master), Created; Actions: "Change password" dialog (2 inputs: new pw + confirm, min 8), "Set venue" select, delete with confirm.
- "Create owner account" dialog: username, password, confirm, venue select (null = global).
- Icons: KeyRound (already imported), Plus, Trash2.
- Copy-username affordance nice-to-have (show password once in toast after create).

## Phase 3: tests + checkpoint
- Add vitest cases to server/bookings.test.ts (or new server/ownerAccounts.test.ts) using baseCtx helpers: owner (venue null) can list/create/change venue/delete; venue-bound owner denied 403; delete master forbidden; create duplicate username conflict.
- pnpm test (currently 45/45), npx tsc --noEmit, screenshot admin page, webdev_save_checkpoint, deliver.

## Key facts
- Master admin login: https://davaopickpos-jrhmrcab.manus.space/owner-login → username "owner" / password Pickleyard2026!
- Venue owner logins: username = venue name, password Davao2026! (8 venues: Arena Athletics, Southside Davao, Matina Town Square, Paddle Up Davao, CrisRon, PickleVille, Durian Pickleball House, 929 Pickleyard; venueIds: need SELECT from DB — arena athletics = 5? CrisRon venueId 5 in earlier JWT? Actually earlier curl: CrisRon -> venueId 5. Verify: query venues + ownerCredentials.)
- System Admin tab only visible for global owners (isGlobalOwner check: venueId == null) — Admin.tsx already gates.
- OwnerLayout hides System Admin for venue-bound owners.
- Admin.tsx structure: AdminDashboard returns stats cards, bookings table card, <CourtStatusCard />, <OwnershipCard />. OwnershipCard uses trpc.admin.owners; AddCourtDialog pattern for dialogs.
- ownerCredentials DB table columns: id, username (unique), passwordHash, createdAt, venueId (nullable int).
