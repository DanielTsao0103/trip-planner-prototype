import { expect, test } from '@playwright/test';

test('switching to signup preserves password focus reached before the next frame', async ({ page }) => {
  await page.route('https://*.supabase.co/**', route => route.fulfill({ json: { external: {} } }));
  await page.goto('./');
  await expect(page.getByRole('button', { name: 'New here? Create an account', exact: true })).toBeVisible();
  // Hold app animation frames so the mode-switch callback runs after deliberate field entry.
  await page.evaluate(() => {
    const frames: FrameRequestCallback[] = [];
    const original = window.requestAnimationFrame;
    window.requestAnimationFrame = callback => { frames.push(callback); return frames.length; };
    (window as Window & { releaseAuthFrames?: () => void }).releaseAuthFrames = () => {
      window.requestAnimationFrame = original;
      frames.forEach(callback => callback(performance.now()));
    };
  });
  await page.getByRole('button', { name: 'New here? Create an account', exact: true }).click();
  const name = page.getByLabel('Your name', { exact: true });
  const password = page.getByLabel('Password', { exact: true });
  await name.fill('QA traveler');
  await page.getByLabel('Email', { exact: true }).fill('traveler@example.com');
  await password.focus();
  await page.evaluate(() => (window as Window & { releaseAuthFrames?: () => void }).releaseAuthFrames?.());
  await expect(password).toBeFocused();
  await page.keyboard.insertText('test-password');
  await expect(password).toHaveValue('test-password');
  await expect(name).toHaveValue('QA traveler');
});

test('account validation keeps corrections inline and submits only corrected fields', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  let submissions = 0;
  await page.route('https://*.supabase.co/**', route => {
    if (route.request().method() === 'POST') submissions++;
    return route.fulfill({ status: 400, json: { code: 'invalid_credentials', msg: 'Invalid login credentials' } });
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'New here? Create an account', exact: true }).click();
  await expect(page.getByRole('button', {name:'Already have an account? Log in',exact:true})).toBeInViewport({ratio:1});
  await page.screenshot({path:test.info().outputPath('signup-short-switch.png')});
  const form = page.locator('.account-form');
  const name = form.getByLabel('Your name', { exact: true });
  const email = form.getByLabel('Email', { exact: true });
  const password = form.getByLabel('Password', { exact: true });
  const submit = form.getByRole('button', { name: 'Create account', exact: true });
  await submit.click();
  await expect(name).toBeFocused();
  await expect(name).toHaveAccessibleDescription('Enter your name.');
  await expect(email).toHaveAccessibleDescription('Enter email.');
  await expect(password).toHaveAccessibleDescription('Enter your password.');
  expect(submissions).toBe(0);
  await name.fill('QA traveler');
  await email.fill('invalid-address');
  await password.fill('short');
  await submit.click();
  await expect(email).toBeFocused();
  await expect(email).toHaveAccessibleDescription('Enter a valid email address.');
  await expect(password).toHaveAccessibleDescription('Enter at least 8 characters.');
  await submit.click();
  await expect(email).toBeFocused();
  expect(submissions).toBe(0);
  await email.fill('traveler@example.com');
  await submit.click();
  await expect(password).toBeFocused();
  expect(submissions).toBe(0);
  await password.fill('test-password');
  await password.press('Enter');
  await expect.poll(() => submissions).toBe(1);
  await expect(page.locator('.auth-error')).toBeVisible();
  await expect(email).toHaveValue('traveler@example.com');
  await expect(name).toHaveValue('QA traveler');
});

test('login allows an existing short password and mode changes retire field errors', async ({ page }) => {
  let submittedPassword = '';
  await page.route('https://*.supabase.co/**', route => {
    if (route.request().url().includes('/token')) submittedPassword = route.request().postDataJSON().password;
    return route.fulfill({ status: 400, json: { code: 'invalid_credentials', msg: 'Invalid login credentials' } });
  });
  await page.goto('./');
  const form = page.locator('.account-form');
  await form.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(form.getByLabel('Email', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'New here? Create an account', exact: true }).click();
  await expect(form.getByLabel('Email', { exact: true })).toHaveAttribute('aria-invalid', 'false');
  await page.getByRole('button', { name: 'Already have an account? Log in', exact: true }).click();
  await form.getByLabel('Email', { exact: true }).fill('traveler@example.com');
  await form.getByLabel('Password', { exact: true }).fill('short');
  await form.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect.poll(() => submittedPassword).toBe('short');
});

test('signup service failure keeps entries and reveals an explicit retry on a short phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  let attempts = 0;
  await page.route('https://*.supabase.co/**', route => {
    if (new URL(route.request().url()).pathname === '/auth/v1/signup') {
      attempts++;
      return attempts === 1
        ? route.fulfill({ status: 503, json: { msg: 'Service temporarily unavailable' } })
        : route.fulfill({ json: { id: 'e9e49489-91a3-477f-8971-031cdf60cfc3', aud: 'authenticated', role: 'authenticated', email: 'retry@example.com', identities: [{ provider: 'email' }] } });
    }
    return route.fulfill({ json: { external: {} } });
  });
  await page.goto('./');
  await page.getByRole('button', { name: 'New here? Create an account', exact: true }).click();
  await page.getByLabel('Your name', { exact: true }).fill('Retry traveler');
  await page.getByLabel('Email', { exact: true }).fill('retry@example.com');
  await page.getByLabel('Password', { exact: true }).fill('retry-password');
  await page.getByRole('button', { name: 'Create account', exact: true }).focus();
  await page.keyboard.press('Enter');
  const error = page.locator('.auth-error');
  const retry = page.getByRole('button', { name: 'Try again', exact: true });
  await expect(error).toContainText('temporarily unavailable');
  await expect(error).toBeFocused();
  await expect(error).toBeInViewport({ ratio: 1 });
  await expect(retry).toBeInViewport({ ratio: 1 });
  await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('Retry traveler');
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('retry@example.com');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('retry-password');
  await page.screenshot({ path: test.info().outputPath('signup-service-retry-short.png') });
  await retry.click();
  await expect(page.getByText('Check your email to confirm your account, then return here and log in.', { exact: true })).toBeVisible();
  expect(attempts).toBe(2);
});
