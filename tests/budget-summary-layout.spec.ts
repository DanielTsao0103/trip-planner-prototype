import { test, expect } from '@playwright/test';

// Photo regression: ordinary four-digit amounts overflowed the three-column
// summary when the sidebar left less space than the viewport breakpoint implied.
for (const heading of ['sans', 'serif', 'poppins']) {
  test(`budget figures stay inside their cards with ${heading} headings`, async ({ page }) => {
    await page.route(/https:\/\/(.*\.supabase\.co|maps\.googleapis\.com|places\.googleapis\.com)\//, route => route.abort());
    await page.addInitScript((heading) => {
      sessionStorage.setItem('trip-planner-demo-session', 'active');
      localStorage.setItem('trip-planner-style', JSON.stringify({ theme: 'yellow', mode: 'dark', matchDevice: false, heading, corners: 'soft' }));
    }, heading);
    await page.goto('./#/12');
    await page.evaluate(() => {
      const key = 'trip-planner-demo-v1:demo-maya';
      const store = JSON.parse(localStorage.getItem(key)!);
      const trip = store.trips.find((trip: { id: string }) => trip.id === store.tripId);
      trip.budgetMode = 'group'; trip.budget = 600000;
      trip.expenses = [{ ...trip.expenses[0], amount: 214650, shares: { maya: 214650 } }];
      localStorage.setItem(key, JSON.stringify(store));
    });
    await page.reload();
    await expect(page.locator('.budget-stats')).toContainText('$3,853.50');
    await page.evaluate(() => document.fonts.ready);
    for (const [width, zoom] of [[1280, 1.5], [1280, 2], [1280, 1], [1100, 1], [1000, 1], [900, 1], [800, 1], [768, 1], [720, 1], [640, 1], [480, 1], [390, 1], [320, 1]]) {
      await page.setViewportSize({ width, height: 800 });
      await page.evaluate(zoom => { document.documentElement.style.zoom = String(zoom); }, zoom);
      await expect.poll(() => page.locator('.budget-stats').evaluate(summary => {
        const bounds = summary.getBoundingClientRect();
        return [...summary.querySelectorAll(':scope > div')].every(card => {
          const cell = card.getBoundingClientRect();
          const amount = card.querySelector('strong')!;
          const range = document.createRange(); range.selectNodeContents(amount);
          const text = range.getBoundingClientRect();
          return text.left >= cell.left && text.right <= cell.right + 1 && cell.right <= bounds.right + 1;
        });
      }), `Amounts must fit their own cards at ${width}px`).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
    // Over-budget state and the largest allowed budget must retain all cents too.
    await page.evaluate(() => {
      const key = 'trip-planner-demo-v1:demo-maya'; const store = JSON.parse(localStorage.getItem(key)!);
      const trip = store.trips.find((trip: { id: string }) => trip.id === store.tripId);
      trip.budget = 99999999;
      const expense = trip.expenses[0];
      trip.expenses = Array.from({ length: 11 }, (_, index) => ({ ...expense, id: `large-${index}`, amount: index < 10 ? 9999999 : 1009, shares: { maya: index < 10 ? 9999999 : 1009 } }));
      localStorage.setItem(key, JSON.stringify(store));
    });
    await page.reload();
    for (const width of [1440, 1280, 1200, 1100, 1024, 1000, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 800 });
      for (const value of await page.locator('.budget-stats strong').all()) {
        expect(await value.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
        await expect(value).toHaveCSS('white-space', 'nowrap');
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
  });
}
