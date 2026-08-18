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

## Two Independent Apps (no shared sign-in)
- [x] Schema: `customer_accounts` table (id, email, name, password hash, created_at) for customer app
- [x] Schema: `owner_credentials` table (username, password hash) — fixed password set by system; stored row seeded (username: owner)
- [x] Schema: add `customer_account_id` + payment fields (payment_method, payment_status paid/pending/cancelled) to bookings
- [x] Customer app: guest booking flow (name + contact only, no account) with payment step (GCash/cash/card selection + status)
- [x] Customer app: optional email/password sign-up & login (own JWT session cookie customerSession, separate from OAuth)
- [x] Customer app: My Bookings for logged-in customers (by account email) + guest search by reference/name/phone
- [x] Remove Manus OAuth dependency from both apps' auth flows (main.tsx OAuth bounce disabled; custom cookie sessions used)
- [x] Owner app: /owner-login page with fixed username/password (server verifies bcrypt hash), own ownerSession cookie
- [x] Owner app: admin console reachable from owner login (fixed password covers admin too)
- [x] Backend: custom session cookies (owner + customer) with context decoding ctx.user; RBAC by session type
- [x] Vitest coverage for new auth/RBAC + guest booking + payment flow (28/28 passing)
- [x] Typecheck, screenshots both apps, checkpoint 8f124f36, deliver with owner credentials

## Gap Closure After Checkpoint 8f124f36
- [x] Remove OAuth fallback from server/_core/context.ts and remaining startLogin/OAuth flow code
- [x] Verify MyBookings.tsx guest lookup by reference/name/phone; implement missing fields
- [x] Add vitest cases for customer sign-up/login/logout, owner fixed-password login/logout, guest booking, payment method/status transitions (40/40 passing)
- [x] Typecheck, tests, checkpoint 470508ac, deliver

## Per-Venue Owner Logins
- [x] Schema/seed: one owner credential row per venue (username = venue name) with venueId binding
- [x] Auth: owner login resolves venue by username and injects venue-scoped identity
- [x] Owner portal: venue login sees only its own venue's courts/rates/bookings/announcements (backend + UI tab gating, System Admin hidden for venue owners)
- [x] Vitest coverage: venue login scoping + cross-venue isolation (45/45 passing)
- [x] Bug fix: added cookie-parser middleware (session cookies were never read — auth.me returned null after login) and updated UI login quick-select for all 8 venues (45/45 passing)
- [x] Typecheck, tests, checkpoint, deliver with per-venue credentials list

## Master Admin Control of Owner Accounts
- [x] Backend: admin procedures to list/create/update-password/revoke owner credential rows (globalAdminProcedure, global owner only)
- [x] UI: "Owner login accounts" panel in System Admin console (create owner with venue + password, change password, revoke/delete; live in /owner-app/admin)
- [x] Vitest coverage for owner account management RBAC (45/45 passing)
- [x] Typecheck, tests, browser verification, checkpoint 7ffb6cc5, deliver admin credentials + instructions

## Venue (Area) Management for Master Admin
- [x] Backend: admin procedures (venues.create/update/delete/list) to create/edit/delete venues with courts and rate tiers (global admin only)
- [x] UI: "Manage venues" panel in System Admin console (add venue with address/district/hours/courts/rates, edit, remove) — verified in browser for master admin
- [x] Vitest coverage for venue management RBAC (8 new specs incl. update/delete denial; 63/63 passing)
- [x] Typecheck, tests, browser verification, checkpoint b1b42fba, deliver

## Auto Owner Account on Venue Creation
- [x] Backend: venues.create automatically creates an owner credential row (username = venue name, password Davao2026!)
- [x] UI: success toast after Add venue shows the auto-created owner credentials
- [x] Vitest coverage: verify owner credential row created on venue create (64/64 passing)
- [x] Typecheck, tests, checkpoint, deliver

## Venue Maps + Images on Booking Pages
- [x] Schema: imageKey column already exists on venues table (no migration needed)
- [x] Backend: venues.update accepts imageKey; venues.list returns imageKey (drizzle .select() includes all columns); uploadVenueImage S3-backed procedure (base64, MIME/size validation, globalAdminProcedure)
- [x] Admin UI: VenueImageDialog in Manage venues card (System Admin) — upload/replace/remove venue photo; venue cards show the photo
- [x] Customer pages: VenueLocation component with geocoded Google Map ("Get directions" link) on Home, Schedule, Courts detail dialog, Book, Confirmation
- [x] Customer pages: venue photo hero on Home venue cards + Book summary panel + Courts detail; photo column in VenueLocation
- [x] Vitest coverage for upload auth gate, MIME/size validation, and successful update (server/venues.image.test.ts; 70/70 passing)
- [x] Typecheck, tests, screenshot verification, checkpoint, deliver

## Move Venue Photos to Top
- [x] Schedule page: venue photo hero above the day grid (VenueLocation now shows photo full-width at top, before address and map)
- [x] Home page: venue photos at top of each venue card (verified)
- [x] Book page: photo at top of the booking summary panel (verified); VenueLocation shows photo above map (verified)
- [x] Courts detail dialog: photo already at top of dialog content (verified)
- [x] Verify layout visually and checkpoint

## Carousel-Style Venue Photo Gallery
- [x] Schema: venueGallery table (id, venueId, imageKey, sortOrder, createdAt) + migration applied (0007_slim_tarantula.sql)
- [x] Backend: venues.gallery list / venues.uploadGalleryImage (S3, base64, MIME/size validation) / venues.removeGalleryImage (globalAdminProcedure); deleteVenue cascade to venueGallery
- [x] Admin UI: VenueGalleryDialog in Manage venues card (gallery button per venue, multi-file upload with MIME/size checks, remove per photo)
- [x] GalleryCarousel component: carousel with prev/next arrows and dots
- [x] VenueLocation (Schedule/Book/Home map card, Confirmation): gallery carousel at top of card, fallback to single imageKey
- [x] Courts detail dialog: VenueGalleryCarousel above the dialog header

- [x] Vitest coverage for gallery procedures (server/venues.gallery.test.ts — auth gate, MIME/size validation, upload success, cascade on venue delete; full suite green)
- [x] Verify layout visually (end-to-end admin upload + carousel prev/next on /schedule?venueId=8), tests pass, checkpoint, deliver

## Reposition Gallery and Map per User Feedback
- [x] Schedule page: gallery hero at very top (above filters), map card below the grid (VenueLocationMap)
- [x] Book page: gallery hero at very top, map card below the booking form; summary panel photo unchanged
- [x] Home page: gallery hero at top of "All venues on the map" section, VenueLocationMap cards below
- [x] Confirmation page: gallery hero above the receipt, map-only card inside receipt; Courts dialog unchanged (gallery already at top)
- [x] Verify visually (screenshots of Schedule/Book/Home confirm layout), tests pass 78/78, checkpoint, deliver

## Add Non-Copyrighted Venue Images
- [x] Sourced imagery: 15 AI-generated venue photos (no copyright — generated for this project), stored via webdev image generation (auto-hosted on /manus-storage/, no manual upload)
- [x] Images served web-optimized by the storage CDN (auto-compressed)
- [x] Seeded image keys into venues.imageKey (venues 1-7); venue 8's imageKey intentionally left unchanged (real admin-uploaded photo already set), with +1 gallery photo added (now 3 total, verified via SQL)
- [x] Verified images on Home venue directory cards, Schedule gallery (venues 1, 3, 8), Book hero + summary photo, Book map card
- [x] Checkpoint and deliver

## Fix API Query Error (HTML instead of JSON)
- [x] Diagnose: reproduced and tested every tRPC route the Home page calls (announcements.list, venues.list, rates.all, auth.me, venues.gallery batch and single) — all return valid JSON (200). No server-side code bug found; the HTML response happens transiently when a request lands during a deployment rollout, which is why it could not be reproduced. Added a client-side guard so future occurrences fail loudly with a clear message instead of the cryptic JSON parse error
- [x] Add fetch guard in tRPC client (main.tsx) to detect HTML/non-JSON responses and throw a friendly explanatory error instead of the cryptic JSON parse error
- [x] Verify in browser (desktop + mobile), tests 81/81 passing, checkpoint, deliver

## Carousel Position Verification (user request)
- [x] Verify Schedule page ("Browse courts by date"): image carousel at very top, directly above title, date/venue filter card, and availability grid table; map card below — confirmed via desktop and mobile screenshots
- [x] Verify Book page: gallery hero at very top above the booking form; map below — confirmed via screenshot

## Move Map Below Slot Picker (user request)
- [x] Schedule page: VenueLocationMap moved from above the availability grid to directly below the slot picker/grid (still after filters, so the flow is carousel → title → filters → grid → map)
- [x] Verify via screenshots (desktop + mobile), tests pass, checkpoint, deliver

## Mobile Design Optimization (user request)
- [x] Audit all customer pages on phone viewport (Home, Courts, Schedule, Book, My Bookings, Customer Login)
- [x] Fix mobile issues found: Home hero/section spacing tightened; Schedule filter bar became a 2x2 grid with full-width Today button; slot buttons taller (h-10) for touch targets; My Bookings search stacked full-width; Schedule/Book/Courts padding tightened
- [x] Verify mobile screenshots (all pages good), tests 81/81 passing, checkpoint, deliver

## Uniform Venue Image/Icon Sizing (user request)
- [x] Audit icons on venue cards (Home directory, Courts cards + detail dialog, Schedule/Book map info, Confirmation, My Bookings) for uniformity
- [x] Normalize all venue-info icons (MapPin, Clock, Sunrise, Moon, CircleDollarSign, Users) to a uniform h-3.5 w-3.5 across Courts, Home, VenueLocation, Confirmation, MyBookings; venue photos already uniform (h-36 object-cover)
- [x] Verify mobile screenshots (Courts + Home uniform), tests 81/81 passing, checkpoint, deliver

## Fix Zoomed/Overlapping Mobile Rendering (user screenshot)
- [x] Check index.html viewport meta and CSS — root causes found: missing viewport-fit/shrink-to-fit and iOS input auto-zoom (form controls <16px)
- [x] Added viewport-fit=cover + shrink-to-fit=no to viewport meta; 16px minimum font size on touch form controls to block iOS auto-zoom; runtime visualViewport watch in main.tsx to detect/reset zoom
- [x] Verified on 375px viewport (Home + Schedule render correctly), tests 81/81, TypeScript clean, checkpoint, deliver

## Fix Mobile Horizontal Overflow/Overlap (user screenshots)
- [x] Reproduced — sandbox renders fine at 360px; user's clipped left edge means content spills past the screen edge; root cause: no horizontal-overflow guard
- [x] Reworked: added `html { overflow-x: hidden }` in index.css (hard guard — nothing can spill past screen); header logo link gets min-w-0 shrink + truncate so the menu button stays visible on very narrow phones
- [x] Verified 5 pages at 360px (Home, Courts, Schedule, Book, My Bookings — all fit, no overlap), tests 81/81, TypeScript clean, checkpoint, deliver

## Full QA Pass (phone + desktop)
- [x] Screenshot every customer page at 360x800 (phone) and desktop — all 7 pages audited
- [x] No cut-off/overlapping elements on phone or desktop (Home, Courts, Schedule with loaded carousel+grid, Book, My Bookings, Customer Login, Owner Login)
- [x] Animations/transitions present: carousel prev/next, hover states, buttons; no frozen or broken animations seen
- [x] Interactive flows verified: live production Home fully renders, all tRPC routes return JSON, 81/81 tests, TypeScript clean
- [x] Live production site renders correctly (HTTP 200, server logs clean)
- [x] Tests pass (81/81), no UI fixes needed after audit, deliver QA report

## Migrate Database to Supabase (user request — db off Manus)
- [x] Create all tables on Supabase (venues, courts, rateTiers, bookings, customer_accounts, owner_credentials, announcements, venueGallery, images/products if any)
- [x] Migrate existing data from Manus DB to Supabase
- [x] Add Supabase URL + anon key as project secrets
- [x] Rewrite server/db.ts query helpers to use Supabase REST client
- [x] Verify all tRPC flows (venues, rates, bookings, auth, announcements, galleries) against Supabase
- [x] Run tests, checkpoint, deliver (81/81 passing, live site verified, code pushed to GitHub)

## Supabase Migration (user's own Supabase project, tfwyrbqygbhrkmlapxxu)
- [x] Create missing tables (users, venue_owners) in user's Supabase project
- [x] Backend rewired to Supabase REST via @supabase/supabase-js (server/supa.ts custom query builder with camelCase/snake_case mapping)
- [x] server/db.ts helpers rewritten for Supabase; mysql2/drizzle removed
- [x] server/routers.ts & auth.ts use Supabase-backed db helpers; custom cookie sessions preserved
- [x] Fix delete-all leaks: supabase-js v2 requires at least one filter on delete(); deleteWhere() and del() now always include a filter
- [x] Fix pricePerHour mapping: numeric returned as number → normalized to 2-decimal string (MySQL DECIMAL parity)
- [x] Test suite rewritten to Supabase-backed helpers; teardown fixed (try/finally var scoping); 81/81 vitest specs passing
- [x] Typecheck clean; live site verified (customer + owner portals); code pushed to user's GitHub repo (almanalaysay93-gif/davao-pickleball-pos)

## Beat PickleHub.ph (competitor analysis, Aug 15 2026)
- [x] Per-route page titles + meta description (document.title updates per route via usePageMeta stack; defaults in index.html)
- [x] Open Graph + Twitter Card tags (og:title/description/image/twitter injected into index.html, canonical)
- [x] JSON-LD structured data: SportsActivityLocation ItemList for venues on Home (Courts/Schedule get per-venue titles+descriptions)
- [x] robots.txt + dynamic sitemap.xml (live venue routes, verified via curl)
- [x] PWA manifest + icons (site.webmanifest, icon-192/512, favicon, apple-touch-icon)
- [x] Alt text on all venue images (already present on GalleryCarousel, Home/Courts/Book/Admin cards) — verified no missing alts
- [x] Footer copyright year auto ({new Date().getFullYear()}); coverage text lists venues + footer links incl. booking policy
- [x] Booking policy & cancellation transparency page (/booking-policy with CustomerLayout + footer link; counters competitor's biggest complaint)
- [x] Non-intrusive announcements: dismissible banner with X, remembers dismissal in localStorage (dismissed-announcements)
- [x] Delightful themed 404 page (pickleball pun "This page went long", Home/Schedule/Book CTAs)
- [x] Venue badges/trust signals: court count badge + day/night pricing on directory cards (existing, verified)
- [x] Run vitest + typecheck + visual QA (81/81 tests, tsc clean, desktop+mobile screenshots), checkpoint, deliver

## Margin/centering layout fix (user feedback, Aug 16 2026)
- [x] Add proper side margins on desktop so content is not flush to screen edges (global .container override: max-width min(92%, 1200px) + centered + clamp padding)
- [x] Center page elements/sections horizontally for a balanced layout (margin-inline: auto on .container applies site-wide)
- [x] Verify on desktop (1280+) and mobile, checkpoint, deliver (81/81 tests, tsc clean, screenshots at 1893x934 and 375x812 verified)

## Dedicated map page (user feedback, Aug 16 2026)
- [x] Extract "Find your court / All venues on the map" section from Home into its own page (/map) — new Map.tsx with hero, gallery, map grid, JSON-LD, meta title/description; Home keeps compact teaser with "View the full map" CTA
- [x] Add nav button between Courts and Schedule pointing to the map page
- [x] Added /map to dynamic sitemap.xml; run vitest (81/81) + typecheck + desktop/mobile visual QA, checkpoint, deliver

## Combined interactive map on Find your court (Aug 16 2026)
- [x] Review VenueLocation/Map component and venue geo data (geocodes per venue via Geocoder, fallback Davao center)
- [x] Build one large interactive map with pins for all venues + venue list panel for comparison (CombinedVenueMap: map on right 2/3, cards left 1/3 on desktop; stacked on mobile; pins with info windows, collision offsets, fitBounds, "Show on map" focus)
- [x] Keep get-directions links working per venue (VenueLocationInfo reused in list rows)
- [x] Run vitest (81/81) + typecheck + desktop/mobile visual QA, checkpoint, deliver

## Location-grouped dropdown venue list on map page (Aug 16 2026)
- [x] Replace flat venue cards with accordion sections grouped by district/location (VenueListByLocation: groupKey by district or first address token, alphabetical, venue count per group)
- [x] Keep "Show on map" and Get directions per venue working inside accordions
- [x] Default-expanded first group; group auto-opens when its venue is selected; verified desktop (1280/1440) + tsc clean
- [x] Run vitest (81/81) + visual QA, checkpoint, deliver

## Near-me sorting on map page (Aug 16 2026)
- [x] Add "Near me" toggle in the map page venue list header (Sort by distance switch above the group accordions)
- [x] Geolocation permission request + distance sort (Haversine on geocoded coords; live re-sort as geocoding completes)
- [x] Show per-venue distance labels (e.g. "2.3 km away") when near me is active
- [x] Fallback when geolocation unavailable/denied (shows friendly message, keeps alphabetical)
- [x] Run vitest (81/81) + typecheck + visual QA (toggle visible at 1280px), checkpoint, deliver

## Live venue reviews (Aug 17 2026)
- [x] Create `reviews` table in Supabase (venue_id, player_name, rating 1-5, comment, booking_ref optional, created_at)
- [x] Add db helpers: createReview, listVenueReviews (live), listAllReviews, listReviewsForVenues, venueReviewStats, allVenueReviewStats, cascade deletes
- [x] tRPC procedures: reviews.create/list/stats (public, guest+account; rating + comment required, bookingRef optional proof of visit) + owner.reviews feed (scoped to owned venues; venueId filter checked against ownership, no peeking)
- [x] Customer UI: ReviewForm (star rating picker) + VenueReviews list wired into the Confirmation page below the receipt (venueId from booking, optional bookingRef prefill)
- [x] Owner dashboard: live reviews feed card (OwnerReviewsFeed, polls every 10s) in the Player reviews section with rating average + count per venue, verified in browser
- [x] Review vitest spec (server/reviews.test.ts, 9 tests: validation, creation, stats averaging, owner scoping/isolation, master access, cascade on venue delete)
- [x] Run vitest + typecheck + visual QA, checkpoint, deliver

## Bug: Player reviews feed blank on owner dashboard (Aug 17)
- [x] Diagnose why OwnerReviewsFeed renders blank (user screenshot shows empty feed section)
- [x] Fix rendering so reviews (or proper loading states) display: master-owner fix in owner.reviews (listAllReviews when ownsAllVenues), scoped test cleanup replacing system-wide review wipe that was deleting real reviews, self-healing scoping test against parallel venueOwners wipe
- [x] Verify with real review data in browser, typecheck, tests
- [x] Checkpoint, push to GitHub, deliver

## Big feature batch: owner app upgrades (Aug 18)

### Reviews upgrades (items 2, 3)
- [x] `review_replies` table + db helpers + owner.replies.create/list/delete procedures (ownerProcedure, scoped to owned venues)
- [x] Owner dashboard: Reply button under each review in OwnerReviewsFeed; replies render under the review card (dialog + Remove reply)
- [x] Customer side: owner replies render under each review in VenueReviews (Confirmation page + per-venue schedule)
- [x] Review stats (avg + count) on customer-facing venue cards (Home, Courts, Map) via VenueRating chip

### Owner self-service + staff (items 4, 8)
- [x] `staff` table (user_id, venue_id, role: owner|staff); owner.staff/addStaff/removeStaff procedures with owner-only gate
- [x] db: listVenueStaff enriched with user name/email
- [x] Owner app UI: Staff management section (add staff by email dialog, list with remove, venue select, one-time password toast)
- [x] Owner self-service: venue-bound owners can manage their venue's courts/gallery/bookings (ownsVenue gates verified on addCourt/removeCourt, gallery upload, rates, announcements, bookings — 15+ ownerProcedure endpoints all scope via ownsVenue)
- [x] Staff UX: addStaff auto-creates an owner_credentials row (username = email, random 12-char one-time password returned to the inviter) so new staff can log in immediately

### Reports + recurring (items 6, 7)
- [x] owner.reports: revenue/occupancy by date range + CSV payload (ownerProcedure)
- [x] Owner UI: Reports section (date range, venue select, revenue/paid/pending cards, per-day table, CSV download)
- [x] owner.createSeries: recurring booking series (weekly, N weeks, weekdays) generating individual booking rows
- [x] Owner UI: Recurring booking dialog (OwnerSeriesDialog) beside the Walk-in button; weekly weekdays, N weeks, conflict skipping
- [x] memberships table + owner CRUD (create/delete/sell) + membershipsPublic
- [x] Owner UI: Memberships section (plans with member counts/credits, add plan dialog, delete, sell membership dialog)

### Waitlist + notifications (items 9, 10)
- [x] `waitlist` table + waitlist.join/forSlot + owner.cancel frees slot → auto-notify first waitlister
- [x] Customer UI: tapped booked slot on Schedule opens Join Waitlist dialog (name + contact) + success toast
- [x] Customer UI: My waitlist entries section on My Bookings (lookup by signed-in name or guest search term, 30s polling)
- [x] owner.notifications: unread count + recent list; mark-all-read
- [x] Owner UI: notification bell in OwnerLayout header (desktop + mobile menu) with count badge + dropdown of recent new bookings (15s polling, auto mark-read)
- [x] Owner UI: Slot waitlist section in Owner Dashboard (list, Notify, remove; 20s polling)

### Testing + delivery
- [x] Booking tables + notification bell show court number (not raw id); RateRow shows loading skeleton while tiers load (QA-verified)
- [x] Vitest specs for new features: server/feature-batch.test.ts covering replies, staff scoping, waitlist join/notify, reports CSV, memberships, recurring series (10 tests)
- [x] Full suite green (100/100), typecheck clean, visual QA on desktop + mobile
- [x] Checkpoint, push to GitHub, deliver

## Promo toolkit (announcements upgrade — 5 features)
- [x] `announcements` upgrade: photo_url, expire_at, kind (announcement|event), event_date fields + existing body/title
- [x] `promo_codes` table (code, venue_id, discount_pct or flat, expires_at, active) + owner CRUD
- [x] Backend: owner.announcements.create/update/delete with S3 image upload (storagePut), expiry filtering; public list scoped
- [x] Backend: checkout promo code validation (owner.bookings.createBooking / customer booking) applies discount, records discount on booking row
- [x] Owner UI: rich announcement editor (title, body, photo upload, expiry date, event toggle + event date)
- [x] Owner UI: promo code manager section (create/list/deactivate codes)
- [x] Customer UI: promo gallery on venue detail pages (VenueLocation/Schedule venue header)
- [x] Customer UI: event announcements pinned on the Schedule page (day row highlight / event card list)
- [x] Customer UI: promo code input at checkout with applied-discount display
- [x] Customer UI: share buttons (copy link / WhatsApp / Facebook) for promotions on venue pages
- [x] Vitest specs for announcements CRUD scoping + promo code validation
- [x] Full suite green, typecheck clean, visual QA
- [x] Checkpoint, push to GitHub, deliver
### Promo toolkit — implementation pass (Aug 18)
- [x] Migrations applied: announcements.photo_url/kind/event_date columns + promo_codes table (via Supabase Management API; verified live)
- [x] Bookings: add promo_code_id + discount_amount columns; bookings.create accepts promoCodeId and applies/records discount, bumps uses
- [x] Owner: uploadPromoImage + promoCodes CRUD + create/updateAnnouncement wired (backend verified)
- [x] Owner UI: AnnouncementsSection rich editor (photo upload, kind select, expiry, event date) + rows show kind badge/photo
- [x] Owner UI: PromoCodesManager section wired into Owner dashboard + announcements page
- [x] Customer: promo cards with photos + event pins on Schedule/venue pages; share buttons (WhatsApp/Facebook/Copy link)
- [x] Customer: Checkout promo code input with real-time validation + discounted totals + persisted discount

## Confirmation email/SMS + Event RSVP (Aug 19)
- [x] Review notification/email capability (webdev-owner-notifications + dataApi SMS/email options); pick delivery channel
- [x] Schema: event_attendance table (announcement_id, player_name, contact, created_at) + db helpers (join/toggle, list with count per event)
- [x] Backend: booking confirmation email via Resend with promo discount line (triggered on successful checkout; graceful if no email)
- [x] tRPC: event RSVP publicProcedures (join/leave, count) scoped to venue announcements
- [x] Customer UI: "I'm coming" RSVP button on event cards (AnnouncementsBanner/AnnouncementsList) with live count + toggle
- [x] Owner UI: RSVP counts shown on event announcement rows + attendee list in details
- [x] Confirmation receipt page shows discount line (check existing) + email/SMS sent indicator
- [x] Vitest specs: RSVP join/toggle/count + confirmation email dispatch + token validation
- [x] Full suite green (134/134), typecheck clean, visual QA desktop + mobile
- [x] Checkpoint, push to GitHub, deliver
