import { expect, test } from '@playwright/test';

const name = 'Sunset waterfront walk with the whole group and a relaxed farewell picnic';
const place = 'Meet at the waterfront museum north entrance, beneath the blue awning beside the ferry terminal';

/** Browser-local dense itinerary; every external account request is blocked. */
test.beforeEach(async ({ page }) => {
  await page.route('https://*.supabase.co/**', route => route.abort());
  await page.route('https://maps.googleapis.com/**', route => route.abort());
  await page.addInitScript(() => sessionStorage.setItem('trip-planner-demo-session', 'active'));
  await page.goto('./#/8?view=calendar');
  await page.evaluate(({ name, place }) => {
    const key = 'trip-planner-demo-v1:demo-maya', state = JSON.parse(localStorage.getItem(key)!);
    const trip = state.trips.find((item: { id: string }) => item.id === state.tripId);
    const original = trip.events.find((item: { id: string }) => item.id === 'museum');
    trip.events.push(...Array.from({ length: 5 }, (_, index) => ({ ...original,
      id: `preview-${index}`, name: index ? `Another overlapping plan ${index}` : name,
      place, start: '10:00', end: '10:20' })));
    localStorage.setItem(key, JSON.stringify(state));
  }, { name, place });
  await page.reload();
  await page.evaluate(() => document.fonts.ready);
});

test('dense titles expose hoverable details and keyboard Escape without changing Move', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Desktop pointer and keyboard grid');
  await page.setViewportSize({ width: 1440, height: 900 });
  const title = page.locator('[data-event-id="preview-0"] .itcal-event-title');
  await title.scrollIntoViewIfNeeded();
  await title.hover();
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toContainText(name);
  await expect(tooltip).toContainText(place);
  await expect(tooltip).toContainText('10:00 AM – 10:20 AM');
  await tooltip.hover();
  await page.waitForTimeout(300);
  await expect(tooltip).toBeVisible();
  await page.screenshot({ path: test.info().outputPath(`desktop-hover.png`) });
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0);
  await page.mouse.move(0, 0);
  await title.focus();
  await expect(tooltip).toBeVisible();
  await expect(title).toBeFocused();
  await page.screenshot({ path: test.info().outputPath(`desktop-keyboard.png`) });
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0);
  await expect(title).toBeFocused();
  await page.waitForTimeout(300);
  await expect(tooltip).toHaveCount(0);
  await page.keyboard.press('Tab');
  const move = page.getByRole('button', { name: `Move ${name}`, exact: true });
  await expect(move).toBeFocused();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Move event', exact: true });
  await dialog.getByLabel('New event date').fill('2026-10-18');
  await dialog.getByLabel('New start time').fill('10:07');
  await dialog.getByRole('button', { name: 'Move event', exact: true }).click();
  await page.reload();
  await expect(page.locator('[data-event-id="preview-0"]')).toHaveAttribute('aria-label', /10:07 AM to 10:27 AM/);
  await title.click();
  await expect(page).toHaveURL(/#\/7\?event=preview-0&date=2026-10-18&view=calendar$/);
});

test('one bounded preview survives mixed input and changing viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Desktop bounds and focus arbitration');
  await page.setViewportSize({ width: 1440, height: 900 });
  const first = page.locator('[data-event-id="preview-0"] .itcal-event-title');
  const second = page.locator('[data-event-id="preview-1"] .itcal-event-title');
  await first.scrollIntoViewIfNeeded();
  await first.hover();
  await expect(page.getByRole('tooltip')).toContainText(name);
  await second.focus();
  await page.mouse.move(0, 0);
  await expect(page.getByRole('tooltip')).toHaveCount(1);
  await expect(page.getByRole('tooltip')).toContainText('Another overlapping plan 1');
  for (const width of [1440, 1024, 768]) {
    await page.setViewportSize({ width, height: 600 });
    if (!await second.isVisible()) await page.getByRole('button', { name: 'Show time grid', exact: true }).click();
    await second.scrollIntoViewIfNeeded();
    await second.focus();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeInViewport({ ratio: 1 });
    expect(await tooltip.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 12 && r.right <= innerWidth - 11 && r.top >= 12 && r.bottom <= innerHeight - 11; })).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`bounded-${width}.png`) });
  }
  const edge = page.locator('[data-event-id="preview-4"] .itcal-event-title');
  await edge.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'end' }));
  await edge.focus();
  await expect(page.getByRole('tooltip')).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: test.info().outputPath(`right-edge.png`) });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: test.info().outputPath(`dark-768.png`) });
  await page.getByRole('button', { name: 'Show agenda', exact: true }).click();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
});

test('phone agenda keeps full event details and has no hover preview', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Touch agenda');
  await page.setViewportSize({ width: 390, height: 844 });
  const card = page.locator('.itcal-agenda-event').filter({ hasText: name });
  await card.scrollIntoViewIfNeeded();
  await expect(card).toContainText(place);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath(`phone-agenda.png`) });
  await page.setViewportSize({ width: 320, height: 600 });
  await card.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath(`phone-agenda-320.png`) });
  await card.getByRole('button').first().click();
  await expect(page).toHaveURL(/#\/11\?event=preview-0&date=2026-10-16$/);
});

test('a long saved location remains bounded and keyboard-scrollable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Keyboard preview content');
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.evaluate(() => {
    const key = 'trip-planner-demo-v1:demo-maya', state = JSON.parse(localStorage.getItem(key)!);
    const trip = state.trips.find((item: { id: string }) => item.id === state.tripId);
    trip.events.find((item: { id: string }) => item.id === 'preview-0').place = 'Detailed arrival directions and accessible waterfront meeting point. '.repeat(30);
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  const title = page.locator('[data-event-id="preview-0"] .itcal-event-title');
  if (!await title.isVisible()) await page.getByRole('button', { name: 'Show time grid', exact: true }).click();
  await title.scrollIntoViewIfNeeded();
  await title.focus();
  const tooltip = page.getByRole('tooltip');
  await expect(tooltip).toBeInViewport({ ratio: 1 });
  await page.keyboard.press('PageDown');
  expect(await tooltip.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await expect(title).toBeFocused();
  await page.screenshot({ path: test.info().outputPath(`long-location-keyboard.png`) });
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0);
});
