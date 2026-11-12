import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Store } from '../src/domain';

const laterDate = '2026-10-27';
const laterEvent = 'calendar-return-later';

/** Exercise only browser-local demo data; external SDKs never reach an account. */
test.beforeEach(async ({ page }, testInfo) => {
  await page.route('https://places.googleapis.com/**', route => route.abort());
  await page.setViewportSize({ width: testInfo.project.name === 'mobile' ? 390 : 1440, height: testInfo.project.name === 'mobile' ? 600 : 900 });
  await page.route('https://*.supabase.co/**', route => route.abort());
  await page.route('https://maps.googleapis.com/**', route => route.abort());
  await page.route('https://photon.komoot.io/**', route => route.abort());
  await page.addInitScript(() => sessionStorage.setItem('trip-planner-demo-session', 'active'));
  await page.goto('./#/8');
  await expect(page.getByRole('heading', { name: 'Seattle & Bainbridge getaway', exact: true })).toBeVisible();
  await page.evaluate(({ laterDate, laterEvent }) => {
    const key = 'trip-planner-demo-v1:demo-maya';
    const state = JSON.parse(localStorage.getItem(key)!) as Store;
    const trip = state.trips[0];
    trip.end = '2026-10-30';
    const original = trip.events.find(event => event.id === 'museum')!;
    trip.events.push({ ...original, id: laterEvent, name: 'Later week evening plan', date: laterDate, start: '20:00', end: '21:00' });
    localStorage.setItem(key, JSON.stringify(state));
  }, { laterDate, laterEvent });
  await page.reload();
});

function visibleEvent(page: Page, id: string): Locator {
  return page.locator(`[data-calendar-return-event="${id}"]:visible`);
}

async function expectRevealed(page: Page, target: Locator): Promise<void> {
  await expect(target).toBeFocused();
  await expect(target).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}

test('adding in week two returns to the saved event and ordinary week paging stays usable', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: 'Next seven days' }).click();
  await page.getByRole('button', { name: `Add event on ${laterDate}` }).click();
  await page.getByLabel('Event name', { exact: true }).fill('Saved second week plan');
  await page.getByRole('combobox', { name: 'Where', exact: true }).fill('Local meeting place');
  await page.getByLabel('Start time', { exact: true }).fill('17:00');
  await page.getByLabel('End time', { exact: true }).fill('18:00');
  await page.getByRole('button', { name: 'Add to itinerary', exact: true }).click();
  await expect(page).toHaveURL(/#\/8\?date=2026-10-27&event=.+&view=calendar$/);
  const id = await page.evaluate(() => new URLSearchParams(location.hash.split('?')[1]).get('event')!);
  await expectRevealed(page, visibleEvent(page, id));
  await page.screenshot({ path: testInfo.outputPath('week-two-save.png') });
  await page.getByRole('button', { name: 'Previous seven days' }).click();
  await expect(page.locator('.itcal-navigation h3')).toContainText('Oct 15');
  await page.getByRole('button', { name: 'Next seven days' }).click();
  await expect(page.locator('.itcal-navigation h3')).toContainText('Oct 22');
  await page.getByRole('button', { name: 'Next seven days' }).click();
  await expect(page.locator('.itcal-navigation h3')).toContainText('Oct 29');
});

test('editing and cancelling a week-two event return to its exact visible card', async ({ page }, testInfo) => {
  await page.goto(`./#/7?date=${laterDate}&event=${laterEvent}&view=calendar`);
  await page.getByLabel('Event name', { exact: true }).fill('Edited later week evening plan');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expectRevealed(page, visibleEvent(page, laterEvent));
  await expect(visibleEvent(page, laterEvent)).toContainText('Edited later week evening plan');
  await page.goto(`./#/7?date=${laterDate}&event=${laterEvent}&view=calendar`);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expectRevealed(page, visibleEvent(page, laterEvent));
  await page.screenshot({ path: testInfo.outputPath('week-two-edit-cancel.png') });
});

test('cancelling an empty later day restores that day and invalid dates safely use week one', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: 'Next seven days' }).click();
  await page.getByRole('button', { name: 'Add event on 2026-10-28' }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const day = page.locator('[data-calendar-return-date="2026-10-28"]:visible');
  await expectRevealed(page, day);
  await page.screenshot({ path: testInfo.outputPath('week-two-empty-day-cancel.png') });
  for (const date of ['', 'invalid', '2026-12-01']) {
    await page.goto(`./#/8?view=calendar&date=${date}`);
    await expect(page.locator('.itcal-navigation h3')).toContainText('Oct 15');
    await page.getByRole('button', { name: 'Next seven days' }).click();
    await expect(page.locator('.itcal-navigation h3')).toContainText('Oct 22');
  }
});

test('saved-event focus follows the visible grid or agenda when changing view and resizing', async ({ page }, testInfo) => {
  await page.goto(`./#/8?view=calendar&date=${laterDate}&event=${laterEvent}`);
  await expectRevealed(page, visibleEvent(page, laterEvent));
  const phone = testInfo.project.name === 'mobile';
  await page.getByRole('button', { name: phone ? 'Show time grid' : 'Show agenda', exact: true }).click();
  await expectRevealed(page, visibleEvent(page, laterEvent));
  await page.screenshot({ path: testInfo.outputPath('alternate-calendar-view.png') });
  // Return to the default representation so crossing the breakpoint swaps it.
  await page.getByRole('button', { name: phone ? 'Show agenda' : 'Show time grid', exact: true }).click();
  await expectRevealed(page, visibleEvent(page, laterEvent));
  await page.setViewportSize({ width: phone ? 1440 : 390, height: phone ? 900 : 600 });
  await expectRevealed(page, visibleEvent(page, laterEvent));
});

test('a restored week retains Move permissions and saves an exact minute', async ({ page }) => {
  await page.evaluate(laterDate => {
    const key = 'trip-planner-demo-v1:demo-maya';
    const state = JSON.parse(localStorage.getItem(key)!) as Store;
    const traveler = state.trips[0].members.find(member => member.id === state.userId)!;
    traveler.role = 'Day Editor';
    traveler.days = [laterDate];
    localStorage.setItem(key, JSON.stringify(state));
  }, laterDate);
  await page.reload();
  await page.goto(`./#/8?view=calendar&date=${laterDate}&event=${laterEvent}`);
  await expectRevealed(page, visibleEvent(page, laterEvent));
  await visibleEvent(page, laterEvent).getByRole('button', { name: 'Move Later week evening plan' }).click();
  const dialog = page.getByRole('dialog', { name: 'Move event', exact: true });
  await dialog.getByLabel('New event date').fill('2026-10-28');
  await dialog.getByRole('button', { name: 'Move event', exact: true }).click();
  await expect(dialog).toContainText('You do not have permission to move events to this day. Choose one of your assigned days.');
  await dialog.getByLabel('New event date').fill(laterDate);
  await dialog.getByLabel('New start time').fill('19:07');
  await dialog.getByRole('button', { name: 'Move event', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.itcal-navigation h3')).toContainText('Oct 22');
  await page.reload();
  await expectRevealed(page, visibleEvent(page, laterEvent));
  await expect(visibleEvent(page, laterEvent)).toHaveAttribute('aria-label', 'Later week evening plan, 7:07 PM to 8:07 PM');
});
