# Davao Pickleball POS — Project TODO

## Data & Backend
- [ ] Design DB schema: venues, courts, rateTiers (day/night), bookings, products/items
- [ ] Run migration via webdev_execute_sql
- [ ] Add query helpers in server/db.ts
- [ ] tRPC procedures: venues list, court availability, bookings CRUD, admin status updates
- [ ] Seed all 8 venues with exact names, addresses, court counts, hours, and day/night rates
- [ ] Vitest coverage for core procedures

## Frontend — Elegant Premium Design
- [ ] Global theme: premium palette, Google fonts, refined index.css
- [ ] App shell: top nav + route structure
- [ ] Home/landing page with premium hero and venue highlights

## Features
- [ ] Court Directory page: all 8 venues with address, court count, hours, day/night rates
- [ ] Real-time hourly availability grid per court per venue (current day)
- [ ] Interactive schedule/calendar view with date browsing, venue & time-slot filters
- [ ] Booking/reservation form: venue, court, date, time slot, player name, contact
- [ ] POS checkout flow: itemized summary, day vs night rate calculation, total, payment confirmation
- [ ] Admin booking dashboard: all reservations, mark occupied/available, cancel/modify
- [ ] Walk-in transaction support from POS interface
- [ ] Receipt/confirmation screen with booking reference number, venue, court, slot, amount

## Polish & QA
- [ ] Booking reference number on every confirmation/receipt
- [ ] Loading/empty/error states everywhere
- [ ] Responsive design (desktop + mobile)
- [ ] Typecheck + tests pass
- [ ] Screenshot verification of all pages
- [ ] Checkpoint + deliver
