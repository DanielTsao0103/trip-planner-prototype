import { expect, type Locator } from '@playwright/test';

/** Check rendered edges so changes to labels, buttons or field height cannot hide an overlap. */
export async function expectUnderInput(input: Locator, popup: Locator, align: 'both' | 'left' | 'right' = 'both') {
  await expect(popup).toBeVisible();
  const [field, menu] = await Promise.all([input.boundingBox(), popup.boundingBox()]);
  if (!field || !menu) throw new Error('Input or popup is missing');
  const gap = menu.y - (field.y + field.height);
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThanOrEqual(6);
  if (align !== 'right') expect(Math.abs(menu.x - field.x)).toBeLessThan(1);
  if (align !== 'left') expect(Math.abs(menu.x + menu.width - field.x - field.width)).toBeLessThan(1);
}
