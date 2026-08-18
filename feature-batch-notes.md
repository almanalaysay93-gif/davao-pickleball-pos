# Big feature batch — implementation notes (Aug 18, 2026)

## Backend already complete (verified)
- `owner.replies` list / `createReply` (reviewId, body) / `deleteReply` (reviewId) — ownerProcedure scoped.
- `owner.staff` (venueId optional) / `addStaff` (venueId, email, role staff|owner) / `removeStaff` (userId, venueId).
  - Currently editing addStaff to auto-provision owner_credentials row (username=email, one-time password). TODO: add `randomOneTimePassword()` helper at top of routers.ts or in db.ts.
- `owner.memberships` (venueId) / `createMembership` (venueId, name, description?, price string, credits default 1, validityDays default 30) / `deleteMembership` (id) / `sellMembership` (name, phone?, membershipId → returns id, expiresAt) / `membershipsPublic` (venueId).
- `owner.reports` ({venueId?, start, end} → {revenue, paidCount, pendingCount, totalBookings, days:[{date,revenue,paidCount,pendingCount,slots}], csv}) — CSV lines: date,revenue,paid_bookings,pending_bookings,total_slots.
- `owner.createSeries` (venueId, courtId, startHour, endHour, startDate YYYY-MM-DD, weeks 1-52, weekdays [0-6] 0=Sun, playerName, contact?, paymentMethod?) → {seriesId, createdCount, skippedCount, skipped[]}.
- `owner.waitlist` (venueId) / `notifyWaitlist` (id, venueId) / `dismissWaitlist` (id, venueId).
- `owner.notifications` ({venueId?} → {count, rows[UnreadBookingRow with venueName]}) / `markNotificationsRead` ({venueId?}).
- `waitlist.join` public (venueId, courtId, playerDate, startHour, endHour, playerName, contact?) → {success, id, position}; error if slot not booked ("book directly instead"), or duplicate name.
- `waitlist.mine` public ({playerName} → rows).
- `reviews.list`/`stats`/`replies`/`create` public; `VenueRating` component in client/src/pages/Home.tsx (exports VenueRating, takes venueId, shows ★ avg (count), null when count 0). Imported by VenueLocation.tsx.

## DB helper enrichments (db.ts, done)
- listVenueStaff → StaffRowWithUser {userName, userEmail} (joins users, batches of 50).
- listWaitlistForVenue → WaitlistRowWithVenue {venueName, courtNumber}.
- listUnreadBookings → UnreadBookingRow {venueName} (joins listVenuesByIds).

## UI TODO (pending)
1. [ ] Add `randomOneTimePassword()` helper (crypto.getRandomValues → 10-char alnum), fix TS error in routers.ts.
2. [ ] Owner Dashboard UI sections: Staff (add by email dialog, list w/ remove, show provisioned password toast), Reports (date range, summary cards, day table, CSV download button), Memberships (plans list w/ member counts, add plan dialog, delete, sell membership dialog), Waitlist per venue (list, notify, remove), Recurring checkbox in OwnerBookDialog.
3. [ ] OwnerLayout: notification bell (trpc.owner.notifications, polling ~15s) with count badge + dropdown; nav links for Reports/Memberships? (decide: keep as dashboard sections to limit nav bloat).
4. [ ] Schedule.tsx: Join Waitlist on occupied slots (AvailabilityGrid needs onWaitlist(courtId, hour) callback + waitlist meta). Add WaitlistDialog (name, contact). Show toast + success state; use waitlist.mine on My Bookings page.
5. [ ] My Bookings: My waitlist section.
6. [ ] Vitest: server/owner-features.test.ts — replies, staff (incl. one-time password login flow), waitlist join/errors, reports csv, memberships, createSeries conflict skip.
7. [ ] QA screenshots desktop + mobile (360px), typecheck, full test run, checkpoint + push GitHub.

## Key locations
- Owner page: client/src/pages/Owner.tsx (OwnerDashboard at line 81; sections: stats → venues → reviews feed → bookings table; OwnerBookDialog 309, OwnerWalkInDialog 464, VenuePanel 1007).
- OwnerLayout: client/src/components/OwnerLayout.tsx (nav links at top, header right side ~line 82; bell goes next to Sign Out).
- AvailabilityGrid: client/src/components/AvailabilityGrid.tsx (occupied cell at ~line 88-108; pass onWaitlist prop).
- Schedule.tsx handleSelect ~line 110; availability query forVenueDate.
- OwnerReviewsFeed: client/src/components/OwnerReviewsFeed.tsx (replies done).
- VenueReviews/ReviewForm: client/src/components/ReviewForm.tsx (customer replies rendering done).
- App.tsx: OwnerApp routes at ~48-60; only /owner-app, /bookings, /announcements, /admin mounted.
- auth.ts exports hashPassword, verifyPassword, setOwnerCookie, getOwnerCredentialByUsername, insertOwnerCredential, db.*.
- Owner credentials login: auth.ownerLogin (username/password → venue-bound cookie). Staff credential username = email (lowercased), venueId bound.

## Notes
- Existing owner credential usernames are venue names (login e.g. "The Court @ Bajada", password Davao2026!). Master owner = "owner" (no venueId).
- owner.myVenues: global owner (type owner, no venueId) sees all; venue-bound sees one venue; scoped via venueOwners rows.
- owner.notifications count scoped to last 7 days (seen_by_owner=false).
- Reports uses db.listOwnerBookings(venueIds, {limit:5000}).
- Membership plan shape: {id, venueId, name, description, price, credits, validityDays, active, memberCount, totalCreditsRemaining}.
- tests run: pnpm test (currently 90 tests; one flaky reviews scoping test re-runs green alone).
- Live site: https://davaopickpos-jrhmrcab.manus.space (auto-publish on checkpoint). GitHub repo: almanalaysay93-gif/davao-pickleball-pos.

## Current state snapshot (in-progress)
- Created client/src/components/OwnerFeatureSections.tsx with: OwnerStaffSection, OwnerReportsSection, OwnerMembershipsSection (+SellMembershipForm), OwnerWaitlistSection, OwnerSeriesDialog, JoinWaitlistDialog, OwnerNotificationsBell.
- randomOneTimePassword() added to routers.ts; TSC passed at that point.
- Current TSC errors (9): owner.notifications/useQuery called with `undefined` input — needs `{}` since input schema is required (optional venueId inside). Same for other `useQuery(undefined)` calls in OwnerFeatureSections.tsx (staff/memberships queries may also error — check all useQuery(undefined) → useQuery({})).
- Next: fix errors, wire sections into Owner.tsx OwnerDashboard (after reviews feed: Staff, Reports, Memberships, Waitlist; before bookings card), add OwnerSeriesDialog next to OwnerWalkInDialog, add OwnerSeriesDialog recurring button, add bell to OwnerLayout.tsx header (import OwnerNotificationsBell), add JoinWaitlistDialog to Schedule.tsx (occ slot click opens dialog instead of navigating; add onWaitlist to AvailabilityGrid or handle in Schedule via overlay), My Bookings waitlist mine section, vitest specs, QA, checkpoint.
- OwnerLayout bell placement: header right side near Sign Out (~line 82-110); mobile menu items at ~113-139.
- MyBookings.tsx: BookingList at lines 265-351; add MyWaitlist section after booking list using trpc.waitlist.mine({playerName}).
- trpc.waitlist.mine input: { playerName: string } (required).
- AvailabilityGrid prop plan: add optional `onFullSlot?: (courtId, hour) => void`; occupied cell: if onFullSlot && occ && !interactive → clickable calls onFullSlot.
- db.listMyWaitlist returns rows; need to confirm column names (venueId, courtId, playerDate, startHour, endHour, playerName, contact, status, createdAt) — used WaitlistRow shape above.
