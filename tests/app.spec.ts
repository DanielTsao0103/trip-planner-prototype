import { test, expect, type Page } from '@playwright/test';

const account = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'qa@example.com', email_confirmed_at: '2026-01-01T00:00:00Z', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { name: 'QA Traveler' }, created_at: '2026-01-01T00:00:00Z' };
const session = () => ({ access_token: 'test-access-token', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'test-refresh-token', user: account });

// Exercise the real SDK/UI boundary without writing users or trips to the real project.
test.beforeEach(async ({ page }) => {
  await page.route('https://*.supabase.co/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/rest/v1/forwarded_booking') return route.fulfill({ json: [] });
    if (url.pathname === '/rest/v1/rpc/load_trip_bundles' || (url.pathname === '/rest/v1/trip' && route.request().method() === 'GET')) return route.fulfill({ json: [] });
    if (url.pathname.startsWith('/auth/v1/')) {
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
  await page.getByRole('button', { name: 'Prototype', exact: true }).click();
  return page.getByRole('dialog', { name: 'Prototype controls' });
}
async function openAccount(page: Page) {
  if (await page.getByRole('button', { name: 'Account and preferences', exact: true }).isVisible()) {
    await page.getByRole('button', { name: 'Account and preferences', exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click();
    await page.getByRole('button', { name: 'Your account', exact: true }).click();
  }
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
}

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
  await page.getByRole('button', { name: 'Create trip', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Spain escape' })).toBeVisible();
  expect(trackedLocation).toBe('https://api.unsplash.com/photos/Spain-1/download?ixid=Spain-1');
});

test('login shows neutral copy, branded buttons, an Apple preview, and recoverable auth errors', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Welcome to Trip Planner', exact: true })).toBeVisible();
  for (const provider of ['Google', 'Apple']) {
    const button = page.getByRole('button', { name: `Sign in with ${provider}`, exact: true });
    await expect(button.locator('img')).toBeVisible();
    expect(await button.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  }
  await page.getByRole('button', { name: 'Sign in with Apple', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Apple sign-in is a prototype preview');
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
  await expect(page.getByRole('alert')).toContainText('Google sign-in didn’t finish: Access blocked');
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
  await expect(page.getByRole('heading', { name: 'Welcome to Trip Planner' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome to Trip Planner' })).toBeVisible();
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
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
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

test('prototype start-at-login actually exits demo and remains signed out after reload', async ({ page }) => {
  for (const entry of ['Start at Log in / Create account', '01 Log in / Create account']) {
    await demo(page);
    const dialog = await controls(page);
    await dialog.getByRole('button', { name: entry, exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Welcome to Trip Planner' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Welcome to Trip Planner' })).toBeVisible();
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
  await expect(page.getByRole('status')).toContainText('Finish any unsaved edits');
  await noOverflow(page);
  await page.getByRole('button', { name: 'Reload app', exact: true }).click();
  await expect(page).toHaveURL(/release=ffffffff/);
  await expect(page.getByRole('heading', { name: 'Welcome to Trip Planner' })).toBeVisible();
});


test('screen index sample entry preserves the real account return path', async ({ page }) => {
  await login(page);
  const dialog = await controls(page);
  await dialog.getByRole('button', { name: '08 Itinerary', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Seattle & Bainbridge getaway', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back to my trips', exact: true }).click();
  await page.goto('./#/4');
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
});
