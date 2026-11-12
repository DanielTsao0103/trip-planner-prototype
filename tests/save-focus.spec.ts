import { expect, test, type Page, type Route } from '@playwright/test';
const account = {
  id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated',
  email: 'focus-qa@example.test', app_metadata: { provider: 'email' },
  user_metadata: { name: 'Focus Traveler' }, created_at: '2026-01-01T00:00:00Z',
};
const session = { user: account, access_token: 'test-token', refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600 };

/** Intercept every account request; delayed replies expose focus changes during saves. */
async function mockAccount(page: Page) {
  const pending: Route[] = [];
  const styleWrites: unknown[] = [];
  let holdLogin = false;
  let holdStyle = false;
  await page.route('https://*.supabase.co/**', async route => {
    const request = route.request(), endpoint = new URL(request.url()).pathname;
    if (endpoint.endsWith('/token')) {
      if (holdLogin) { pending.push(route); return; }
      return route.fulfill({ json: session });
    }
    if (endpoint === '/auth/v1/user') return route.fulfill({ json: account });
    if (endpoint.endsWith('/user_style')) {
      if (request.method() === 'GET') return route.fulfill({ json: null });
      styleWrites.push(request.postDataJSON());
      if (holdStyle) { pending.push(route); return; }
      return route.fulfill({ status: 201, json: null });
    }
    return route.fulfill({ json: [] });
  });
  return {
    pending, styleWrites,
    holdLogin: () => { holdLogin = true; },
    holdStyle: () => { holdStyle = true; },
    releaseStyle: () => { holdStyle = false; },
    async reject() {
      await expect.poll(() => pending.length).toBe(1);
      await pending.shift()!.fulfill({ status: 400, json: { code: 'invalid_credentials', error_code: 'invalid_credentials', message: 'Invalid login credentials' } });
    },
  };
}

async function credentials(page: Page) {
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill('wrong-password');
}

async function capture(page: Page, name: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
  });
  await page.waitForTimeout(350);
  await page.screenshot({ path: test.info().outputPath(`${name}.png`) });
}

for (const view of [
  { name: 'desktop', width: 1440, height: 900, dark: false },
  { name: 'phone', width: 390, height: 600, dark: false },
  { name: 'tablet-dark', width: 768, height: 900, dark: true },
]) {
  test(`rejected login restores correction focus without taking another control: ${view.name}`, async ({ page }) => {
    await page.setViewportSize(view);
    await page.emulateMedia({ colorScheme: view.dark ? 'dark' : 'light' });
    const mock = await mockAccount(page);
    mock.holdLogin();
    await page.goto('./');
    await credentials(page);
    const password = page.getByLabel('Password', { exact: true });
    const submit = page.getByRole('button', { name: 'Log in', exact: true });
    await submit.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Signing in…', exact: true })).toBeDisabled();
    await mock.reject();
    await expect(page.getByRole('alert')).toContainText('Invalid login credentials');
    await expect(password).toBeFocused();
    await expect(password).toHaveValue('wrong-password');
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue(account.email);
    await expect(page.getByRole('alert')).toBeInViewport({ ratio: 1 });
    await expect(submit).toBeInViewport({ ratio: 1 });
    await capture(page, `login-error-${view.name}`);
    // Login fields are intentionally disabled while pending. A harness-only
    // independent field models focus moving outside the busy form.
    await page.evaluate(() => {
      const field = document.createElement('input');
      field.setAttribute('aria-label', 'Independent host field');
      document.body.append(field);
    });
    await submit.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Signing in…', exact: true })).toBeDisabled();
    const otherControl = page.getByRole('textbox', { name: 'Independent host field', exact: true });
    await otherControl.focus();
    await mock.reject();
    await expect(submit).toBeEnabled();
    await page.waitForTimeout(100);
    await expect(otherControl).toBeFocused();
  });

  test(`failed style save restores Retry and preserves a newly focused choice: ${view.name}`, async ({ page }) => {
    await page.setViewportSize(view);
    await page.emulateMedia({ colorScheme: view.dark ? 'dark' : 'light' });
    const mock = await mockAccount(page);
    await page.goto('./');
    await credentials(page);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
    await page.goto('./#/18');
    await page.getByRole('button', { name: 'Purple', exact: true }).click();
    mock.holdStyle();
    const apply = page.getByRole('button', { name: 'Apply to my site', exact: true });
    await apply.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();
    await mock.reject();
    const retry = page.getByRole('button', { name: 'Retry save', exact: true });
    await expect(retry).toBeFocused();
    await expect(page.getByRole('alert')).toBeInViewport({ ratio: 1 });
    await expect(retry).toBeInViewport({ ratio: 1 });
    await capture(page, `style-error-${view.name}`);
    // Retry uses the unchanged pending choice and keeps local edits intact.
    mock.releaseStyle();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toContainText('Style saved to your account.');
    expect(mock.styleWrites[1]).toEqual(mock.styleWrites[0]);
    await page.getByRole('button', { name: 'Green', exact: true }).click();
    mock.holdStyle();
    await apply.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();
    const otherChoice = page.getByRole('button', { name: 'Round', exact: true });
    await otherChoice.click();
    await mock.reject();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.waitForTimeout(100);
    await expect(otherChoice).toBeFocused();
    await expect(otherChoice).toHaveAttribute('aria-pressed', 'true');
    await expect(apply).toBeEnabled();
    mock.releaseStyle();
    await apply.click();
    await expect(page.getByRole('status')).toContainText('Style saved to your account.');
    expect(mock.styleWrites.at(-1)).toMatchObject({ theme: 'green', corners: 'round' });
  });
}
