import { expect, test } from '@playwright/test';

/** CSS enlargement stresses the space left by the rail; it is not native zoom. */
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => sessionStorage.setItem('trip-planner-demo-session', 'active'));
  await page.route('https://maps.googleapis.com/**', route => route.abort());
});

test('enlarged calendar controls remain separate and can switch planning view', async ({ page }) => {
  await page.goto('./#/8?view=calendar');
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  const views = page.getByRole('group', { name: 'Itinerary view' });
  const nearby = page.getByRole('button', { name: 'Nearby suggestions', exact: true });
  const tabs = await views.boundingBox();
  const action = await nearby.boundingBox();
  expect(tabs).not.toBeNull();
  expect(action).not.toBeNull();
  expect(action!.y).toBeGreaterThanOrEqual(tabs!.y + tabs!.height);
  await views.getByRole('button', { name: 'Map & list', exact: true }).click();
  await expect(page.locator('.itinerary-day-list')).toBeVisible();
});

test('enlarged event editor retains a usable field width and uncovered input', async ({ page }) => {
  await page.goto('./#/7');
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  const name = page.getByLabel('Event name', { exact: true });
  await name.fill('A readable afternoon plan');
  await expect(name).toHaveValue('A readable afternoon plan');
  expect((await name.boundingBox())!.width).toBeGreaterThan(500);
  const field = await name.boundingBox();
  const actions = await page.locator('.event-editor-actions').boundingBox();
  expect(actions!.y).toBeGreaterThan(field!.y + field!.height);
});

test('enlarged preferences and style stack without overlapping their controls', async ({ page }) => {
  await page.goto('./#/15');
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  const nav = await page.locator('.survey-nav').boundingBox();
  const form = await page.locator('.survey-layout > .form-card').boundingBox();
  expect(form!.y).toBeGreaterThanOrEqual(nav!.y + nav!.height);
  expect(form!.width).toBeGreaterThan(600);
  await page.getByRole('button', { name: /Places & pace/ }).click();
  await expect(page.getByLabel('Maximum comfortable continuous walk (meters)')).toBeVisible();
  await page.goto('./#/18');
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  const preview = await page.locator('.style-side').boundingBox();
  const controls = await page.locator('.style-controls').boundingBox();
  expect(controls!.y).toBeGreaterThanOrEqual(preview!.y + preview!.height);
});
