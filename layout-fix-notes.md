# Margin/Centering Layout Fix Notes (Aug 16, 2026)

## Done so far
- Global `.container` override added in `client/src/index.css` (base layer):
  `width:100%; max-width:min(92%,1200px); margin-inline:auto; padding-inline:clamp(1rem,4vw,3rem);`
- Content no longer flush to edges; centered column verified at 1893x934, 1280x934, 375x812.
- Checkpoint saved: abddd791. Tests 81/81, tsc clean.

## User's screenshot analysis
User's latest screenshot (1893x934, full page stitched) showed header appearing twice and hero pushed right — this is the FULL-PAGE screenshot stitching artifact, not a real bug (same artifact seen earlier with /booking-policy). At single-viewport captures the layout looks correct:
- 1280x934: header single line, hero 2-col grid balanced, sections left-aligned within centered column (by design).
- 1893x934: same, wider margins.
- 375x812: mobile fine.

## Concern flagged by me
In the stitched image, "Built for players" heading appeared clipped/overlapping the CTA band — caused by full-page stitching of two captures, NOT a real layout issue. But to be safe, verify header at narrow desktop (~1024-1280) doesn't wrap. Header at 1280 single line OK.

## Remaining
- Confirm no real clipping at 1024px and ~1440px width.
- Deliver message with checkpoint abddd791 (already saved, auto-published).
- Push to GitHub: `cd /home/ubuntu/davao-pickleball-pos && git push github main`

## Suggestions for next steps (deliverable)
1. Owner daily revenue/occupancy dashboard reports
2. SMS/email booking reminders (needs Twilio/Resend credentials)
3. "Find a game" community open-play board (competitor sentiment opportunity)

---

# Dedicated Map Page Task (Aug 16 2026, follow-up)

User request: move "Find your court / All venues on the map" section to its own page, nav button between Courts and Schedule.

Progress:
- [x] Created `client/src/pages/Map.tsx` — dedicated /map page with hero, VenueGalleryHero (venues[0]), grid of VenueLocationMap cards, CTA band, usePageMeta title/desc, JSON-LD ItemList.
- [x] Added nav entry `{ href: "/map", label: "Find your court", icon: MapPin }` between Courts and Schedule in CustomerLayout.tsx navLinks; imported MapPinned icon (unused, harmless — check lint).
- [x] Home.tsx: removed full map grid, kept section with "View the full map" Button linking to /map.
- [ ] Register route <Route path={"/map"} component={Map} /> in App.tsx (CustomerApp switch, customer routes at ~lines 28-36).
- [ ] Update sitemap.ts to include /map route.
- [ ] Update usePageMeta note: signature is {title, description?, venues?} — do NOT pass route param.
- [ ] Typecheck + vitest (81/81) + screenshots, checkpoint, push github main.

Checkpoint history: f6e8e883 (layout polish, latest delivered). Auto-publish enabled.
GitHub repo: almanalaysay93-gif/davao-pickleball-pos (remote name "github", branch main).

---

# Location-grouped dropdown venue list (Aug 16 2026)

User request: venue list on /map should be dropdown (accordion) buttons grouped by location/district.

Progress:
- [x] Replaced flat VenueListRow cards with VenueListByLocation: groups derived via groupKey() (district or first address token), alphabetical sort, ChevronDown toggle, first group open by default, auto-opens group when a venue is selected via Show on map/pin click.
- [x] Venue rows moved inside accordion content (VenueLocationInfo + Show on map button preserved, Get directions preserved).
- [x] Verified at 1440x900: "Bajada" accordion group header with Arena Athletics row visible, map on right.
- [x] tsc clean, vitest 81/81 passing.
- [ ] Save checkpoint + push github main + deliver.

Checkpoint history: 751c8705 (combined map, last delivered). Auto-publish enabled.
GitHub remote name: github, branch main, repo almanalaysay93-gif/davao-pickleball-pos.
