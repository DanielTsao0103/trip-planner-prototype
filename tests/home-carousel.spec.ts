import { expect, test } from "@playwright/test";

for (const width of [320, 390, 768, 1440]) {
  test(`template cards fit, loop and restore keyboard focus at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("./");
    await page.getByRole("button", { name: "Try demo as Maya", exact: true }).click();
    await page.goto("./#/4");
    const carousel = page.getByRole("region", { name: "Pre-planned trip carousel" });
    const window = carousel.locator(".planned-carousel-window");
    const card = carousel.locator('.planned-trip-card[tabindex="0"]').first();
    await expect(carousel.getByText("Trip 1 of 16", { exact: true })).toBeVisible();

    async function expectCompleteCard(): Promise<void> {
      // Waiting on geometry also catches a stale movement step after responsive resizing.
      await expect.poll(async () => {
        const outer = await window.boundingBox();
        const inner = await card.boundingBox();
        return !!outer && !!inner && Math.abs(inner.x - outer.x) < 1
          && inner.x + inner.width <= outer.x + outer.width + 1;
      }).toBe(true);
    }

    await expectCompleteCard();
    await carousel.getByRole("button", { name: "Previous trips", exact: true }).click();
    await expect(carousel.getByText("Trip 16 of 16", { exact: true })).toBeVisible();
    await expectCompleteCard();
    await carousel.getByRole("button", { name: "Next trips", exact: true }).click();
    await expect(carousel.getByText("Trip 1 of 16", { exact: true })).toBeVisible();
    await expectCompleteCard();
    await carousel.getByRole("button", { name: "Next trips", exact: true }).click();
    await expect(carousel.getByText("Trip 2 of 16", { exact: true })).toBeVisible();
    await expectCompleteCard();
    await card.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(card).toBeFocused();
    await expect(card).toHaveCSS("outline-offset", "-3px");
    await page.screenshot({ path: test.info().outputPath(`carousel-${width}.png`) });
    await page.setViewportSize({ width: width === 320 ? 1440 : 320, height: 844 });
    await expectCompleteCard();
  });
}
