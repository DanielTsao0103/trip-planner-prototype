import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('trip-planner-demo-session', 'active'));
  await page.route('https://*.supabase.co/**', route => route.fulfill({ json: [] }));
  await page.route('https://maps.googleapis.com/maps/api/js?**', route => route.abort());
});

test('discard dialog dismissal retains the event and restores its Cancel control', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await page.goto('./#/7?event=museum&date=2026-10-16&return=17');
  await page.getByLabel('Notes (optional)').fill('Keep this draft until I decide.');
  const cancel = page.getByRole('button', { name: 'Cancel', exact: true });
  for (const dismissal of ['Escape', 'Close dialog', 'Keep editing', 'backdrop']) {
    await cancel.click();
    const dialog = page.getByRole('dialog', { name: 'Discard event changes?' });
    await expect(dialog.getByRole('button', { name: 'Close dialog' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.getByRole('button', { name: 'Discard changes' })).toBeFocused();
    if (dismissal === 'Escape') await page.keyboard.press('Escape');
    else if (dismissal === 'backdrop') await page.locator('.overlay').click({ position: { x: 3, y: 3 } });
    else await dialog.getByRole('button', { name: dismissal, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await test.info().attach(`focus-after-${dismissal}`, { body: JSON.stringify(await page.evaluate(() => ({ tag: document.activeElement?.tagName, text: document.activeElement?.textContent?.slice(0, 80) }))), contentType: 'application/json' });
    await expect(cancel).toBeFocused();
    await expect(page.getByLabel('Notes (optional)')).toHaveValue('Keep this draft until I decide.');
  }
  await cancel.click();
  await page.screenshot({ path: test.info().outputPath('event-discard-short-phone.png') });
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page).toHaveURL(/#\/17\?event=museum$/);
});

test('traveler removal keeps history and restores stable list focus', async ({ page }) => {
  await page.goto('./#/13');
  const remove = page.getByRole('button', { name: 'Remove Eli Brooks', exact: true });
  await remove.click();
  const dialog = page.getByRole('dialog', { name: 'Remove this traveler?' });
  await expect(dialog).toContainText('Eli Brooks');
  await page.keyboard.press('Escape');
  await expect(remove).toBeFocused();
  await remove.click();
  await dialog.getByRole('button', { name: 'Keep traveler', exact: true }).click();
  await expect(remove).toBeFocused();
  await remove.click();
  await dialog.getByRole('button', { name: 'Remove traveler', exact: true }).click();
  await expect(remove).toHaveCount(0);
  await expect(page.locator('#group-travelers')).toBeFocused();
  await page.reload();
  await expect(remove).toHaveCount(0);
  await page.goto('./#/12');
  await expect(page.locator('.expense-row')).not.toHaveCount(0);
});

test('photo-only event changes require explicit discard', async ({ page }) => {
  await page.goto('./#/7?event=museum&date=2026-10-16&return=17');
  await page.locator('.event-photo-disclosure > summary').click();
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
    const context = canvas.getContext('2d')!; context.fillStyle = '#6b8c90'; context.fillRect(0, 0, 16, 16);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.getByLabel('Upload your own event photo').setInputFiles({ name: 'neutral-photo.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await expect(page.getByAltText('Your event photo preview')).toHaveAttribute('src', /^data:image/);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Discard event changes?' });
  await expect(dialog).toBeVisible({ timeout: 1500 });
  await dialog.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(page.getByAltText('Your event photo preview')).toHaveAttribute('src', /^data:image/);
});
