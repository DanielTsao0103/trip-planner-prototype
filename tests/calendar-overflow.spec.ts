import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://*.supabase.co/**', route => route.abort());
  await page.route('https://maps.googleapis.com/**', route => route.abort());
  await page.addInitScript(() => sessionStorage.setItem('trip-planner-demo-session', 'active'));
  await page.goto('./#/8?view=calendar');
});

test('the cue follows visible measured overflow across agenda and viewport changes', async ({ page }, testInfo) => {
  const cue = page.locator('.calendar-overflow-hint');
  const grid = page.getByRole('region', { name: 'Scrollable seven-day calendar' });
  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByRole('region', { name: 'Seven-day agenda' })).toBeVisible();
    await expect(cue).toHaveCount(0);
    const viewButton = page.getByRole('button', { name: 'Show time grid', exact: true });
    expect((await viewButton.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`agenda-toolbar-${width}.png`) });
    await page.getByRole('button', { name: 'Show time grid', exact: true }).click();
    await expect(cue).toBeVisible();
    await expect(grid).toHaveAttribute('aria-describedby', await cue.getAttribute('id') || '');
    await expect.poll(() => grid.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
    await grid.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`overflow-${width}.png`) });
    await page.getByRole('button', { name: 'Show agenda', exact: true }).click();
    await expect(cue).toHaveCount(0);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(grid).toBeVisible();
  await expect.poll(() => grid.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await expect(cue).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('desktop-no-overflow.png') });
});

test('overlap changes update the cue without resizing and preserve preview and Move focus', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Pointer and keyboard grid behavior');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    const key = 'trip-planner-demo-v1:demo-maya';
    const state = JSON.parse(localStorage.getItem(key)!);
    const trip = state.trips.find((item: { id: string }) => item.id === state.tripId);
    const original = trip.events.find((item: { id: string }) => item.id === 'museum');
    trip.events.push(...[1, 2].map(index => ({ ...original, id: `overflow-${index}`, name: `Overlapping plan ${index}` })));
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  const cue = page.locator('.calendar-overflow-hint');
  await expect(cue).toBeVisible();
  const title = page.locator('[data-event-id="overflow-1"] .itcal-event-title');
  await title.scrollIntoViewIfNeeded();
  await title.focus();
  await expect(page.getByRole('tooltip')).toContainText('Overlapping plan 1');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await expect(title).toBeFocused();
  await page.keyboard.press('Tab');
  const move = page.getByRole('button', { name: 'Move Overlapping plan 1', exact: true });
  await expect(move).toBeFocused();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Move event', exact: true });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(move).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toContainText('Overlapping plan 1');
  await dialog.getByLabel('New event date').fill('2026-10-18');
  await dialog.getByLabel('New start time').fill('10:07');
  await dialog.getByRole('button', { name: 'Move event', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(cue).toHaveCount(0);
  await expect(move).toBeFocused();
  await page.reload();
  await expect(page.locator('[data-event-id="overflow-1"]')).toHaveAttribute('aria-label', /10:07 AM to 12:07 PM/);
  await page.screenshot({ path: testInfo.outputPath('overlap-resolved.png') });
});

test('Viewer sees only navigation guidance with a readable dark tablet grid', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Prototype', exact: true }).click();
  const controls = page.getByRole('dialog', { name: 'Prototype controls' });
  await controls.getByLabel('View as a fictional participant').selectOption('nora');
  await controls.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.setViewportSize({ width: 768, height: 900 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('.calendar-overflow-hint')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show time grid', exact: true }).click();
  await expect(page.locator('.calendar-overflow-hint')).toBeVisible();
  await expect(page.locator('.calendar-grid-help')).toHaveCount(0);
  await expect(page.getByText('Use Move to change an event’s date or time.', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Move / })).toHaveCount(0);
  const grid = page.getByRole('region', { name: 'Scrollable seven-day calendar' });
  await grid.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('viewer-dark-tablet.png') });
  await page.getByRole('button', { name: 'Show agenda', exact: true }).click();
  await expect(page.locator('.calendar-overflow-hint')).toHaveCount(0);
});

for (const height of [600, 844]) test(`Move restores the visible agenda control after cross-week and same-day saves at ${height}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height });
  await page.evaluate(() => {
    const key = 'trip-planner-demo-v1:demo-maya';
    const state = JSON.parse(localStorage.getItem(key)!);
    state.trips.find((item: { id: string }) => item.id === state.tripId).end = '2026-10-25';
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  const move = page.getByRole('button', { name: 'Move A morning of art', exact: true });
  const dialog = page.getByRole('dialog', { name: 'Move event', exact: true });
  for (const start of ['10:07', '10:17']) {
    await move.click();
    await dialog.getByLabel('New event date').fill('2026-10-24');
    await dialog.getByLabel('New start time').fill(start);
    await dialog.getByRole('button', { name: 'Move event', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(move).toBeFocused();
    await expect(move).toBeInViewport();
    expect(await move.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const bottom = document.querySelector('.mobile-nav')!.getBoundingClientRect().top;
      return bounds.top >= 0 && bounds.bottom <= bottom;
    })).toBe(true);
    await expect(page.locator('.itcal-agenda-event').filter({ hasText: 'A morning of art' })).toContainText(start === '10:07' ? '10:07 AM' : '10:17 AM');
  }
  await move.press('Enter');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(move).toBeFocused();
  await expect(page.locator('.calendar-overflow-hint')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('agenda-move-focus.png') });
});
