import { expect, test } from "@playwright/test";

/**
 * Proves the harness itself works: a real browser, the real dev server, and
 * the app's own markup. If this fails, nothing else in e2e/ can be trusted.
 */
test("the booking form loads with a venue to pick", async ({ page }) => {
  await page.goto("/book");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator('button:has-text("Select a venue")')).toBeVisible();
});
