/**
 * The PayMongo checkout flow, in a real browser.
 *
 * These screens shipped on this branch with no browser check at all: tsc and
 * the production build were the only things that had touched them. The
 * regression this file exists for is the first test - an online GCash booking
 * used to be written as paid before any money moved.
 *
 * Everything runs against the TEST Supabase project and a PayMongo sandbox
 * key. e2e/helpers/fixtures.ts refuses to start otherwise.
 */
import { test, expect } from "./helpers/fixtures";
import {
  bookingByReference,
  deleteBookingsByPlayerPrefix,
  waitForBooking,
  type BookingRow,
} from "./helpers/db";
import {
  choosePaymentMethod,
  confirmOnline,
  confirmWalkIn,
  fillBookingForm,
} from "./helpers/booking";

/**
 * One name prefix and one far-future date per run.
 *
 * server/bookings.test.ts leaks rows when a test fails, and the next run then
 * fails with "This slot is already booked". A date nobody books and a delete
 * keyed on the run's own prefix keep this suite out of that trap even when an
 * assertion throws halfway through.
 */
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const PLAYER_PREFIX = `E2E-${RUN}`;
const VENUE = "929 Pickleyard";
// Far future, and jittered so a crashed run cannot collide with the next one.
const PLAYER_DATE = `2031-${String(1 + Math.floor(Math.random() * 12)).padStart(2, "0")}-${String(1 + Math.floor(Math.random() * 28)).padStart(2, "0")}`;

const PAYMONGO_HOST = /checkout\.paymongo\.com/;

test.afterAll(async () => {
  const removed = await deleteBookingsByPlayerPrefix(PLAYER_PREFIX);
  console.log(`[cleanup] removed ${removed} booking row(s) for ${PLAYER_PREFIX}`);
});

/** The header medallion on the confirmation page: clock when held, tick when paid. */
function statusMedallion(page: import("@playwright/test").Page) {
  return page.locator("span.h-16.w-16").first();
}

test.describe.serial("online GCash booking", () => {
  const player = `${PLAYER_PREFIX} gcash`;
  let booking: BookingRow;

  test("1. is redirected to PayMongo and is NOT written as paid", async ({ page }) => {
    await fillBookingForm(page, {
      playerName: player,
      playerDate: PLAYER_DATE,
      venueName: VENUE,
      courtNumber: "Court 1",
      startHour: "07:00",
    });
    await choosePaymentMethod(page, "GCash");
    await confirmOnline(page, "GCash");

    // The hosted page replaces this one. Anything short of leaving the app
    // means the player was never asked for money.
    await page.waitForURL(PAYMONGO_HOST, { timeout: 60_000 });
    expect(page.url()).toMatch(PAYMONGO_HOST);

    booking = await waitForBooking(player);
    expect(booking.channel).toBe("online");
    expect(booking.payment_method).toBe("gcash");
    // The headline. Before commit 3803519 this row read "paid".
    expect(booking.payment_status).toBe("pending");
    expect(booking.paymongo_session_id).toBeTruthy();
  });

  test("2. the confirmation page shows the hold, not a confirmation", async ({ page }) => {
    await page.goto(`/confirmation/${booking.reference}`);

    await expect(page.getByRole("heading", { name: "Court held, awaiting payment" })).toBeVisible();
    await expect(statusMedallion(page).locator('svg[class*="lucide-clock"]')).toBeVisible();
    await expect(page.getByText("Payment pending")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Pay ₱/ }),
    ).toBeVisible();

    // A green tick over an unpaid court is the lie this branch was written to
    // stop. Assert its absence directly, not just the pending copy's presence.
    await expect(page.getByRole("heading", { name: "Booking confirmed" })).toHaveCount(0);
    await expect(statusMedallion(page).locator('svg[class*="lucide-badge-check"]')).toHaveCount(0);

    const row = await bookingByReference(booking.reference);
    expect(row?.payment_status).toBe("pending");
  });

  test("3. the Pay button reopens the SAME PayMongo session", async ({ page }) => {
    const before = await bookingByReference(booking.reference);
    expect(before?.paymongo_session_id).toBeTruthy();

    await page.goto(`/confirmation/${booking.reference}`);
    await page.getByRole("button", { name: /^Pay ₱/ }).click();
    await page.waitForURL(PAYMONGO_HOST, { timeout: 60_000 });
    expect(page.url()).toMatch(PAYMONGO_HOST);

    const after = await bookingByReference(booking.reference);
    // A second session would leave the first one payable and unwatched, and
    // payments.sync only ever knows the newest id.
    expect(after?.paymongo_session_id).toBe(before?.paymongo_session_id);
    expect(after?.payment_status).toBe("pending");
  });

  test("4. backing out of the hosted page softens the copy and keeps it payable", async ({ page }) => {
    await page.goto(`/confirmation/${booking.reference}?cancelled=1`);

    await expect(page.getByRole("heading", { name: "Court held, awaiting payment" })).toBeVisible();
    await expect(
      page.getByText("You left the payment page. Your court is still held for a short while"),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /^Pay ₱/ })).toBeEnabled();

    const row = await bookingByReference(booking.reference);
    expect(row?.payment_status).toBe("pending");
  });
});

test("5. a walk-in still settles immediately", async ({ page }) => {
  const player = `${PLAYER_PREFIX} walkin`;
  await fillBookingForm(page, {
    playerName: player,
    playerDate: PLAYER_DATE,
    venueName: VENUE,
    courtNumber: "Court 2",
    startHour: "08:00",
  });
  await choosePaymentMethod(page, "GCash");
  await confirmWalkIn(page);

  await page.waitForURL("**/confirmation/**", { timeout: 30_000 });
  expect(page.url()).not.toMatch(PAYMONGO_HOST);

  await expect(page.getByRole("heading", { name: "Booking confirmed" })).toBeVisible();
  await expect(statusMedallion(page).locator('svg[class*="lucide-badge-check"]')).toBeVisible();
  await expect(page.getByText("Paid", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Pay ₱/ })).toHaveCount(0);

  const row = await waitForBooking(player);
  expect(row.channel).toBe("walkin");
  expect(row.payment_status).toBe("paid");
});

test("6. cash online stays pending and never reaches PayMongo", async ({ page }) => {
  const player = `${PLAYER_PREFIX} cash`;
  await fillBookingForm(page, {
    playerName: player,
    playerDate: PLAYER_DATE,
    venueName: VENUE,
    courtNumber: "Court 3",
    startHour: "09:00",
  });
  await choosePaymentMethod(page, "Cash");
  await confirmOnline(page, "Cash");

  await page.waitForURL("**/confirmation/**", { timeout: 30_000 });
  expect(page.url()).not.toMatch(PAYMONGO_HOST);

  const row = await waitForBooking(player);
  expect(row.channel).toBe("online");
  expect(row.payment_method).toBe("cash");
  expect(row.payment_status).toBe("pending");
  // No gateway was called, so there is nothing to sync against.
  expect(row.paymongo_session_id).toBeNull();

  await expect(page.getByRole("heading", { name: "Court held, awaiting payment" })).toBeVisible();
});

/**
 * A pending booking must not read as paid on any surface.
 *
 * Commit 3803519 replaced the green tick with a clock, but only once the
 * booking had loaded, and only in the heading. Four surfaces still announced a
 * payment nobody had made: the header during the in-flight window, the toast
 * on the cash path, the receipt's "Amount paid" row, and the browser tab.
 */
test("8. no surface claims payment before the money lands", async ({ page }) => {
  const player = `${PLAYER_PREFIX} surfaces`;
  await fillBookingForm(page, {
    playerName: player,
    playerDate: PLAYER_DATE,
    venueName: VENUE,
    courtNumber: "Court 4",
    startHour: "15:00",
  });
  await choosePaymentMethod(page, "Cash");

  // The cash path leaves the booking pending on purpose, so a success toast
  // reading "Booking confirmed" contradicts the heading it lands on top of.
  await confirmOnline(page, "Cash");
  await page.waitForURL("**/confirmation/**", { timeout: 30_000 });
  // Short timeout on purpose. toHaveCount(0) retries, so a generous one would
  // pass the moment the toast auto-dismisses and prove nothing.
  await expect(page.getByText("Booking confirmed", { exact: true })).toHaveCount(0, {
    timeout: 1500,
  });

  const row = await waitForBooking(player);
  expect(row.payment_status).toBe("pending");

  // The receipt calls the amount paid while a Pay button sits underneath it.
  await expect(page.getByText("Amount paid")).toHaveCount(0);
  await expect(page.getByText("Amount due")).toBeVisible();

  // The tab was hardcoded to "Booking Confirmed" for every state.
  expect(await page.title()).not.toContain("Booking Confirmed");

  // Hold bookings.get in flight and sample the header. `pending` was false
  // while data was undefined, so the page fell through to the success branch.
  await page.route("**/api/trpc/**", async route => {
    if (route.request().url().includes("bookings.get")) {
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    await route.continue();
  });
  await page.goto(`/confirmation/${row.reference}`);
  await expect(page.getByRole("heading", { name: "Booking confirmed" })).toHaveCount(0);
  await expect(page.getByText("Your reservation is secured")).toHaveCount(0);
  await page.unroute("**/api/trpc/**");
});
