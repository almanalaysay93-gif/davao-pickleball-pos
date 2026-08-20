/**
 * What the checkout screen says the booking costs.
 *
 * /book snapshots the quote into the booking draft at click time. The quote is
 * a network round trip, so a click that lands before it froze the draft at
 * zero, and checkout then read "Total ₱0.00" for a booking the server priced
 * and created at the real amount. These tests hold the quote open on purpose
 * rather than racing it, so the window is the same width every run.
 *
 * Same safety story as e2e/paymongo-checkout.spec.ts: the fixture in
 * helpers/fixtures.ts proves the server under test reads the TEST project
 * before any of this touches the UI.
 */
import { test, expect } from "./helpers/fixtures";
import type { Page, Route } from "@playwright/test";
import { deleteBookingsByPlayerPrefix, waitForBooking } from "./helpers/db";
import {
  choosePaymentMethod,
  confirmOnline,
  continueToCheckout,
  fillBookingFields,
} from "./helpers/booking";

/** One prefix and one far-future date per run, so a failed run cannot block the next. */
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const PLAYER_PREFIX = `E2E-${RUN}`;
const VENUE = "929 Pickleyard";
// Hours 07/08/09/15 belong to paymongo-checkout.spec.ts. Staying off them
// keeps the two specs from colliding when their random dates happen to match.
const PLAYER_DATE = `2032-${String(1 + Math.floor(Math.random() * 12)).padStart(2, "0")}-${String(1 + Math.floor(Math.random() * 28)).padStart(2, "0")}`;

test.afterAll(async () => {
  const removed = await deleteBookingsByPlayerPrefix(PLAYER_PREFIX);
  console.log(`[cleanup] removed ${removed} booking row(s) for ${PLAYER_PREFIX}`);
});

/** The checkout total, by the same class-locator idiom the settle spec uses. */
function checkoutTotal(page: Page) {
  return page.locator("span.text-2xl.font-bold.text-primary");
}

/** The button on /book that advances to checkout, in either of its labels. */
function continueButton(page: Page) {
  return page.getByRole("button", { name: /Continue to checkout|Pricing/ });
}

/** Hold every bookings.quote response back by `ms`, and let the rest through. */
async function delayQuote(page: Page, ms: number): Promise<void> {
  await page.route("**/api/trpc/**", async (route: Route) => {
    if (route.request().url().includes("bookings.quote")) {
      await new Promise(resolve => setTimeout(resolve, ms));
    }
    await route.continue();
  });
}

test("the checkout total matches the amount the server charges, even when the quote is slow", async ({
  page,
}) => {
  const player = `${PLAYER_PREFIX} race`;
  await delayQuote(page, 4000);
  await fillBookingFields(page, {
    playerName: player,
    playerDate: PLAYER_DATE,
    venueName: VENUE,
    courtNumber: "Court 1",
    startHour: "10:00",
  });

  // The unpriced window. The button must not be a live route to checkout here,
  // and it must say why it is not: a button that is silently inert reads as a
  // broken page.
  await expect(continueButton(page)).toBeDisabled();
  await expect(continueButton(page)).toHaveText(/Pricing/);

  // Actionability makes this click wait out the quote rather than beating it.
  await continueToCheckout(page);
  const shown = (await checkoutTotal(page).innerText()).trim();
  expect(shown).not.toBe("₱0.00");

  // The real assertion. Whatever the screen promised, the row the server
  // writes has to agree with it.
  await page.unroute("**/api/trpc/**");
  await choosePaymentMethod(page, "Cash");
  await confirmOnline(page, "Cash");
  await page.waitForURL("**/confirmation/**", { timeout: 30_000 });

  const row = await waitForBooking(player);
  expect(shown).toBe(`₱${Number(row.total_amount).toFixed(2)}`);
});

test("the rate breakdown heading is absent when there is nothing to itemize", async ({ page }) => {
  const player = `${PLAYER_PREFIX} breakdown`;

  // A quote with no itemizable hours - a venue with no rate tiers priced this
  // way before the race fix, and a comped slot still can. Rewriting the
  // response is the only way to reach the state on demand.
  await page.route("**/api/trpc/**", async (route: Route) => {
    if (!route.request().url().includes("bookings.quote")) return route.continue();
    const response = await route.fetch();
    const body = await response.text();
    await route.fulfill({
      response,
      body: body.replace(/"dayAmount":\d+(\.\d+)?/, '"dayAmount":0').replace(/"nightAmount":\d+(\.\d+)?/, '"nightAmount":0'),
    });
  });

  await fillBookingFields(page, {
    playerName: player,
    playerDate: PLAYER_DATE,
    venueName: VENUE,
    courtNumber: "Court 2",
    startHour: "11:00",
  });
  await continueToCheckout(page);

  // Prove the summary card rendered before asserting a piece of it is missing.
  // toHaveCount(0) retries, so without this anchor the check would pass on a
  // card that never appeared at all.
  await expect(page.getByRole("heading", { name: "Promo code" })).toBeVisible();
  await expect(checkoutTotal(page)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rate breakdown" })).toHaveCount(0, {
    timeout: 1500,
  });
});
