import { expect, test } from '@playwright/test';

test('phone style preview stays compact and reflects choices before applying them', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.addInitScript(() => {
    sessionStorage.setItem('trip-planner-demo-session', 'active');
    if (!localStorage.getItem('trip-planner-style')) localStorage.setItem('trip-planner-style', JSON.stringify({
      theme: 'blue', mode: 'light', matchDevice: false, heading: 'serif', corners: 'soft',
    }));
  });
  await page.goto('./#/18');
  const preview = page.locator('.style-preview');
  const full = page.locator('.style-preview-full');
  const expand = page.getByRole('button', { name: 'Expand preview', exact: true });
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
  await expect(full).toBeHidden();
  expect((await preview.boundingBox())!.height).toBeLessThan(200);
  await expect(page.getByRole('heading', { name: 'Light or dark', exact: true })).toBeInViewport();

  // Expanding the same preview preserves its keyboard focus and exposes every sample.
  await expand.focus();
  await expand.press('Enter');
  const compact = page.getByRole('button', { name: 'Compact preview', exact: true });
  await expect(compact).toBeFocused();
  await expect(full).toBeVisible();
  await expect(full.getByText('Spent so far', { exact: true })).toBeVisible();
  await compact.press('Enter');
  await expect(expand).toBeFocused();
  await expect(full).toBeHidden();

  await page.getByRole('button', { name: 'Purple', exact: true }).click();
  await page.getByRole('button', { name: 'Aa Grotesk', exact: true }).click();
  await page.getByRole('button', { name: 'Round', exact: true }).click();
  await expect(page.locator('.style-preview-sample h3')).toHaveCSS('font-family', /Space Grotesk/);
  await expect(page.locator('.style-preview-sample .sp-button')).toHaveCSS('border-radius', '20px');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('trip-planner-style')!).theme)).toBe('blue');
  await page.getByRole('button', { name: 'Apply to my site', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Applied', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Purple', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Aa Grotesk', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Round', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('full desktop style sample stays visible without a compact-mode control', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => sessionStorage.setItem('trip-planner-demo-session', 'active'));
  await page.goto('./#/18');
  await expect(page.locator('.style-preview-full')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Expand preview', exact: true })).toBeHidden();
});
