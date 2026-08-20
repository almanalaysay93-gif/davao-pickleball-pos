/**
 * The settle leg: pay on the PayMongo sandbox, come back, and watch
 * payments.sync flip the booking to paid.
 *
 * Kept in its own file on purpose. Every step after the redirect drives
 * PayMongo's hosted pages, whose markup is theirs to change without notice. A
 * break here says the gateway's page moved, not that the booking flow
 * regressed, and it must not take the regression suite in
 * paymongo-checkout.spec.ts down with it.
 *
 * The webhook cannot reach a dev server on localhost, so nothing but the
 * confirmation page's own sync call can settle this booking. That is exactly
 * the code path under test.
 */
import { test, expect } from "./helpers/fixtures";
import { deleteBookingsByPlayerPrefix, bookingByReference, waitForBooking } from "./helpers/db";
import { choosePaymentMethod, confirmOnline, fillBookingForm } from "./helpers/booking";

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const PLAYER_PREFIX = `E2E-${RUN}`;
const PLAYER_DATE = `2031-${String(1 + Math.floor(Math.random() * 12)).padStart(2, "0")}-${String(1 + Math.floor(Math.random() * 28)).padStart(2, "0")}`;

test.afterAll(async () => {
  const removed = await deleteBookingsByPlayerPrefix(PLAYER_PREFIX);
  console.log(`[cleanup] removed ${removed} booking row(s) for ${PLAYER_PREFIX}`);
});

test("7. a completed sandbox payment settles the booking through payments.sync", async ({ page }) => {
  const player = `${PLAYER_PREFIX} settle`;

  await fillBookingForm(page, {
    playerName: player,
    playerDate: PLAYER_DATE,
    venueName: "929 Pickleyard",
    courtNumber: "Court 4",
    startHour: "14:00",
  });
  await choosePaymentMethod(page, "GCash");
  await confirmOnline(page, "GCash");

  await page.waitForURL(/checkout\.paymongo\.com/, { timeout: 60_000 });

  const booking = await waitForBooking(player);
  expect(booking.payment_status).toBe("pending");

  // ── PayMongo's hosted checkout ──────────────────────────────────────────
  await page.getByRole("button", { name: "E-Wallets" }).click();
  // The wallet list expands in place; GCash is not exposed as a button role.
  await page.getByText("GCash", { exact: true }).first().waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Continue" }).click();

  await page.locator("#checkout-form\\:name").waitFor({ state: "visible", timeout: 30_000 });
  await page.locator("#checkout-form\\:name").fill("E2E Tester");
  // example.com is reserved and has no inbox, so no receipt reaches anybody.
  await page.locator("#checkout-form\\:email").fill("e2e-test@example.com");
  await page.getByRole("button", { name: /^Pay ₱/ }).click();

  // ── The sandbox authorisation page ──────────────────────────────────────
  const authorize = page.getByRole("button", { name: "Authorize Test Payment" });
  await authorize.waitFor({ state: "visible", timeout: 60_000 });
  // Money is still not taken until this click, so the booking is still held.
  const stillPending = await bookingByReference(booking.reference);
  expect(stillPending?.payment_status).toBe("pending");

  await authorize.click();

  // ── Back on the confirmation page ───────────────────────────────────────
  await page.waitForURL(`**/confirmation/${booking.reference}`, { timeout: 90_000 });

  // The webhook cannot reach localhost, so payments.sync on this page is the
  // only thing that can settle the row. Poll rather than read once: the
  // gateway takes a second or two to report the payment.
  await expect
    .poll(async () => (await bookingByReference(booking.reference))?.payment_status, {
      timeout: 45_000,
      message: "payments.sync never settled the booking after a completed sandbox payment",
    })
    .toBe("paid");

  // And the screen must agree with the row.
  await expect(page.getByText("Paid", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Booking confirmed" })).toBeVisible();
  await expect(
    page.locator("span.h-16.w-16").first().locator('svg[class*="lucide-badge-check"]'),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Pay ₱/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Court held, awaiting payment" })).toHaveCount(0);
});
