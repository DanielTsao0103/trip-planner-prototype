import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route(/https:\/\/(.*\.supabase\.co|maps\.googleapis\.com|places\.googleapis\.com)\//, route => route.abort());
  await page.addInitScript(() => sessionStorage.setItem('trip-planner-demo-session', 'active'));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./#/8?view=calendar');
  await expect(page.locator('.itcal-scroll')).toBeVisible();
  // A full week without overlapping events isolates responsive day-column sizing.
  await page.evaluate(() => {
    const key = 'trip-planner-demo-v1:demo-maya';
    const state = JSON.parse(localStorage.getItem(key)!);
    const trip = state.trips.find((item: { id: string }) => item.id === state.tripId);
    trip.end = '2026-10-25';
    trip.events = [];
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
});

test('phones open a readable calendar and landscape fits several whole days', async ({ page }, info) => {
  const grid = page.locator('.itcal-scroll');
  await expect(grid).toBeVisible();
  await expect(page.getByRole('region', { name: 'Seven-day agenda' })).toBeHidden();
  for (const [width, height, minimumDays] of [[320, 700, 1], [390, 844, 1], [844, 390, 3], [1024, 768, 3]]) {
    await page.setViewportSize({ width, height });
    await expect.poll(() => grid.evaluate(el => {
      const header = el.querySelector('.itcal-day-header')!.getBoundingClientRect();
      return (el.clientWidth - 64) / header.width;
    })).toBeGreaterThanOrEqual(minimumDays - 0.01);
    await expect.poll(() => grid.evaluate(el => {
      const count = (el.clientWidth - 64) / el.querySelector('.itcal-day-header')!.getBoundingClientRect().width;
      return Math.abs(count - Math.round(count));
    })).toBeLessThan(0.01);
    const geometry = await grid.evaluate(el => {
      const day = el.querySelector('.itcal-day-header')!.getBoundingClientRect();
      const count = (el.clientWidth - 64) / day.width;
      return { width: day.width, count, overflow: document.documentElement.scrollWidth - innerWidth };
    });
    expect(geometry.width).toBeGreaterThanOrEqual(180);
    expect(Math.abs(geometry.count - Math.round(geometry.count))).toBeLessThan(0.01);
    expect(geometry.overflow).toBeLessThanOrEqual(1);
    await grid.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`calendar-${width}x${height}.png`) });
  }
});

test('rotation retains the swiped-to day and vertical time position', async ({ page }) => {
  const grid = page.locator('.itcal-scroll');
  const day = page.locator('.itcal-day-header[data-calendar-return-date="2026-10-17"]');
  await expect(day).toBeVisible();
  await grid.evaluate(el => {
    const target = el.querySelector('[data-calendar-return-date="2026-10-17"]')!;
    el.scrollLeft += target.getBoundingClientRect().left - el.getBoundingClientRect().left - el.clientLeft - 64;
    el.scrollTop = 250;
  });
  for (const size of [{ width: 844, height: 390 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    await expect.poll(() => day.evaluate(el => {
      const region = el.closest('.itcal-scroll')!;
      return Math.abs(el.getBoundingClientRect().left - region.getBoundingClientRect().left - region.clientLeft - 64);
    })).toBeLessThan(2);
    await expect.poll(() => grid.evaluate(el => el.scrollTop)).toBe(250);
  }
  await day.getByRole('button', { name: 'Add event on 2026-10-17' }).click();
  await expect(page).toHaveURL(/#\/7\?date=2026-10-17&view=calendar$/);
  await expect(page.getByRole('combobox', { name: 'Day', exact: true })).toHaveValue('2026-10-17');
});
