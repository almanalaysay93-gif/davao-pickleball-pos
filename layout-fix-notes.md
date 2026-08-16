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
