/**
 * Drive the real booking screens: /book, then /checkout.
 *
 * Nothing here stubs a network call or reaches past the UI. The point of this
 * suite is that these two screens had never run in a browser, so every step is
 * a click a player would make.
 */
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** The four Radix selects on /book, in DOM order. */
const SELECT = { venue: 0, court: 1, startTime: 2, duration: 3 } as const;

export type BookingChoice = {
  playerName: string;
  playerDate: string;
  venueName: string;
  courtNumber: string;
  /** 24h "HH:MM". Converted to the 12h label the option shows. */
  startHour: string;
};

function hourLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

async function chooseOption(page: Page, index: number, optionName: string): Promise<void> {
  const trigger = page.getByRole("combobox").nth(index);
  await trigger.click();
  await page.getByRole("option", { name: optionName, exact: true }).click();
}

/**
 * Fill the booking form and land on /checkout.
 *
 * The select indexes are asserted against their placeholder text first. If the
 * form ever gains or reorders a field, the failure names the field rather than
 * silently choosing the wrong one.
 */
export async function fillBookingForm(page: Page, choice: BookingChoice): Promise<void> {
  await page.goto("/book");

  const venueTrigger = page.getByRole("combobox").nth(SELECT.venue);
  await expect(venueTrigger).toContainText("Select a venue");
  await chooseOption(page, SELECT.venue, choice.venueName);

  await page.getByPlaceholder("Juan Dela Cruz").fill(choice.playerName);

  // No email on purpose. An address here makes the server send a real
  // confirmation mail, and a test should not put anything in an inbox.
  await page.locator('input[type="date"]').fill(choice.playerDate);

  const courtTrigger = page.getByRole("combobox").nth(SELECT.court);
  await expect(courtTrigger).toContainText("Select court");
  await chooseOption(page, SELECT.court, choice.courtNumber);

  const slotTrigger = page.getByRole("combobox").nth(SELECT.startTime);
  await expect(slotTrigger).toContainText("Pick a slot");
  await chooseOption(page, SELECT.startTime, hourLabel(choice.startHour));

  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await page.waitForURL("**/checkout");
  await expect(page.getByRole("heading", { name: "Confirm your booking" })).toBeVisible();
}

export type PaymentMethod = "Cash" | "GCash" | "Card";

export async function choosePaymentMethod(page: Page, method: PaymentMethod): Promise<void> {
  await page.locator("label").filter({ hasText: new RegExp(`^${method}$`) }).click();
  await expect(page.getByText(`Payment: ${method}`)).toBeVisible();
}

/** The online button relabels itself: cash confirms, anything else pays. */
export async function confirmOnline(page: Page, method: PaymentMethod): Promise<void> {
  const name = method === "Cash" ? "Confirm online booking" : "Pay now";
  await page.getByRole("button", { name }).click();
}

export async function confirmWalkIn(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Walk-in payment" }).click();
}
