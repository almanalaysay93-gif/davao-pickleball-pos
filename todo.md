# Davao Pickleball POS — Project TODO

## Data & Backend
- [x] Design DB schema: venues, courts, rateTiers (day/night), bookings, products/items
- [x] Run migration via webdev_execute_sql
- [x] Add query helpers in server/db.ts
- [x] tRPC procedures: venues list, court availability, bookings CRUD, admin status updates
- [x] Seed all 8 venues with exact names, addresses, court counts, hours, and day/night rates
- [x] Vitest coverage for core procedures

## Frontend — Elegant Premium Design
- [x] Global theme: premium palette, Google fonts, refined index.css
- [x] App shell: top nav + route structure
- [x] Home/landing page with premium hero and venue highlights

## Features
- [x] Court Directory page: all 8 venues with address, court count, hours, day/night rates
- [x] Real-time hourly availability grid per court per venue (current day)
- [x] Interactive schedule/calendar view with date browsing, venue & time-slot filters
- [x] Booking/reservation form: venue, court, date, time slot, player name, contact
- [x] POS checkout flow: itemized summary, day vs night rate calculation, total, payment confirmation
- [x] Admin booking dashboard: all reservations, mark occupied/available, cancel/modify
- [x] Walk-in transaction support from POS interface
- [x] Receipt/confirmation screen with booking reference number, venue, court, slot, amount

## Polish & QA
- [x] Booking reference number on every confirmation/receipt
- [x] Loading/empty/error states everywhere
- [x] Responsive design (desktop + mobile)
- [x] Typecheck + tests pass
- [x] Screenshot verification of all pages
- [x] Checkpoint + deliver

## Gap Fixes
- [x] Add live refresh for availability grid (polling every 15s so grids reflect current bookings)
- [x] Replace render-time setState in Schedule with useEffect
- [x] Fix Admin ModifyDialog to fetch the booking's venue/rate tiers and enable time edits
- [x] Walk-in creation: navigate to receipt screen after payment
- [x] Add explicit query error UIs across pages

## Dual-Role Login System
- [x] Schema: add role enum values (player/owner), venue_owners table linking owners to venues
- [x] Migration applied via webdev_execute_sql
- [x] DB helpers: getOwnerVenues, owner procedures for CRUD on owned venues/courts/bookings
- [x] tRPC: ownerProcedure RBAC, player booking procedures (myBookings, cancel own booking)
- [x] Login/sign-in UI flow distinguishing player vs owner (sign in once, role determined by DB; owner gate via owned venues)
- [x] Player portal page: My Bookings (view, cancel)
- [x] Owner portal page: manage owned venues, courts, status, reservations, walk-in creation
- [x] Nav integration: My Bookings + Owner Dashboard entries shown by role
- [x] Vitest coverage for RBAC (owner-only access, cross-owner isolation, player can't access owner data)
- [x] Screenshots verified, checkpoint, deliver

## Dual-Role Gaps to Close
- [x] Add owner-side walk-in booking flow (reuse Admin WalkInDialog pattern) on Owner portal
- [x] Strengthen RBAC tests: signed-in player denied owner routes, two-owner isolation
- [x] Role-aware sign-in UX/messaging on Owner page (keep owner gate messaging)
- [x] Screenshot verification + checkpoint + deliver

## Owner Booking + Announcements
- [x] announcements table in schema (venueId, title, message, active flag, expiry) + migration applied
- [x] owner can book courts: grant role access and hook owner portal into the same booking/checkout flow
- [x] owner.announcements router: create/list/update/delete scoped to owned venues
- [x] public announcements router for player-facing display
- [x] Announcements management section in Owner portal (create/edit, set expiry, toggle active)
- [x] Announcement banners visible to players: Home, Courts, Schedule, Book pages (scoped per venue + active ones)
- [x] Vitest coverage for announcements RBAC + owner booking
- [x] Screenshots verified, checkpoint, deliver

## Owner Login Accessibility
- [x] Desktop nav: visible Sign In button (previously only in mobile menu)
- [x] Signed-in users: show profile/greeting with Sign Out in nav
- [x] Owner self-service: on /owner gate page, clear claim option with Sign In button
- [x] My Bookings + Owner links discoverable pre-sign-in via Sign In landing info
- [x] Admin "Venue owners" panel: grant ownership by email + owners list (admin.admin.grantOwnership + admin.owners)
- [x] Typecheck + tests pass (25/25), checkpoint, deliver

## Court Add/Remove Management
- [x] DB helpers: addCourt(venueId, courtNumber) and removeCourt(courtId)
- [x] Admin procedures: bookings.createCourt / bookings.removeCourt (adminProcedure), with upcoming-booking guard
- [x] Owner procedures: owner.createCourt / owner.removeCourt scoped to owned venues
- [x] Admin dashboard: "Courts" card (add court dialog, remove court button per court, status toggle)
- [x] Owner portal: same court management for owned venues
- [x] Vitest coverage for add/remove RBAC + booking conflict guard (28/28 passing)
- [x] Typecheck + tests pass, checkpoint, deliver

## Two-App Split (Customer + Owner)
- [x] Audit current routes/layouts/links across all pages and shared layout
- [x] Customer app: dedicated shell on main domain (Home, Courts, Schedule, Book, My Bookings, Confirmation) with customer-only nav; owner/admin links removed from customer nav
- [x] Owner app: separate shell at /owner-app with its own branding/sign-in gate; owner nav isolated (Dashboard/Bookings/Announcements/System Admin); admin-only features stay in owner app
- [x] /admin and /owner legacy routes redirect to owner app; admins auto-routed to System Admin console
- [x] Tests pass (28/28), screenshots verify both shells, checkpoint, deliver
