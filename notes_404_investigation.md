# 404 on https://davaopickpos-jrhmrcab.manus.space — investigation (Aug 12, 2026)

User reports: site shows error 404 on the live domain.

Findings (all HTTP checks from sandbox):
- All paths return 200: /, /courts, /owner-login, /owner-app, /api/trpc/auth.me, /manifest.json
- Root HTML is correct, last-modified Wed 12 Aug 2026 15:54:01 GMT (deployment time of checkpoint c073e875).
- JS bundle /assets/index-Ib2oy0BG.js returns 200.
- Server response includes spaceEditor dispatcher script (files.manuscdn.com) and plausible.io analytics (expected for manus.space).
- In MY browser the site renders fully, owner login works end-to-end on production.

Conclusion so far: production server is healthy; 404 likely user-side (stale DNS/cached page, or they visit a specific path that doesn't exist e.g. /admin or /owner legacy routes — wait, /admin legacy route was REDIRECTED to owner-app in App.tsx... but maybe the redirect path changed and a bookmarked URL returns 404).

Possible causes to check:
1. User bookmarks old URLs: /admin, /owner, /dashboard, etc. — check what App.tsx does with those paths (redirects? render NotFound?).
2. Transient Cloudflare deployment propagation.
3. Their browser cached an old error page.

App.tsx routing notes: customer app root '/', legacy /owner -> redirect /owner-app, /admin -> redirect /owner-app/admin(?), /owner-app, /owner-login. NotFound page renders custom 404 UI.

Next: ask user which exact URL they open / what page shows 404. Also verify legacy redirects on production return actual redirect (HTTP 302) not 404.

## Update 2 (mobile check, Aug 12 ~17:06 GMT+8)

User: "im using phone it doesn't load"

Verified from my side (both dev preview AND production domain):
- Mobile viewport 375x812 screenshots: home page renders fully on production domain (all 8 venues, footer, nav), owner-login renders, owner-app gate renders.
- Bundle /assets/index-Ib2oy0BG.js: 703002 bytes, HTTP 200, content-type text/javascript. No incompatible ES syntax found (no .at(, no top-level-await, no Promise.allSettled issues... actually 4 occurrences of Promise.allSettled in bundle — supported since Safari 13).
- Production logs: zero errors since deployment.
- DNS resolves (Cloudflare), cf-ray GRU (Brazil edge) in my tests.

Still no reproducible 404 from sandbox. Likely causes on user's phone:
1. Phone browser cached the error page / stale DNS from ISP.
2. User's mobile network (PH carrier?) hitting a regional Cloudflare edge that hasn't refreshed, or an IPv6-only DNS quirk.
3. User actually typing a wrong URL (e.g. missing https://, or copying the dev preview URL 3000-... which is sandbox-only and WOULD show 404/error on their phone since it's an internal sandbox address — THIS IS THE MOST LIKELY EXPLANATION! The dev preview URL https://3000-i4jb6nprkqt9jqf4tb6h1-62871b8b.sg1.manus.computer is NOT accessible outside the Manus environment sandbox/proxy. If they open that link on phone they may get an error/404-like page.)

Action: ask user to confirm which exact URL they are opening on the phone; give the correct public URL: https://davaopickpos-jrhmrcab.manus.space
