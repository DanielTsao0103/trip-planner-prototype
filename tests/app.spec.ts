import { expectUnderInput } from './popup-alignment';
import { test, expect, type Page } from '@playwright/test';

const account = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'qa@example.com', email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { name: 'QA Traveler' }, created_at: '2026-01-01T00:00:00Z' };
const session = () => ({ access_token: 'test-access-token', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'test-refresh-token', user: account });

// Exercise the real SDK/UI boundary without writing users or trips to the real project.
test.beforeEach(async ({ page }) => {
  await page.route('https://places.googleapis.com/**', route => route.abort());
  await page.route('https://*.supabase.co/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/rest/v1/forwarded_booking') return route.fulfill({ json: [] });
    if (url.pathname === '/rest/v1/user_style') return route.fulfill({ json: [] });
    // These account journeys use a regular traveler; admin authorization has its own suite.
    if (url.pathname === '/rest/v1/rpc/is_admin') return route.fulfill({ json: false });
    if (url.pathname === '/rest/v1/rpc/trip_companion_pictures') return route.fulfill({ json: [] });
    // Signed-in accounts ask once whether to show the Admin link; these QA accounts are not admins.
    if (url.pathname === '/rest/v1/rpc/is_admin') return route.fulfill({ json: false });
    if (url.pathname === '/rest/v1/rpc/set_google_picture') return route.fulfill({ status: 204 });
    if (url.pathname === '/rest/v1/user' && route.request().method() === 'GET') return route.fulfill({ json: [] });
    if (url.pathname === '/rest/v1/rpc/load_trip_bundles' || (url.pathname === '/rest/v1/trip' && route.request().method() === 'GET')) return route.fulfill({ json: [] });
    if (url.pathname.startsWith('/auth/v1/')) {
      if (url.pathname.endsWith('/settings')) return route.fulfill({json: {external: {apple:false}}});
      if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204 });
      if (url.pathname.endsWith('/user')) return route.fulfill({ json: account });
      if (url.pathname.endsWith('/signup')) return route.fulfill({ json: session() });
      if (url.pathname.endsWith('/token')) {
        const data = route.request().postDataJSON();
        if (data.password === 'wrong-password') return route.fulfill({ status: 400, json: { code: 'invalid_credentials', msg: 'Invalid login credentials' } });
        return route.fulfill({ json: session() });
      }
    }
    throw new Error(`Unexpected Supabase operation: ${url.pathname}`);
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    if (new URL(response.url()).origin === 'http://127.0.0.1:4173' && response.status() >= 400) errors.push(`Asset request failed: ${response.url()}`);
  });
  // Persisted or routing errors must fail even when a screenshot would appear fine.
  (page as Page & { qaErrors: string[] }).qaErrors = errors;
});
test.afterEach(async ({ page }) => {
  expect((page as Page & { qaErrors: string[] }).qaErrors).toEqual([]);
});
async function demo(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: 'Try demo as Maya', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Seattle & Bainbridge getaway', exact: true })).toBeVisible();
}
async function login(page: Page) {
  await page.goto('./');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill('prototype-test-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
}
async function controls(page: Page) {
  if (!await page.getByRole("button", { name: "Prototype", exact: true }).isVisible()) await page.getByRole("button", { name: "Open navigation menu", exact: true }).click();
  await page.getByRole('button', { name: 'Prototype', exact: true }).click();
  return page.getByRole('dialog', { name: 'Prototype controls' });
}
async function openAccount(page: Page) {
  await page.getByRole('button', { name: 'Account and preferences', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Account', exact: true, level: 1 })).toBeVisible();
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

test('destination suggestions and both calendars open directly below their fields', async ({ page }) => {
  await page.route('**/functions/v1/unsplash-search**', route => route.fulfill({ json: { results: [] } }));
  await page.route('https://geocoding-api.open-meteo.com/**', route => route.fulfill({ json: { results: [{ name: 'France', timezone: 'Europe/Paris' }] } }));
  await demo(page);
  await page.goto('./#/6');
  // A pointer left over the new menu can select an option before keyboard input.
  await page.mouse.move(0, 0);
  const destination = page.getByRole('combobox', { name: 'Where are you going?' });
  await destination.fill('France');
  const menu = page.locator('.destination-menu');
  await expectUnderInput(destination, menu);
  await expect(menu.getByRole('option').first()).toBeVisible();
  await destination.press('ArrowDown');
  await expect(menu.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
  await destination.press('Enter');
  await expect(menu).toBeHidden();
  await expect(destination).toHaveValue('');
  const addedDestinations = page.locator('.trip-editor-form .chips .chip');
  await expect(addedDestinations).toHaveCount(1);
  // Pointer selection uses the same commit path and must not duplicate a place.
  await destination.fill('France');
  await menu.getByRole('option').first().click();
  await expect(addedDestinations).toHaveCount(1);
  await expect(destination).toHaveValue('');
  for (const [label, edge] of [['Start date', 'left'], ['End date', 'right']] as const) {
    const date = page.getByLabel(label, { exact: true });
    await date.click();
    const calendar = page.getByRole('dialog', { name: label + ' calendar' });
    await expectUnderInput(date, calendar, edge);
    await calendar.getByRole('button', { name: 'Next month' }).click();
    await calendar.locator('.date-day:enabled').first().click();
    await expect(calendar).toBeHidden();
    await expect(date).not.toHaveValue('');
  }
});

test('trip photo search follows the chosen destination and keeps two to five options', async ({ page }) => {
  const searches: string[] = [];
  let trackedLocation = '';
  await page.route('**/functions/v1/unsplash-track', route => {
    trackedLocation = route.request().postDataJSON().downloadLocation;
    return route.fulfill({ json: { tracked: true } });
  });
  await page.route('**/functions/v1/unsplash-search?**', route => {
    const searchUrl = new URL(route.request().url());
    const destination = searchUrl.searchParams.get('query') || '';
    expect(searchUrl.searchParams.get('per_page')).toBe('30');
    searches.push(destination);
    const count = destination === 'Spain' ? 6 : destination === 'France' ? 2 : 1;
    return route.fulfill({ json: { results: Array.from({ length: count }, (_, index) => ({
      id: `${destination}-${index}`,
      width: destination === 'Spain' && index === 0 ? 600 : 1200,
      height: 800,
      urls: { regular: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"/>')}` },
      alt_description: `${destination} photo ${index + 1}`,
      user: { name: `Photographer ${index + 1}`, links: { html: `https://unsplash.com/@photographer${index + 1}` } },
      links: {
        html: `https://unsplash.com/photos/${destination}-${index}`,
        download_location: `https://api.unsplash.com/photos/${destination}-${index}/download?ixid=${destination}-${index}`,
      },
    })) } });
  });
  await demo(page);
  await page.goto('./#/6');
  const destinationInput = page.getByLabel('Where are you going?', { exact: true });
  await destinationInput.fill('Spain');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByLabel('Photos for')).toHaveCount(0);
  await expect(page.locator('.trip-photo-options button')).toHaveCount(5);
  await page.locator('.trip-photo-disclosure > summary').click();
  await expect(page.locator('.trip-photo-options img').first()).toHaveAttribute('alt', 'Spain photo 2');
  await destinationInput.fill('France');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByLabel('Photos for')).toHaveValue('Spain');
  await page.getByLabel('Photos for').selectOption('France');
  await expect(page.locator('.trip-photo-options button')).toHaveCount(2);
  await expect(page.locator('.trip-photo-options img').first()).toHaveAttribute('alt', 'France photo 1');
  await expect(page.getByText('Photos on Unsplash. Choose one or upload your own.')).toBeVisible();
  expect(searches).toEqual(['Spain', 'France']);
  await page.screenshot({ path: test.info().outputPath('destination-photo-picker.png'), fullPage: true });
  await destinationInput.fill('Italy');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByLabel('Photos for').selectOption('Italy');
  await expect(page.locator('.trip-photo-options button')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Not enough matching photos found');
  await page.getByRole('button', { name: 'Remove Italy' }).click();
  await expect(page.getByLabel('Photos for')).toHaveValue('Spain');
  await page.getByRole('button', { name: 'Remove France' }).click();
  await expect(page.getByLabel('Photos for')).toHaveCount(0);
  await expect(page.locator('.trip-photo-options button')).toHaveCount(5);
  await page.locator('.trip-photo-options button').first().click();
  await page.getByLabel('Trip title', { exact: true }).fill('Spain escape');
  await page.getByLabel('Start date', { exact: true }).fill('2027-05-01');
  await page.getByLabel('End date', { exact: true }).fill('2027-05-04');
  await page.getByLabel('End date', { exact: true }).press('Escape');
  await page.getByRole('button', { name: 'Create trip', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Spain escape' })).toBeVisible();
  expect(trackedLocation).toBe('https://api.unsplash.com/photos/Spain-1/download?ixid=Spain-1');
});

test('login shows neutral copy, the Google button (Apple is hidden for now), and recoverable auth errors', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Welcome to Stir Crazy', exact: true })).toBeVisible();
  const google = page.getByRole('button', { name: 'Sign in with Google', exact: true });
  await expect(google.locator('img')).toBeVisible();
  expect(await google.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  await expect(page.getByRole('button', { name: 'Sign in with Apple', exact: true })).toHaveCount(0);
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Invalid login credentials');
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeEnabled();
  await noOverflow(page);
});

test('Google sign-in starts Supabase OAuth with PKCE and returns to this page', async ({ page }) => {
  let authorize: URL | undefined;
  // Registered after the shared mock, so it wins. Stop at Supabase instead of reaching Google.
  await page.route('https://*.supabase.co/auth/v1/authorize**', route => {
    authorize = new URL(route.request().url());
    return route.fulfill({ contentType: 'text/html', body: '<h1>Google consent screen</h1>' });
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'Sign in with Google', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Google consent screen' })).toBeVisible();
  expect(authorize?.searchParams.get('provider')).toBe('google');
  const returnTo = new URL(authorize!.searchParams.get('redirect_to')!);
  const base = new URL(test.info().project.use.baseURL!);
  expect(returnTo.origin).toBe(base.origin);
  expect(returnTo.pathname).toBe(base.pathname);
  // PKCE keeps the result in ?code=..., so it cannot collide with #/page routing.
  expect(authorize?.searchParams.get('code_challenge')).toBeTruthy();
  expect(authorize?.searchParams.get('code_challenge_method')).toBe('s256');
});

test('a failed Google return shows the reason and cleans the address bar', async ({ page }) => {
  await page.goto('./?error=access_denied&error_code=bad_oauth_callback&error_description=Access+blocked');
  await expect(page.getByRole('alert')).toContainText('Sign-in didn’t finish: Access blocked');
  expect(page.url()).not.toContain('error_description');
  await expect(page.getByRole('button', { name: 'Sign in with Google', exact: true })).toBeEnabled();
});

test('signup opens the app immediately, persists the session, and signs out', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'New here? Create an account', exact: true }).click();
  await page.getByLabel('Your name', { exact: true }).fill(account.user_metadata.name);
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill('prototype-test-password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await openAccount(page);
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome to Stir Crazy' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome to Stir Crazy' })).toBeVisible();
});

test('demo core screens render and sample trips survive refresh', async ({ page }) => {
  await demo(page);
  for (const route of [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 17]) {
    await page.goto(`./#/${route}`);
    await expect(page.locator('#main-content')).toBeVisible();
    await expect(page.locator('#main-content').getByRole('heading').first()).toBeVisible();
    await noOverflow(page);
  }
  await page.goto('./#/5');
  for (const title of ['Seattle & Bainbridge getaway', 'A weekend by the coast', 'Chicago, a little later']) {
    await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: `Delete trip: ${title}`, exact: true })).toHaveCount(0);
  }
  await page.reload();
  await expect(page.getByRole('button', { name: 'Seattle & Bainbridge getaway', exact: true })).toBeVisible();
});

test('created trips survive reload and logout, deletion preserves the samples', async ({ page }) => {
  await page.route('**/functions/v1/unsplash-search**', route => route.fulfill({json: {results: []}}));
  await page.route('https://geocoding-api.open-meteo.com/**', route => route.fulfill({json: {results: [{name: 'Taipei', timezone: 'Asia/Taipei'}]}}));
  await demo(page);
  await page.goto('./#/5');
  await page.getByRole('button', { name: 'New trip', exact: true }).click();
  await page.getByLabel('Trip title', { exact: true }).fill('QA weekend');
  await page.getByLabel('Where are you going?', { exact: true }).fill('Taipei');
  await page.getByLabel('Start date', { exact: true }).fill('2027-05-01');
  await page.getByLabel('End date', { exact: true }).fill('2027-05-04');
  await page.getByRole('button', { name: 'Create trip', exact: true }).click();
  await expect(page.getByRole('button', { name: 'QA weekend', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'QA weekend', exact: true })).toBeVisible();
  await openAccount(page);
  await page.locator('.account-page').getByRole('button', { name: 'Exit demo', exact: true }).click();
  await page.getByRole('button', { name: 'Try demo as Maya', exact: true }).click();
  await page.goto('./#/5');
  await expect(page.getByRole('button', { name: 'QA weekend', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete trip: QA weekend', exact: true }).click();
  await page.getByRole('button', { name: 'Keep trip', exact: true }).click();
  await expect(page.getByRole('button', { name: 'QA weekend', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete trip: QA weekend', exact: true }).click();
  await page.getByRole('dialog', { name: 'Delete this trip?' }).getByRole('button', { name: 'Delete trip', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'QA weekend', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Seattle & Bainbridge getaway', exact: true })).toBeVisible();
});

test('itinerary defaults to Calendar and List pages through 7, 10, or 20 days', async ({ page }) => {
  await page.route('**/functions/v1/unsplash-search**', route => route.fulfill({json: {results: []}}));
  await page.route('https://geocoding-api.open-meteo.com/**', route => route.fulfill({json: {results: [{name: 'Taipei', timezone: 'Asia/Taipei'}]}}));
  await page.route('https://maps.googleapis.com/maps/api/js?**', route => route.abort());
  await demo(page);
  await page.goto('./#/8');
  await expect(page.getByRole('button', { name: 'Calendar', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.locator('.day-page-controls')).toHaveCount(0);
  await expect(page.locator('.day-chips a')).toHaveCount(4);
  await expect(page.locator('.day-section')).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Next days' })).toHaveCount(0);

  await page.goto('./#/5');
  await page.getByRole('button', { name: 'New trip', exact: true }).click();
  await page.getByLabel('Trip title', { exact: true }).fill('Paging QA');
  await page.getByLabel('Where are you going?', { exact: true }).fill('Taipei');
  await page.getByLabel('Start date', { exact: true }).fill('2027-05-01');
  await page.getByLabel('End date', { exact: true }).fill('2027-05-23');
  await page.getByRole('button', { name: 'Create trip', exact: true }).click();
  await page.getByRole('button', { name: 'Paging QA', exact: true }).click();
  await page.getByRole('button', { name: 'List', exact: true }).click();

  const pages = page.getByRole('navigation', { name: 'Itinerary day pages', exact: true });
  const bottomPages = page.locator('.day-page-controls-bottom');
  const tiles = page.locator('.day-chips a');
  const sections = page.locator('.day-section');
  const pageSize = page.getByRole('combobox', { name: 'Days to show', exact: true });
  await expect(pageSize).toHaveValue('7');
  for (const size of [7, 10, 20]) {
    await pageSize.selectOption(String(size));
    // Changing page size retains the viewed day; return to the start for this full-range traversal.
    while (await pages.getByRole('button', { name: 'Previous days' }).isEnabled())
      await pages.getByRole('button', { name: 'Previous days' }).click();
    await expect(pages.getByRole('button', { name: 'Previous days' })).toBeDisabled();
    await expect(bottomPages.getByRole('button', { name: 'Previous days' })).toBeDisabled();
    for (let start = 1; start <= 23; start += size) {
      const end = Math.min(start + size - 1, 23);
      const range = `Days ${start}–${end} of 23`;
      await expect(pages).toContainText(range);
      await expect(bottomPages).toContainText(range);
      await expect(tiles).toHaveCount(end - start + 1);
      await expect(sections).toHaveCount(end - start + 1);
      await expect(tiles.first()).toContainText(`Day ${start}`);
      await expect(tiles.last()).toContainText(`Day ${end}`);
      await expect(sections.first()).toHaveAttribute('id', `day-2027-05-${String(start).padStart(2, '0')}`);
      await expect(sections.last()).toHaveAttribute('id', `day-2027-05-${String(end).padStart(2, '0')}`);
      if (end < 23) await pages.getByRole('button', { name: 'Next days' }).click();
      else {
        await expect(pages.getByRole('button', { name: 'Next days' })).toBeDisabled();
        await expect(bottomPages.getByRole('button', { name: 'Next days' })).toBeDisabled();
      }
    }
    await bottomPages.getByRole('button', { name: 'Previous days' }).click();
    const previousStart = (Math.ceil(23 / size) - 2) * size + 1;
    await expect(pages).toContainText(`Days ${previousStart}–${previousStart + size - 1} of 23`);
    // Bottom paging must bring keyboard and visual context to the new page,
    // rather than leave the traveler at the end of a different set of dates.
    await expect(sections.first()).toBeFocused();
    await expect(sections.first().locator('.day-title')).toBeInViewport({ ratio: 1 });
    await bottomPages.getByRole('button', { name: 'Next days' }).click();
    const finalStart = Math.floor(22 / size) * size + 1;
    await expect(pages).toContainText(`Days ${finalStart}–23 of 23`);
    await expect(bottomPages).toContainText(`Days ${finalStart}–23 of 23`);
    await expect(sections.first()).toHaveAttribute('id', `day-2027-05-${String(finalStart).padStart(2, '0')}`);
    await expect(sections.first()).toBeFocused();
    await expect(sections.first().locator('.day-title')).toBeInViewport({ ratio: 1 });
    await expect(bottomPages.getByRole('button', { name: 'Next days' })).toBeDisabled();
    await page.getByLabel('Jump to day', { exact: true }).selectOption('2027-05-23');
    await expect(page.locator('#day-2027-05-23')).toBeInViewport();
    await expect(pages).toContainText(`Days ${Math.floor(22 / size) * size + 1}–23 of 23`);
    await noOverflow(page);
  }

  await noOverflow(page);
});

test('prototype start-at-login actually exits demo and remains signed out after reload', async ({ page }) => {
  for (const entry of ['Start at Log in / Create account', '01 Log in / Create account']) {
    await demo(page);
    const dialog = await controls(page);
    if (entry.startsWith("01") && await dialog.getByRole("button", {name:"Screens",exact:true}).isVisible()) await dialog.getByRole("button", {name:"Screens",exact:true}).click();
    await dialog.getByRole('button', { name: entry, exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Welcome to Stir Crazy' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Welcome to Stir Crazy' })).toBeVisible();
  }
});

test('switching fictional participants keeps the original account return path', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Open the sample trip', exact: true }).click();
  let dialog = await controls(page);
  await dialog.getByLabel('View as a fictional participant', { exact: true }).selectOption('nora');
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Back to my trips', exact: true })).toBeVisible();
  dialog = await controls(page);
  await dialog.getByRole('button', { name: 'Explore the sample trip', exact: true }).click();
  await page.getByRole('button', { name: 'Back to my trips', exact: true }).click();
  await page.goto('./#/4');
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
});

test('new release offers reload without interrupting a form', async ({ page }) => {
  await page.route('**/version.json?*', route => route.fulfill({ json: { commit: 'f'.repeat(40) } }));
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'Reload app', exact: true })).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill('unsaved@example.com');
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('unsaved@example.com');
  await expect(page.getByRole('status')).toContainText('Finish what you’re doing before reloading');
  await noOverflow(page);
  await page.getByRole('button', { name: 'Reload app', exact: true }).click();
  await expect(page).toHaveURL(/release=ffffffff/);
  await expect(page.getByRole('heading', { name: 'Welcome to Stir Crazy' })).toBeVisible();
  await page.setViewportSize({ width: 768, height: 900 });
  await page.getByRole('button', { name: 'Try demo as Maya', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reload app', exact: true })).toBeVisible();
  const notice = await page.locator('.release-notice').boundingBox();
  const sidebar = await page.locator('.sidebar').boundingBox();
  expect(sidebar!.y).toBeGreaterThanOrEqual(notice!.y + notice!.height);
});


test('screen index sample entry preserves the real account return path', async ({ page }) => {
  await login(page);
  const dialog = await controls(page);
  if (await dialog.getByRole("button", {name:"Screens",exact:true}).isVisible()) await dialog.getByRole("button", {name:"Screens",exact:true}).click();
  await dialog.getByRole('button', { name: '08 Itinerary', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Seattle & Bainbridge getaway', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to my trips', exact: true }).click();
  await page.goto('./#/4');
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
});

test('an email invitation survives Google login and selects its own trip survey', async ({ page }) => {
  const target = '77777777-7777-4777-8777-777777777777';
  const inbox = 'invited@example.com';
  const row = (tripID: string, trip_name: string) => ({
    tripID, trip_name, destinations: ['Osaka'], timezone: 'Asia/Tokyo',
    start_date: '2027-05-01', end_date: '2027-05-04', content_version: 1, revision: 1,
    content: { members: [{ id: account.id, accountId: account.id, name: 'Traveler',
      email: account.email, role: 'Viewer', status: 'accepted', days: [] }],
      prefs: {}, events: [], todos: [], expenses: [], dismissed: [], individual: {} },
  });
  let joined = false;
  await page.route('**/rest/v1/trip_photo_credit?**', route => route.fulfill({json:[]}));
  await page.route('**/rpc/open_trip_invite', route => {
    const payload = route.request().postDataJSON();
    expect(payload).toEqual({p_trip: target, ...(payload.p_ticket ? {p_ticket: target} : {})});
    return route.fulfill({json:{trip:target, email:inbox, canSetup:true, ticket:target}});
  });
  await page.route('**/rpc/accept_trip_invite', route => {
    expect(route.request().postDataJSON()).toEqual({p_trip:target, p_ticket:target});
    joined = true;
    return route.fulfill({status:204});
  });
  await page.route('**/rpc/load_trip_bundles', route => {
    expect(joined).toBeTruthy();
    return route.fulfill({json:[row('88888888-8888-4888-8888-888888888888','Other pending survey'), row(target,'Invited Osaka trip')]});
  });
  await page.route('**/auth/v1/authorize?**', route => {
    const url = new URL(route.request().url());
    const callback = new URL(url.searchParams.get('redirect_to')!);
    callback.searchParams.set('code','mock-google-code');
    return route.fulfill({status:302, headers:{location:callback.href}});
  });
  const part = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const token = part({alg:'HS256'})+'.'+part({sub:account.id, exp:Math.floor(Date.now()/1000)+3600})+'.dGVzdA';
  await page.goto('./?trip_invite='+target+'#type=signup&access_token='+token+'&refresh_token=mock-refresh');
  await expect(page.getByLabel('Email',{exact:true})).toHaveValue(inbox);
  await page.getByRole('button',{name:'Sign in with Google'}).click();
  await expect(page.getByRole('heading',{name:'Your trip preferences'})).toBeVisible();
  await expect(page.getByText('Joined Invited Osaka trip', {exact:true})).toBeVisible();
});

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('profile picture: initials, upload, persists after reload, and remove for an email account', async ({ page }) => {
  let savedPath: string | null = null;
  const uploads: string[] = [];
  await page.route('**/rest/v1/user?**', route => route.fulfill({ json: savedPath ? [{ profile_picture_path: savedPath }] : [] }));
  // Removing the previous object is a DELETE on the bucket root, so match both shapes.
  await page.route(/\/storage\/v1\/object\/profile-pictures(\/.*)?$/, route => {
    uploads.push(new URL(route.request().url()).pathname);
    return route.fulfill({ json: { Key: 'ok' } });
  });
  await page.route('**/storage/v1/object/public/profile-pictures/**', route => route.fulfill({ body: PNG, contentType: 'image/png' }));
  await page.route('**/rpc/set_profile_picture', route => {
    savedPath = route.request().postDataJSON().p_path;
    return route.fulfill({ status: 204 });
  });
  await login(page);
  await openAccount(page);
  const panel = page.locator('.account-page');
  await expect(panel.getByText('Showing your initials until you upload a photo.')).toBeVisible();
  await expect(panel.locator('img')).toHaveCount(0);
  await panel.locator('input[type=file]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG });
  await expect(panel.getByText('Your uploaded photo.')).toBeVisible();
  await expect(panel.locator('img').first()).toHaveAttribute('src', new RegExp(`/profile-pictures/${account.id}/[0-9a-f-]{36}\\.webp$`));
  expect(savedPath).toMatch(new RegExp(`^${account.id}/[0-9a-f-]{36}\\.webp$`));
  expect(uploads.some(path => path.includes(`/profile-pictures/${account.id}/`))).toBe(true);
  // A fresh page load reads the saved path back from the profile row.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Account', exact: true, level: 1 })).toBeVisible();
  const reopened = page.locator('.account-page');
  await expect(reopened.getByText('Your uploaded photo.')).toBeVisible();
  await expect(reopened.locator('img').first()).toBeVisible();
  await reopened.getByRole('button', { name: 'Remove' }).click();
  await expect(reopened.getByText('Showing your initials until you upload a photo.')).toBeVisible();
  expect(savedPath).toBeNull();
});

test('profile picture: rejects unsupported files without calling the server', async ({ page }) => {
  let called = false;
  await page.route('**/rpc/set_profile_picture', route => { called = true; return route.fulfill({ status: 204 }); });
  await login(page);
  await openAccount(page);
  const panel = page.locator('.account-page');
  await panel.locator('input[type=file]').setInputFiles({ name: 'x.gif', mimeType: 'image/gif', buffer: Buffer.from('GIF89a') });
  await expect(panel.getByRole('alert')).toContainText('Choose a JPEG, PNG, or WebP image.');
  expect(called).toBe(false);
});

test('profile picture: Google accounts show their Google photo until they upload one', async ({ page }) => {
  const google = { ...account, app_metadata: { provider: 'google', providers: ['google'] },
    identities: [{ provider: 'google', identity_data: { picture: 'https://lh3.googleusercontent.com/test/pic=s96-c' } }] };
  await page.route('https://lh3.googleusercontent.com/**', route => route.fulfill({ body: PNG, contentType: 'image/png' }));
  await page.route('**/auth/v1/token**', route => route.fulfill({ json: { ...session(), user: google } }));
  await page.route('**/auth/v1/user', route => route.fulfill({ json: google }));
  // Real accounts always have a profile row; it simply has no pictures saved yet.
  await page.route('**/rest/v1/user?**', route => route.fulfill({ json: [{ profile_picture_path: null, google_picture_url: null }] }));
  const shared: string[] = [];
  await page.route('**/rpc/set_google_picture', route => { shared.push(route.request().postDataJSON().p_url); return route.fulfill({ status: 204 }); });
  await login(page);
  await openAccount(page);
  const panel = page.locator('.account-page');
  await expect.poll(() => shared).toEqual(['https://lh3.googleusercontent.com/test/pic=s96-c']);
  await expect(panel.getByText('Showing your Google photo until you upload one.')).toBeVisible();
  await expect(panel.locator('img').first()).toHaveAttribute('src', 'https://lh3.googleusercontent.com/test/pic=s96-c');
});

test('the profile picture is the only account button in the top bar, on every screen size', async ({ page }) => {
  await login(page);
  const button = page.getByRole('button', { name: 'Account and preferences', exact: true });
  await expect(button).toHaveCount(1);
  await expect(button).toBeVisible();
  await expect(button.locator('.avatar')).toBeVisible();
  // The old people-icon button is gone.
  await expect(page.locator('.topbar-right .icon-btn')).toHaveCount(0);
  await button.click();
  await expect(page.getByRole('heading', { name: 'Account', exact: true, level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/#\/19$/);
});


const googleAccount = { ...account, app_metadata: { provider: 'google', providers: ['google'] },
  identities: [{ provider: 'google', identity_data: {} }] };

test('account page: email accounts can change their name and it shows everywhere', async ({ page }) => {
  let renamed = '';
  await page.route('**/rpc/set_account_name', route => { renamed = route.request().postDataJSON().p_name; return route.fulfill({ status: 204 }); });
  await page.route('**/auth/v1/token**', route => route.fulfill({ json: { ...session(),
    user: renamed ? { ...account, user_metadata: { name: renamed } } : account } }));
  await login(page);
  await openAccount(page);
  const panel = page.locator('.account-page');
  await expect(panel.getByRole('button', { name: 'Save name' })).toBeDisabled();
  await panel.getByLabel('Name', { exact: true }).fill('   ');
  await panel.getByRole('button', { name: 'Save name' }).click();
  await expect(panel.getByRole('alert')).toContainText('Enter name');
  expect(renamed).toBe('');
  await panel.getByLabel('Name', { exact: true }).fill('  Ivy Sanford  ');
  await panel.getByRole('button', { name: 'Save name' }).click();
  await expect(panel.getByRole('status').filter({ hasText: 'Name saved.' })).toBeVisible();
  expect(renamed).toBe('Ivy Sanford');
  await expect(panel.locator('.person strong')).toHaveText('Ivy Sanford');
});

test('account page: the name field stops at 90 characters', async ({ page }) => {
  await login(page);
  await openAccount(page);
  const field = page.locator('.account-page').getByLabel('Name', { exact: true });
  await field.fill('x'.repeat(95));
  expect((await field.inputValue()).length).toBe(90);
});

test('account page: email accounts can change their password after confirming the current one', async ({ page }) => {
  const changed: string[] = [];
  await page.route('**/auth/v1/user', route => {
    if (route.request().method() === 'PUT') { changed.push(route.request().postDataJSON().password); }
    return route.fulfill({ json: account });
  });
  await login(page);
  await page.route('**/auth/v1/token?grant_type=password', route => route.request().postDataJSON().password === 'wrong-password'
    ? route.fulfill({ status: 400, json: { code: 'invalid_credentials', error_code: 'invalid_credentials', message: 'Invalid login credentials' } })
    : route.fulfill({ json: session() }));
  await openAccount(page);
  const panel = page.locator('.account-page');
  await expect(panel.getByText('Email and password')).toBeVisible();
  await panel.locator('.account-password-disclosure > summary').click();
  const form = panel.getByRole('form', { name: 'Change password' });
  await form.getByLabel('Current password', { exact: true }).fill('prototype-test-password');
  await form.getByLabel('New password', { exact: true }).fill('short');
  await form.getByRole('button', { name: 'Update password' }).click();
  await expect(form.getByRole('alert')).toContainText('at least 8 characters');
  await form.getByLabel('New password', { exact: true }).fill('a-brand-new-password');
  await form.getByLabel('Confirm new password', { exact: true }).fill('a-different-password');
  await form.getByRole('button', { name: 'Update password' }).click();
  await expect(form.getByRole('alert')).toContainText('do not match');
  expect(changed).toEqual([]);
  await form.getByLabel('Current password', { exact: true }).fill('wrong-password');
  await form.getByLabel('Confirm new password', { exact: true }).fill('a-brand-new-password');
  await form.getByRole('button', { name: 'Update password' }).click();
  await expect(form.getByRole('alert')).toContainText('current password is incorrect');
  expect(changed).toEqual([]);
  await form.getByLabel('Current password', { exact: true }).fill('prototype-test-password');
  await form.getByRole('button', { name: 'Update password' }).click();
  await expect(form.getByRole('status')).toContainText('Password updated.');
  expect(changed).toEqual(['a-brand-new-password']);
  await expect(form.getByLabel('Current password', { exact: true })).toHaveValue('');
});

test('account page: Google accounts never see a password form', async ({ page }) => {
  await page.route('**/auth/v1/token**', route => route.fulfill({ json: { ...session(), user: googleAccount } }));
  await page.route('**/auth/v1/user', route => route.fulfill({ json: googleAccount }));
  await page.route('**/rest/v1/user?**', route => route.fulfill({ json: [{ profile_picture_path: null, google_picture_url: null }] }));
  await login(page);
  await openAccount(page);
  const panel = page.locator('.account-page');
  await expect(panel.getByText('You sign in with Google.')).toBeVisible();
  await expect(panel.getByText('managed by Google, not Stir Crazy')).toBeVisible();
  await expect(panel.getByRole('form', { name: 'Change password' })).toHaveCount(0);
  await expect(panel.getByText('Change password')).toHaveCount(0);
  await expect(panel.locator('input[type=password]')).toHaveCount(0);
  // Name editing still works for Google accounts.
  await expect(panel.getByLabel('Name', { exact: true })).toBeVisible();
});

test('account page: the Maya demo has no editable account details', async ({ page }) => {
  await demo(page);
  await page.getByRole('button', { name: 'Account and preferences', exact: true }).click();
  const panel = page.locator('.account-page');
  await expect(panel.getByText('local demo account')).toBeVisible();
  await expect(panel.getByLabel('Name', { exact: true })).toHaveCount(0);
  await expect(panel.getByText('Change password')).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Exit demo' })).toBeVisible();
});


test('password visibility preserves entry and demo exit returns to the top of login', async ({ page }) => {
  await page.goto('./');
  const password = page.getByLabel('Password', { exact: true });
  await password.fill('visible-typo-check');
  await page.getByRole('button', { name: 'Show password', exact: true }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await expect(password).toHaveValue('visible-typo-check');
  await page.getByRole('button', { name: 'Hide password', exact: true }).click();
  await expect(password).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Try demo as Maya', exact: true }).click();
  await page.goto('./#/13');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByRole('button', { name: 'Exit demo', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
});

test('duplicate signup offers direct login recovery and keeps the email', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 390, height: 600 });
  await page.route('https://*.supabase.co/auth/v1/signup**',route=>route.fulfill({status:422,json:{code:'user_already_exists',msg:'User already registered'},headers:{'x-supabase-api-version':'2024-01-01'}}));
  await page.goto('./');
  await page.evaluate(() => document.fonts.ready);
  await page.getByRole('button',{name:'New here? Create an account',exact:true}).click();
  await page.getByLabel('Your name',{exact:true}).fill('QA Traveler');
  await page.getByLabel('Email',{exact:true}).fill(account.email);
  await page.getByLabel('Password',{exact:true}).fill('existing-password');
  await page.getByRole('button',{name:'Create account',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('An account already uses this email');
  await expect(page.getByRole('alert')).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('button',{name:'Log in instead',exact:true})).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('button',{name:'Already have an account? Log in',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Log in instead',exact:true}).click();
  await expect(page.getByLabel('Email',{exact:true})).toHaveValue(account.email);
  await expect(page.getByLabel('Password',{exact:true})).toBeFocused();
  await expect(page.getByLabel('Password',{exact:true})).toHaveValue('');
  await page.getByLabel('Password',{exact:true}).fill('existing-password');
  await page.getByRole('button',{name:'Log in',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Home',exact:true})).toBeVisible();
});

test('forwarded booking removal is deliberate and a failed request can be retried', async ({ page }) => {
  const booking = {booking_id:'qa-booking',kind:'lodging',title:'Harbor stay',start_date:'2027-05-01',end_date:'2027-05-04',location:'Seattle',confirmation_code:'QA123',sender:account.email,received_at:'2026-11-11T12:00:00Z'};
  let attempts=0, deleted=false;
  await page.route('**/rest/v1/forwarded_booking**',route=>{
    if(route.request().method()==='DELETE') {
      attempts++;
      if(attempts===1)return route.fulfill({status:503,json:{message:'Temporary failure'}});
      deleted=true;return route.fulfill({status:204});
    }
    return route.fulfill({json:deleted?[]:[booking]});
  });
  await login(page);
  await page.locator(".home-bookings > summary").click();
  const remove=page.getByRole('button',{name:'Remove Harbor stay',exact:true});
  await remove.click();
  const dialog=page.getByRole('dialog',{name:'Remove this booking?',exact:true});
  await expect(dialog).toContainText('does not cancel your reservation');
  await dialog.getByRole('button',{name:'Keep booking',exact:true}).click();
  expect(attempts).toBe(0);await expect(remove).toBeFocused();
  await remove.click();await dialog.getByRole('button',{name:'Remove booking',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('could not remove');
  await expect(page.getByRole('heading',{name:'Harbor stay',exact:true})).toHaveCount(1);
  await dialog.getByRole('button',{name:'Remove booking',exact:true}).click();
  await expect(dialog).toHaveCount(0);await expect(page.getByRole('heading',{name:'Forwarded bookings',exact:true})).toBeFocused();
  expect(attempts).toBe(2);await page.reload();await expect(page.getByRole('heading',{name:'Harbor stay',exact:true})).toHaveCount(0);
});
