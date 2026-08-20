/**
 * The venue info row at phone width.
 *
 * The venue name and the "Get directions" link shared one flex row. Inside the
 * confirmation receipt the row is only 235px wide at a 390px viewport, so the
 * link took half of it and "929 Pickleyard" broke across two lines beside it.
 *
 * The measurement is the line count of the name, not a pixel baseline and not
 * an overlap test. Flex never lets the two boxes overlap - it squeezes the
 * name instead - so an overlap assertion would pass against the broken layout
 * and prove nothing. Pre-fix this reads 2 lines; a pixel baseline would also
 * catch it, at the cost of a file that has to be regenerated on every font or
 * spacing change.
 */
import { test, expect } from "./helpers/fixtures";
import { deleteBookingsByPlayerPrefix, waitForBooking } from "./helpers/db";
import { choosePaymentMethod, confirmWalkIn, fillBookingForm } from "./helpers/booking";

const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const PLAYER_PREFIX = `E2E-${RUN}`;
const VENUE = "929 Pickleyard";
// Its own year, so neither of the other specs can take this slot first.
const PLAYER_DATE = `2033-${String(1 + Math.floor(Math.random() * 12)).padStart(2, "0")}-${String(1 + Math.floor(Math.random() * 28)).padStart(2, "0")}`;

test.use({ viewport: { width: 390, height: 844 } });

test.afterAll(async () => {
  const removed = await deleteBookingsByPlayerPrefix(PLAYER_PREFIX);
  console.log(`[cleanup] removed ${removed} booking row(s) for ${PLAYER_PREFIX}`);
});

test("the venue name keeps its line at 390px", async ({ page }) => {
  const player = `${PLAYER_PREFIX} mobile`;
  await fillBookingForm(page, {
    playerName: player,
    playerDate: PLAYER_DATE,
    venueName: VENUE,
    courtNumber: "Court 1",
    startHour: "13:00",
  });
  await choosePaymentMethod(page, "Cash");
  await confirmWalkIn(page);
  await page.waitForURL("**/confirmation/**", { timeout: 30_000 });
  await waitForBooking(player);

  const name = page.locator("p.font-display").filter({ hasText: VENUE }).last();
  const directions = page.getByRole("link", { name: "Get directions" }).last();
  await expect(name).toBeVisible();
  await expect(directions).toBeVisible();

  // Client rects of the text node itself: one rect per rendered line.
  const lines = await name.evaluate(el => {
    const text = Array.from(el.childNodes).find(
      n => n.nodeType === Node.TEXT_NODE && n.textContent!.trim(),
    );
    const range = document.createRange();
    range.selectNodeContents(text!);
    return new Set(Array.from(range.getClientRects()).map(r => Math.round(r.top))).size;
  });
  expect(lines).toBe(1);

  // Stacking the link must not buy that line by pushing the page sideways.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});
