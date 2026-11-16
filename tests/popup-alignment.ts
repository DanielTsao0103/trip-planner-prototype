import { expect, type Locator } from '@playwright/test';

/** Check rendered edges so changes to labels, buttons or field height cannot hide an overlap. */
export async function expectUnderInput(input: Locator, popup: Locator, align: 'both' | 'left' | 'right' = 'both') {
  await expect(popup).toBeVisible();
  const inputElement = await input.elementHandle();
  if (!inputElement) throw new Error('Input is missing');
  // A calendar can scroll its field into view after opening. Measure both edges
  // in one browser frame instead of combining rectangles from different scrolls.
  const {field, menu} = await popup.evaluate((element, fieldElement) => ({
    field: fieldElement!.getBoundingClientRect().toJSON(),
    menu: element.getBoundingClientRect().toJSON(),
  }), inputElement);
  await inputElement.dispose();
  const gap = menu.y - (field.y + field.height);
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThanOrEqual(6);
  if (align !== 'right') expect(Math.abs(menu.x - field.x)).toBeLessThan(1);
  if (align !== 'left') expect(Math.abs(menu.x + menu.width - field.x - field.width)).toBeLessThan(1);
}
