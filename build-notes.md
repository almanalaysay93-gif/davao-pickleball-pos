# Build Notes — Owner login accessibility (in progress)

## Current task
User asked: "Where's the option for the cart owner? The login option" — desktop nav had NO sign-in button. Making login clearly accessible.

## Done
1. SiteLayout.tsx: desktop Sign In button (outline, UserRound, calls startLogin) when logged out; logged in shows name + Sign Out. `const { user, logout } = useAuth();`
2. Owner.tsx gate (signed-in but not owner): improved messaging, added Sign In button.

## Remaining
- Optionally: owner self-serve claim UI in Admin panel (admin.grantOwnership(email, venueId) already exists) — earlier user expressed interest.
- Typecheck + tests (25), screenshot verify Home, checkpoint, deliver.

## Key facts
- Prior delivered checkpoint: 72f631be. Domain: davaopickpos-jrhmrcab.manus.space.
- admin.grantOwnership procedure in routers.ts takes email + venueId.
- useAuth exports: user, loading, logout, startLogin (startLogin in @/const).
- Old 08:37 esbuild BookingInput errors are stale; tsc 0 errors at 09:05.
