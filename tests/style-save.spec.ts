import { expect, test } from "@playwright/test";

test('tablet Style offers a preview jump only while the preview is elsewhere', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto('./');
  await page.getByRole('button', { name: 'Try demo as Maya', exact: true }).click();
  await page.goto('./#/18');
  const jump = page.getByRole('button', { name: 'View preview', exact: true });
  const preview = page.locator('.style-preview');
  await expect(preview).toBeInViewport();
  await expect(jump).toBeHidden();
  await page.getByRole('button', { name: 'Back to choices', exact: true }).filter({ visible: true }).click();
  await expect(jump).toBeVisible();
  await jump.click();
  await expect(preview).toBeFocused();
  await expect(jump).toBeHidden();
  await page.getByRole('button', { name: 'Back to choices', exact: true }).filter({ visible: true }).click();
  await expect(page.locator('.style-controls')).toBeFocused();
  await expect(jump).toBeVisible();
  // Scrolling must not remove the control a keyboard traveler is still using.
  await jump.focus();
  await preview.evaluate(node => node.scrollIntoView({ block: 'center' }));
  await expect(jump).toBeFocused();
  await expect(jump).toBeVisible();
  await preview.focus();
  await expect(jump).toBeHidden();
  await page.screenshot({ path: test.info().outputPath('tablet-style-preview.png') });
});

const account = {
  id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated",
  email: "style-qa@example.test", app_metadata: { provider: "email" },
  user_metadata: { name: "Style QA" }, created_at: "2026-01-01T00:00:00Z",
};

test("account style failure stays visible through navigation and retries the selected look", async ({ page, isMobile }) => {
  await page.setViewportSize(isMobile ? { width: 390, height: 600 } : { width: 768, height: 900 });
  if (!isMobile) await page.emulateMedia({ colorScheme: 'dark' });
  const writes: Record<string, unknown>[] = [];
  let allowSave = false;
  await page.route("https://*.supabase.co/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/rest/v1/user_style") {
      if (request.method() === "GET") return route.fulfill({ json: null });
      writes.push(request.postDataJSON());
      return allowSave
        ? route.fulfill({ status: 201, json: null })
        : route.fulfill({ status: 403, json: { message: "QA denied save", code: "42501" } });
    }
    if (path.endsWith("/token")) return route.fulfill({ json: {
      access_token: "test-access-token", token_type: "bearer", expires_in: 3600,
      refresh_token: "test-refresh-token", user: account,
    } });
    if (path === "/auth/v1/user") return route.fulfill({ json: account });
    if (path === "/auth/v1/settings") return route.fulfill({ json: { external: { apple: false } } });
    if (request.method() === "GET" || path.endsWith("/load_trip_bundles") || path.endsWith("/trip_companion_pictures")) {
      return route.fulfill({ json: [] });
    }
    throw Error(`Unexpected mocked request: ${request.method()} ${path}`);
  });
  await page.goto("./");
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill("qa-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  await page.goto("./#/18");
  if (isMobile) {
    await page.setViewportSize({width:390,height:600});
    await expect(page.locator('.mobile-nav')).toHaveCount(0);
    const actions=await page.locator('.style-actions').boundingBox();
    expect(actions!.y+actions!.height).toBeCloseTo(600,0);
  }
  await page.getByRole("button", { name: "Purple", exact: true }).click();
  await page.getByRole("button", { name: "Apply to my site", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("couldn’t be saved to your account");
  await expect(page.getByRole("alert")).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('button', { name: 'Retry save', exact: true })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole("button", { name: "Purple", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.goto("./#/4");
  await page.goto("./#/18");
  await expect(page.getByRole("alert")).toContainText("couldn’t be saved to your account");
  allowSave = true;
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Style saved to your account." })).toBeVisible();
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  expect(writes[1].theme).toBe("purple");
  await page.getByRole("button", {name:"Reset", exact:true}).click();
  await expect(page.getByRole("status").filter({hasText:"Preview only."})).toBeVisible();
  await expect(page.getByText("Style saved to your account.", {exact:true})).toHaveCount(0);
  await expect(page.getByRole("button", {name:"Apply to my site", exact:true})).toBeEnabled();
  expect(writes).toHaveLength(2);
});

test("demo style applies locally without an account save or account-save claim", async ({ page }) => {
  const cloudWrites: string[] = [];
  await page.route("https://*.supabase.co/**", async (route) => {
    if (route.request().method() !== "GET") cloudWrites.push(route.request().url());
    await route.fulfill({ json: [] });
  });
  await page.goto("./");
  await page.getByRole("button", { name: "Try demo as Maya", exact: true }).click();
  await page.goto("./#/18");
  await page.getByRole("button", { name: "Green", exact: true }).click();
  await page.getByRole("button", { name: "Apply to my site", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Your style applies to every page on this device." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Applied", exact: true })).toBeDisabled();
  await expect(page.getByText("Style saved to your account.", { exact: true })).toHaveCount(0);
  expect(cloudWrites).toEqual([]);
});

test('short-phone Style keeps one action bar and preserves access to trip navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await page.goto('./');
  await page.getByRole('button', { name: 'Try demo as Maya', exact: true }).click();
  await page.goto('./#/18');
  await expect(page.locator('.mobile-nav')).toHaveCount(0);
  const actions=await page.locator('.style-actions').boundingBox();
  expect(actions!.y+actions!.height).toBeCloseTo(600, 0);
  await page.getByRole('button', { name: 'Round', exact: true }).click();
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  for (const [width, height] of [[390, 600], [320, 600], [320, 256]]) {
    await page.setViewportSize({ width, height });
    const jump = page.getByRole('button', { name: /^(Back to choices|Preview)$/ }).filter({ visible: true });
    await expect(jump).toBeInViewport({ ratio: 1 });
    // Read text and geometry atomically: visibility can change the label between awaits.
    expect(await jump.evaluate(button => {
      const node = button.firstChild!;
      return [...node.textContent!.matchAll(/\S+/g)].every(word => {
        const range = document.createRange();
        range.setStart(node, word.index!);
        range.setEnd(node, word.index! + word[0].length);
        return range.getClientRects().length === 1;
      });
    })).toBe(true);
    const reset = page.getByRole('button', { name: 'Reset', exact: true });
    await expect(reset).toBeInViewport({ ratio: 1 });
    // Check the word itself: a visible button can still split "Reset" over two lines.
    expect(await reset.evaluate(button => {
      const text = [...button.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent?.includes('Reset'))!;
      const range = document.createRange();
      range.selectNodeContents(text);
      return range.getClientRects().length;
    })).toBe(1);
    await expect(page.getByRole('button', { name: 'Apply to my site', exact: true })).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: test.info().outputPath(`style-preview-actions-${width}-${height}.png`) });
  }
  await page.setViewportSize({ width: 390, height: 600 });
  await page.getByRole('button', { name: 'Apply to my site', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Applied', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Preview|Back to choices/, exact: true }).filter({visible: true}).click();
  await page.screenshot({ path: test.info().outputPath('short-style-single-action-bar.png') });
  await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Budget', exact: true }).click();
  await expect(page).toHaveURL(/#\/12$/);
  await expect(page.getByRole('navigation', { name: 'Mobile navigation', exact: true })).toBeVisible();
  await page.reload();await page.goto('./#/18');
  await expect(page.getByRole('button', { name: 'Round', exact: true })).toHaveAttribute('aria-pressed','true');
});
