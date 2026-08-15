# Beat PickleHub.ph — Implementation Notes (Aug 15, 2026)

## STATUS UPDATE (phase 3 in progress)
DONE: meta.ts lib; index.html OG/canonical/manifest; icons (icon-192/512/favicon/apple-touch-icon); site.webmanifest; robots.txt; sitemap.xml endpoint registered in server/_core/index.ts (uses listVenues — VERIFIED works via curl, 8 venue URLs); BookingPolicy page created + route registered in App.tsx + footer link added in CustomerLayout; NotFound.tsx rewritten (themed, pun, CTAs, usePageMeta); AnnouncementsBanner dismissible (localStorage key dismissed-announcements, X button, Array.from fix for TS target); Home.tsx/Courts.tsx/Schedule.tsx/Book.tsx wired with usePageMeta (Home includes JSON-LD SportsActivityLocation ItemList via useMemo).
DONE: usePageMeta wired into MyBookings + Confirmation too. tsc clean; pnpm test 81/81. Screenshots verified: Home, /booking-policy (in CustomerApp once — duplicate header in full-page shot was stitching artifact), /404 themed page, /schedule all good. All phase work complete. Note: BookingPolicy inside CustomerApp (line 35). Next: update todo.md, checkpoint, push GitHub, deliver.

## Source attachments (in /home/ubuntu/upload/)
1. `PickleHub.ph—SocialMediaSentimentReport(DavaoArea).md` — sentiment analysis: praise for easy booking, club adoption, pairing/matching; complaints: tournaments displacing confirmed bookings (biggest), open-play pricing ₱250–300 resentment, elitism, organizers prefer dodinks/PickleQ/ReClub over PickleHub.
2. PickleHub.ph website review file (long filename) — Good: 40+ live venues, rich booking grid w/ slot states, Hubby AI assistant, PWA/OG present but static, polished UI. Bad (we exploit): NO per-route titles/meta (SPA hardcoded), no canonical/JSON-LD, broken sitemap (stale lastmod, malformed slug), 6.2MB JS bundle + 2.5s TTFB, featured club link 404s, "Mock Event" test data live, autoplaying announcement popup interrupting booking, missing alt text, ©2025 footer.

## Todo items (already appended to todo.md under "Beat PickleHub.ph"):
Per-route titles/meta, OG/Twitter tags, JSON-LD, robots.txt+sitemap, PWA manifest+icons, alt text, auto copyright year, booking policy page (refund/rescheduling transparency — counter their biggest complaint), non-intrusive dismissible announcements, themed 404, trust badges.

## Progress
- [x] client/src/lib/meta.ts — usePageMeta hook (stack-based title/description/JSON-LD LocalBusiness ItemList). Needs react import (fixed after require mistake).
- [x] client/index.html — per-route-capable title, description, robots, canonical, OG + Twitter tags, manifest link, apple-touch-icon, theme-color, noscript.
- [x] client/public — icon-192.png, icon-512.png, favicon.png, apple-touch-icon.png (pickleball green ball, generated via /home/ubuntu/gen_pwa_icons.py), site.webmanifest, robots.txt.
- [ ] server/sitemap.ts — USE `listVenues` from server/db.ts (NOT listVenuesPublic — that name doesn't exist; fix import). Venue URLs: `/schedule?venueId=${v.id}`.
- [ ] Register sitemap in server/_core/index.ts BEFORE serveStatic: `import { registerSitemap } from "../sitemap";` then `registerSitemap(app);` before the dev/prod branch.
- [ ] Wire usePageMeta into pages: Home (Davao Pickleball POS — Book a Court in Minutes), Courts, Schedule (Browse courts by date + venue title when venueId), Book, MyBookings, NotFound (404 — page not found), Confirmation (Booking confirmed). Import from "@/lib/meta".
- [ ] AnnouncementsBanner: make dismissible (localStorage key `dismissed-ann-{id}`, X button), so it never interrupts booking flow like competitor's popup.
- [ ] Booking policy page: new route /booking-policy (add to App.tsx + nav footer link) explaining: confirmed bookings honored; if venue displaces (tournament/maintenance) → full refund OR free reschedule; how rescheduling works; cancellation rules. Link it in footer + booking flow.
- [ ] Themed 404: rewrite NotFound.tsx with pickleball pun ("This shot went out of bounds"), site styling, CTAs to Home/Schedule.
- [ ] Alt text: GalleryCarousel + VenueLocation images: add alt={venue name} props where used. Check components: GalleryCarousel.tsx, VenueLocation.tsx (client/src/components/).
- [ ] Footer: dynamic year `(new Date().getFullYear())` + link to /booking-policy. Check CustomerLayout footer.
- [ ] tests: vitest on sitemap endpoint + typecheck; then checkpoint + deliver.

## Key facts
- Live URL: https://davaopickpos-jrhmrcab.manus.space (auto-publish ON)
- GitHub: almanalaysay93-gif/davao-pickleball-pos (main in sync as of bfbd051)
- DB: user's Supabase (tfwyrbqygbhrkmlapxxu), backend via server/supa.ts + server/db.ts; 81/81 vitest passing
- Venue table helper: `listVenues()` returns VenueRow[]; galleries via `listGalleryByVenue(venueId)`
- Announcements component: client/src/components/AnnouncementsBanner.tsx (used on Home/Schedule/Book/Courts)
- App routes in client/src/App.tsx; footer in CustomerLayout; images components: GalleryCarousel
