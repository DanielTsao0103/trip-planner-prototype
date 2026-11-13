import { expect, test, type Page } from '@playwright/test';

/** Use a real pointer over an empty demo day, with no external account writes. */
async function emptyDay(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(async () => { await document.fonts.ready; });
  const grid = page.locator('.itcal-scroll');
  await grid.evaluate(el => { el.scrollIntoView({ block: 'start' }); el.scrollTop = 0; });
  const day = page.locator('[data-calendar-date="2026-10-15"]');
  const box = (await day.boundingBox())!;
  return { day, x: box.x + 80, y: box.y };
}

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/(.*\.supabase\.co|maps\.googleapis\.com|places\.googleapis\.com|photon\.komoot\.io)\//, route => route.abort());
  await page.addInitScript(() => sessionStorage.setItem('trip-planner-demo-session', 'active'));
  await page.goto('./#/8?view=calendar');
  await expect(page.locator('.weekly-calendar')).toBeVisible();
});

test('drag previews quarter hours, opens the form, and saves exact typed minutes', async ({ page }, info) => {
  const { x, y } = await emptyDay(page);
  await page.mouse.move(x, y + 2 * 72 + 6); // 9:05 snaps to 9:00.
  await page.mouse.down();
  await page.mouse.move(x, y + 3 * 72 + 14, { steps: 8 }); // 10:12 snaps to 10:15.
  await expect(page.locator('.itcal-selection')).toContainText('9:00 AM – 10:15 AM');
  await page.screenshot({ path: info.outputPath('selected-range.png') });
  await page.mouse.up();
  await expect(page.getByLabel('Start time', { exact: true })).toHaveValue('09:00');
  await expect(page.getByLabel('End time', { exact: true })).toHaveValue('10:15');
  if (info.project.name === 'mobile') await page.setViewportSize({ width: 390, height: 600 });
  await page.getByLabel('Event name', { exact: true }).fill('Selected calendar plan');
  await page.getByRole('combobox', { name: 'Where', exact: true }).fill('Local meeting place');
  await page.getByLabel('Start time', { exact: true }).fill('09:07');
  await page.getByLabel('End time', { exact: true }).fill('10:13');
  await page.getByRole('button', { name: 'Add to itinerary', exact: true }).click();
  await expect(page).toHaveURL(/#\/8\?date=2026-10-15&event=.+&view=calendar$/);
  await page.reload();
  await expect(page.locator('[data-calendar-return-event]:visible').filter({ hasText: 'Selected calendar plan' })).toContainText('9:07');
  await expect(page.locator('[data-calendar-return-event]:visible').filter({ hasText: 'Selected calendar plan' })).toContainText('10:13');
});

test('reverse drag selects the earlier start and cancelling creates no event', async ({ page }) => {
  const { x, y } = await emptyDay(page);
  await page.mouse.move(x, y + 3 * 72);
  await page.mouse.down();
  await page.mouse.move(x, y + 2 * 72 + 18, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByLabel('Start time', { exact: true })).toHaveValue('09:15');
  await expect(page.getByLabel('End time', { exact: true })).toHaveValue('10:00');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page).toHaveURL(/#\/8\?date=2026-10-15&view=calendar$/);
  await expect(page.locator('[data-calendar-date="2026-10-15"] .itcal-event')).toHaveCount(2);
});

test('Escape and pointer cancellation abandon selection; a click defaults to one hour', async ({ page }) => {
  const { day, x, y } = await emptyDay(page);
  for (const cancel of ['escape', 'pointer']) {
    await page.mouse.move(x, y + 2 * 72);
    await page.mouse.down();
    await page.mouse.move(x, y + 3 * 72, { steps: 4 });
    await expect(page.locator('.itcal-selection')).toBeVisible();
    if (cancel === 'escape') await page.keyboard.press('Escape');
    else await day.dispatchEvent('pointercancel');
    await page.mouse.up();
    await expect(page.locator('.itcal-selection')).toHaveCount(0);
    await expect(page).toHaveURL(/#\/8\?view=calendar$/);
  }
  await page.mouse.click(x, y + 2 * 72 + 19);
  await expect(page.getByLabel('Start time', { exact: true })).toHaveValue('09:15');
  await expect(page.getByLabel('End time', { exact: true })).toHaveValue('10:15');
});

test('viewers cannot create a selection and touch swipes remain scrolling gestures', async ({ page }) => {
  const { day, x, y } = await emptyDay(page);
  await day.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 9, isPrimary: true, button: 0, clientX: x, clientY: y + 144 });
  await expect(page.locator('.itcal-selection')).toHaveCount(0);
  await page.getByRole('button', { name: 'Prototype', exact: true }).click();
  const controls = page.getByRole('dialog', { name: 'Prototype controls' });
  await controls.getByLabel('View as a fictional participant').selectOption('nora');
  await controls.getByRole('button', { name: 'Close dialog', exact: true }).click();
  const viewerDay = await emptyDay(page);
  await page.mouse.move(viewerDay.x, viewerDay.y + 144);
  await page.mouse.down();
  await page.mouse.move(viewerDay.x, viewerDay.y + 216, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('.itcal-selection')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/8\?view=calendar$/);
});

test('selection scrolls at the edge and remains a valid quarter-hour range', async ({ page }) => {
  const { x, y } = await emptyDay(page);
  const grid = page.locator('.itcal-scroll');
  const bounds = (await grid.boundingBox())!;
  await page.mouse.move(x, y + 3 * 72);
  await page.mouse.down();
  await page.mouse.move(x, bounds.y + bounds.height - 10, { steps: 8 });
  await expect.poll(() => grid.evaluate(el => el.scrollTop)).toBeGreaterThan(80);
  await page.mouse.up();
  await expect(page.getByLabel('Start time', { exact: true })).toHaveValue('10:00');
  const end = await page.getByLabel('End time', { exact: true }).inputValue();
  expect(Number(end.split(':')[1]) % 15).toBe(0);
  expect(end > '10:00').toBe(true);
});

test('short drags create a 15-minute draft and the bottom slot stays within the grid', async ({ page }, info) => {
  const { x, y } = await emptyDay(page);
  await page.mouse.move(x, y + 2 * 72);
  await page.mouse.down();
  await page.mouse.move(x, y + 2 * 72 + 5, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByLabel('Start time', { exact: true })).toHaveValue('09:00');
  await expect(page.getByLabel('End time', { exact: true })).toHaveValue('09:15');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  // Wait for the calendar's return-focus scroll before positioning the bottom slot.
  await expect(page.locator('.itcal-day-header[data-calendar-return-date="2026-10-15"]')).toBeFocused();
  await page.emulateMedia({ colorScheme: 'dark' });
  const grid = page.locator('.itcal-scroll');
  await grid.evaluate(el => { el.scrollIntoView({ block: 'start' }); el.scrollTop = el.scrollHeight; });
  const box = (await page.locator('[data-calendar-date="2026-10-15"]').boundingBox())!;
  await page.mouse.move(box.x + 80, box.y + box.height - 3);
  await page.mouse.down();
  await expect(page.locator('.itcal-selection')).toContainText('9:45 PM – 10:00 PM');
  await page.screenshot({ path: info.outputPath('last-slot-dark.png') });
  await page.mouse.up();
  await expect(page.getByLabel('Start time', { exact: true })).toHaveValue('21:45');
  await expect(page.getByLabel('End time', { exact: true })).toHaveValue('22:00');
});
