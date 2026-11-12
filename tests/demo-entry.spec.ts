import { expect, test, type Page } from '@playwright/test';

async function prototype(page: Page) {
  if (!await page.getByRole('button', { name: 'Prototype', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click();
  await page.getByRole('button', { name: 'Prototype', exact: true }).click();
}

test('explicit Maya entry resets only the participant while refresh retains it and saved demo work survives', async ({ page }) => {
  await page.route('https://*.supabase.co/**', route => route.fulfill({ json: [] }));
  await page.route('https://maps.googleapis.com/maps/api/js?**', route => route.abort());
  await page.goto('./');
  await page.getByRole('button', { name: 'Try demo as Maya', exact: true }).click();
  await page.goto('./#/12');
  await page.getByRole('button', { name: 'Add expense', exact: true }).click();
  await page.getByLabel('What was it for?', { exact: true }).fill('Retained demo lunch');
  await page.getByLabel('Amount (USD)', { exact: true }).fill('18');
  await page.getByRole('button', { name: 'Save expense', exact: true }).click();
  for (const exit of ['prototype', 'exit']) {
    await prototype(page);
    await page.getByLabel('View as a fictional participant', { exact: true }).selectOption('nora');
    await page.keyboard.press('Escape');
    await page.reload();
    await expect(page.getByRole('button', { name: 'Account and preferences' })).toContainText('NP');
    if (exit === 'prototype') {
      await prototype(page);
      await page.getByRole('button', { name: 'Start at Log in / Create account', exact: true }).click();
    } else await page.getByRole('button', { name: 'Exit demo', exact: true }).click();
    await page.getByRole('button', { name: 'Try demo as Maya', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Account and preferences' })).toContainText('MC');
    await expect(page.getByText('You have view-only access to the shared itinerary.', { exact: true })).toHaveCount(0);
    await page.goto('./#/12');
    await expect(page.locator('.expense-row').filter({ hasText: 'Retained demo lunch' })).toHaveCount(1);
  }
});

test('explicit demo entry chooses an accessible trip without deleting another participant’s work', async ({ page }) => {
  await page.route('https://*.supabase.co/**', route => route.fulfill({ json: [] }));
  await page.route('https://maps.googleapis.com/maps/api/js?**', route => route.abort());
  await page.goto('./');
  await page.getByRole('button', { name: 'Try demo as Maya', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Account and preferences' })).toBeVisible();
  await page.evaluate(() => {
    const key = 'trip-planner-demo-v1:demo-maya';
    const state = JSON.parse(localStorage.getItem(key)!);
    const trip = structuredClone(state.trips[0]);
    trip.id = 'nora-private-demo'; trip.title = 'Nora’s separate demo plan'; trip.sample = false;
    trip.members = [{ ...trip.members.find((person: { id: string }) => person.id === 'nora'), role: 'Owner' }];
    trip.events = []; trip.expenses = []; trip.prefs = {}; trip.individual = {};
    state.trips.push(trip); state.userId = 'nora'; state.tripId = trip.id;
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Account and preferences' })).toContainText('NP');
  await page.getByRole('button', { name: 'Exit demo', exact: true }).click();
  await page.getByRole('button', { name: 'Try demo as Maya', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Account and preferences' })).toContainText('MC');
  await expect(page.getByRole('heading', { name: 'Seattle & Bainbridge getaway', exact: true })).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('trip-planner-demo-v1:demo-maya')!));
  expect(saved.trips.some((trip: { id: string }) => trip.id === 'nora-private-demo')).toBe(true);
});
