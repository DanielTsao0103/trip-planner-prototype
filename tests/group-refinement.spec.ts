import { expect, test, type Page } from '@playwright/test';
import { blankPrefs } from '../src/domain';

async function demo(page: Page): Promise<void> {
  await page.addInitScript(() => sessionStorage.setItem('trip-planner-demo-session', 'active'));
  await page.route('https://maps.googleapis.com/maps/api/js?**', route => route.abort());
  await page.goto('./#/15');
}

async function draftKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('trip-survey-draft-v1:')));
}

test('ordinary preferences restore the current step, preserve edits across cancel, and discard explicitly', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 390, height: 600 });
  await demo(page);
  await page.getByRole('button', { name: /Places & pace/ }).click();
  const walk = page.getByLabel('Maximum comfortable continuous walk (meters)');
  const original = await walk.inputValue();
  await walk.fill('525');
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  const notes = page.getByLabel('Anything else the group should know?');
  await notes.fill('A quiet morning before sightseeing.');
  await page.reload();
  await expect(notes).toHaveValue('A quiet morning before sightseeing.');
  await expect(page.getByRole('status')).toContainText('Unsaved preferences restored');
  await page.getByRole('button', { name: 'Resume editing', exact: true }).click();
  await expect(page.locator('.step-heading')).toBeFocused();
  await expect(notes).toBeInViewport({ ratio: 1 });
  await page.getByRole('button', { name: /Places & pace/ }).click();
  await expect(walk).toHaveValue('525');
  await page.getByRole('button', { name: /Practical details/ }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'My preferences' }).click();
  await page.getByRole('button', { name: 'Discard draft', exact: true }).click();
  await expect(page.locator('.survey-draft-notice')).toHaveCount(0);
  await page.getByRole('button', { name: /Places & pace/ }).click();
  await expect(walk).toHaveValue(original);
  expect(await draftKeys(page)).toEqual([]);
  await walk.fill('675');
  await expect(page.locator('.survey-draft-notice')).toHaveCount(0);
  await expect(page.locator('.survey-draft-status')).toContainText('Draft kept in this tab.');
});

test('unavailable draft storage warns honestly, downloads answers, and failed discard retains them', async ({ page }) => {
  await demo(page);
  await page.getByRole('button', { name: /Practical details/ }).click();
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    const remove = Storage.prototype.removeItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('trip-survey-draft-v1:')) throw new DOMException('Full', 'QuotaExceededError');
      return set.call(this, key, value);
    };
    Storage.prototype.removeItem = function(key) {
      if (key.startsWith('trip-survey-draft-v1:')) throw new DOMException('Denied', 'SecurityError');
      return remove.call(this, key);
    };
  });
  const notes = page.getByLabel('Anything else the group should know?');
  await notes.fill('Keep my answers even when storage fails.');
  await expect(page.getByRole('alert')).toContainText('could not be backed up');
  expect(await draftKeys(page)).toEqual([]);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download draft' }).click();
  expect((await download).suggestedFilename()).toBe('trip-preferences-draft.json');
  await page.getByRole('button', { name: 'Discard draft' }).click();
  await expect(page.getByRole('alert')).toContainText('could not be removed');
  await expect(notes).toHaveValue('Keep my answers even when storage fails.');
});

test('confirmed saves cannot leave a stale browser draft silently active when cleanup fails', async ({ page }) => {
  await demo(page);
  await page.getByRole('button', { name: /Practical details/ }).click();
  const notes = page.getByLabel('Anything else the group should know?');
  await notes.fill('Older browser copy');
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    const remove = Storage.prototype.removeItem;
    (window as any).restoreDraftStorage = () => { Storage.prototype.setItem = set; Storage.prototype.removeItem = remove; };
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith('trip-survey-draft-v1:')) throw new DOMException('Denied', 'SecurityError');
      return set.call(this, key, value);
    };
    Storage.prototype.removeItem = function(key) {
      if (key.startsWith('trip-survey-draft-v1:')) throw new DOMException('Denied', 'SecurityError');
      return remove.call(this, key);
    };
  });
  await notes.fill('Newer confirmed answers');
  await page.getByRole('button', { name: 'Save my preferences' }).click();
  await expect(page.getByRole('alert')).toContainText('Your preferences were saved, but the older browser draft could not be cleared');
  await expect(page).toHaveURL(/#\/15$/);
  await expect(notes).toHaveValue('Newer confirmed answers');
  await page.evaluate(() => (window as any).restoreDraftStorage());
  await page.getByRole('button', { name: 'Discard draft' }).click();
  await expect(notes).toHaveValue('Newer confirmed answers');
  expect(await draftKeys(page)).toEqual([]);
  await page.reload();
  await page.getByRole('button', { name: /Practical details/ }).click();
  await expect(notes).toHaveValue('Newer confirmed answers');
});

test('drafts validate identity and complete shape while preserving invalid recovery data', async ({ page }) => {
  await demo(page);
  await page.getByRole('button', { name: /Practical details/ }).click();
  await page.getByLabel('Anything else the group should know?').fill('Original draft');
  const key = (await draftKeys(page))[0];
  await page.evaluate(key => {
    const draft = JSON.parse(sessionStorage.getItem(key)!);
    draft.accountId = 'different-account';
    sessionStorage.setItem(key, JSON.stringify(draft));
  }, key);
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('could not be restored');
  await page.getByRole('button', { name: /Practical details/ }).click();
  await page.getByLabel('Anything else the group should know?').fill('Current in-memory answer');
  expect(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!).accountId, key)).toBe('different-account');
  await page.getByRole('button', { name: 'Discard draft' }).click();
  await page.evaluate(({ key, answers }) => {
    // A former post-join draft has the plain v1 answer shape, which remains supported.
    sessionStorage.setItem(key, JSON.stringify({ ...answers, notes: 'Legacy recovery' }));
    sessionStorage.setItem(`${key}-other-traveler`, JSON.stringify({ ...answers, notes: 'Unrelated traveler' }));
  }, { key, answers: blankPrefs() });
  await page.reload();
  await page.getByRole('button', { name: /Practical details/ }).click();
  await expect(page.getByLabel('Anything else the group should know?')).toHaveValue('Legacy recovery');
  await page.getByRole('button', { name: 'Save my preferences' }).click();
  await expect(page).toHaveURL(/#\/13$/);
  expect(await draftKeys(page)).toEqual([`${key}-other-traveler`]);
});

test('ordinary account preferences keep their scoped draft through a permission failure and successful retry', async ({ page }) => {
  const account = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'fixture@example.test', user_metadata: { name: 'Fixture Traveler' } };
  const traveler = '22222222-2222-4222-8222-222222222222';
  const row = { tripID: '33333333-3333-4333-8333-333333333333', trip_name: 'Fixture trip', destinations: ['Taipei'], timezone: 'Asia/Taipei', start_date: '2027-05-01', end_date: '2027-05-04', content_version: 1, revision: 1,
    content: { members: [{ id: traveler, accountId: account.id, name: 'Fixture Traveler', email: account.email, role: 'Viewer', status: 'accepted', days: [] }], prefs: { [traveler]: blankPrefs() }, image: '', events: [], expenses: [], todos: [], dismissed: [], budget: null, individual: {}, budgetMode: 'group' } };
  let fail = true;
  const writes: string[] = [];
  await page.route('https://*.supabase.co/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/token')) return route.fulfill({ json: { user: account, access_token: 'fixture-token', refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600 } });
    if (path.endsWith('/user')) return route.fulfill({ json: account });
    if (path.endsWith('/load_trip_bundles')) return route.fulfill({ json: [row] });
    if (path.endsWith('/read_invited_trip')) return route.fulfill({ json: row });
    if (path.includes('/save_')) {
      writes.push(path);
      if (!path.endsWith('/save_invited_preferences')) return route.fulfill({ status: 403, json: { message: 'Unexpected write endpoint' } });
      if (fail) return route.fulfill({ status: 403, json: { code: '42501', message: 'Inactive membership' } });
      row.content.prefs[traveler] = route.request().postDataJSON().p_answers;
      return route.fulfill({ json: row });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto('./');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.getByRole('button', { name: 'Open existing trip', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Fixture trip', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fixture trip', exact: true }).click();
  await page.goto('./#/15');
  await page.getByRole('button', { name: /Practical details/ }).click();
  const notes = page.getByLabel('Anything else the group should know?');
  await notes.fill('An ordinary account draft');
  await page.reload();
  await expect(notes).toHaveValue('An ordinary account draft');
  const keys = await draftKeys(page);
  expect(keys).toEqual([`trip-survey-draft-v1:${account.id}:${row.tripID}:${traveler}`]);
  await page.getByRole('button', { name: 'Save my preferences' }).click();
  await expect(page.getByRole('alert')).toContainText('invitation is no longer active');
  await expect(page.getByText('Ask the trip owner to restore your access. Your answers are kept in this tab.')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('ordinary-access-recovery.png'), fullPage: true });
  await expect(notes).toHaveValue('An ordinary account draft');
  expect(await draftKeys(page)).toEqual(keys);
  fail = false;
  await page.getByRole('button', { name: 'Save my preferences' }).click();
  await expect(page).toHaveURL(/#\/13$/);
  expect(await draftKeys(page)).toEqual([]);
  expect(writes).toEqual(['/rest/v1/rpc/save_invited_preferences', '/rest/v1/rpc/save_invited_preferences']);
  await page.reload();
  await page.goto('./#/15');
  await page.getByRole('button', { name: /Practical details/ }).click();
  await expect(notes).toHaveValue('An ordinary account draft');
});

test('long-name groups have one bounded tooltip, dismiss it on scroll, and lead with shared note text', async ({ page }) => {
  await demo(page);
  await page.evaluate(() => {
    const key = 'trip-planner-demo-v1:demo-maya';
    const state = JSON.parse(localStorage.getItem(key)!);
    const trip = state.trips[0];
    for (let i = 0; i < 22; i++) {
      const id = `long-${i}`;
      trip.members.push({ id, name: `Traveler ${i} Alexandria Montgomery-Wellington`, role: 'Viewer', status: 'accepted', days: [] });
      trip.prefs[id] = { ...trip.prefs.maya, notes: 'Please allow a quiet morning before our group explores the city.' };
    }
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.goto('./#/13');
  await page.reload();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const bubbles = page.locator('.dietary-bubble-item');
    await bubbles.first().hover();
    await bubbles.nth(1).focus();
    await expect(page.locator('.chart-tooltip-active')).toHaveCount(1);
    const focusedTooltip = await bubbles.nth(1).getAttribute('aria-describedby');
    // Moving the pointer away from another chart must preserve keyboard context.
    await page.mouse.move(width - 2, 110);
    await expect(page.locator('.chart-tooltip-active')).toHaveAttribute('id', focusedTooltip!);
    await expect(page.locator('.chart-tooltip-active')).toContainText('Select to view full names');
    const bounds = await page.locator('.chart-tooltip-active').boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await page.keyboard.press('Escape');
    await expect(page.locator('.chart-tooltip-active')).toHaveCount(0);
    await bubbles.first().focus();
    await expect(page.locator('.chart-tooltip-active')).toHaveCount(1);
    await page.evaluate(() => window.scrollBy(0, 250));
    await expect(page.locator('.chart-tooltip-active')).toHaveCount(0);
  }
  await page.setViewportSize({ width: 390, height: 600 });
  const sharedNote = page.getByRole('button', { name: 'Read note 1 from 22 travelers', exact: true });
  await sharedNote.click();
  const dialog = page.getByRole('dialog', { name: 'Note from 22 travelers' });
  const content = await dialog.innerText();
  expect(content.indexOf('Please allow a quiet morning')).toBeLessThan(content.indexOf('Shared by 22 travelers'));
  await expect(dialog.getByRole('list')).not.toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Got it' })).toBeInViewport();
  await expect(dialog.getByText(/Please allow a quiet morning/)).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('note-first-phone.png') });
  await dialog.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(dialog.getByRole('listitem')).toHaveCount(22);
  await expect(dialog.getByRole('listitem').last()).toHaveText('Traveler 21 Alexandria Montgomery-Wellington');
  await dialog.getByRole('listitem').last().scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('listitem').last()).toBeInViewport();
  await expect(dialog.getByRole('button', { name: 'Got it' })).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath('note-authors-expanded-phone.png') });
  await page.keyboard.press('Escape');
  await expect(sharedNote).toBeFocused();
});

test('short phone survey exposes first-step fields and scrolls subsequent steps into view', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await demo(page);
  await expect(page.getByLabel('No restrictions', { exact: true })).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath('survey-phone-first-step.png') });
  await page.getByRole('button', { name: /Practical details/ }).click();
  await expect(page.getByLabel('Tickets and reservations')).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath('survey-phone-third-step.png') });
});


test('Group offers a focused Travelers jump and equal-height empty categories on phones', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await demo(page);
  await page.goto('./#/13');
  const jump = page.getByRole('button', { name: 'Travelers', exact: true });
  await expect(jump).toBeInViewport();
  await jump.click();
  await expect(page.getByRole('heading', { name: 'Travelers', exact: true })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Travelers', exact: true })).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath('travelers-jump-phone.png') });
  await page.evaluate(() => {
    const key = 'trip-planner-demo-v1:demo-maya';
    const state = JSON.parse(localStorage.getItem(key)!);
    state.trips[0].prefs = {};
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await expect(page.locator('.preference-tile-empty')).toHaveCount(6);
  const heights = await page.locator('.preference-tile-empty').evaluateAll(cards => cards.map(card => card.getBoundingClientRect().height));
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: test.info().outputPath('group-empty-phone.png'), fullPage: true });
});

test('spending explains its markers and opens complete traveler names', async ({ page }) => {
  await demo(page);
  await page.goto('./#/13');
  await expect(page.getByText('Each dot is one traveler. Select a dot or count to see names.')).toBeVisible();
  await expect(page.locator('.spending-empty').first()).toHaveText('None yet');
  const marker = page.locator('.spending-marker').first();
  const label = await marker.getAttribute('aria-label');
  await marker.scrollIntoViewIfNeeded();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await marker.focus();
  const tooltip = page.locator('.chart-tooltip-active');
  await expect(tooltip).toBeVisible();
  const bounds = await tooltip.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
  await marker.click();
  await expect(page.getByRole('dialog')).toContainText(label!.split(':')[0]);
});

test('post-join draft restores a validated open section and retains answers through a failed save', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 390, height: 600 });
  const account = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'fixture@example.test', user_metadata: { name: 'Fixture Traveler' } };
  const traveler = '22222222-2222-4222-8222-222222222222';
  const row = { tripID: '33333333-3333-4333-8333-333333333333', trip_name: 'Post-join fixture', owner_id: '55555555-5555-4555-8555-555555555555', destinations: ['Taipei'], timezone: 'Asia/Taipei', start_date: '2027-05-01', end_date: '2027-05-04', content_version: 1, revision: 1,
    content: { members: [{ id: traveler, accountId: account.id, name: 'Fixture Traveler', email: account.email, role: 'Viewer', status: 'accepted', days: [] }], prefs: {} as Record<string, ReturnType<typeof blankPrefs>>, image: '', events: [], expenses: [], todos: [], dismissed: [], budget: null, individual: {}, budgetMode: 'group' } };
  let joined = false;
  let fail = true;
  await page.route('https://*.supabase.co/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/token')) return route.fulfill({ json: { user: account, access_token: 'fixture-token', refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600 } });
    if (path.endsWith('/user')) return route.fulfill({ json: account });
    if (path.endsWith('/open_trip_notice')) { joined = true; return route.fulfill({ json: { trip: row.tripID } }); }
    if (path.endsWith('/load_trip_bundles')) return route.fulfill({ json: joined ? [row] : [] });
    if (path.endsWith('/read_invited_trip')) return route.fulfill({ json: row });
    if (path.endsWith('/save_invited_preferences')) {
      if (fail) return route.fulfill({ status: 403, json: { code: '42501', message: 'Inactive membership' } });
      row.content.prefs[traveler] = route.request().postDataJSON().p_answers;
      return route.fulfill({ json: row });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto(`./?trip_notice=${row.tripID}&invitation=44444444-4444-4444-8444-444444444444`);
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  const section = page.getByRole('button', { name: /Tickets & notes/ });
  await section.click();
  const notes = page.getByLabel('Anything else the group should know?');
  await notes.fill('A quiet morning after arrival.');
  await page.reload();
  await expect(section).toHaveAttribute('aria-expanded', 'true');
  await expect(notes).toBeVisible();
  await expect(notes).toHaveValue('A quiet morning after arrival.');
  await page.getByRole('button', { name: 'Resume editing', exact: true }).click();
  await expect(page.locator('#invite-panel-3')).toBeFocused();
  await expect(notes).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: test.info().outputPath('postjoin-restored-section.png'), fullPage: true });
  const key = (await draftKeys(page))[0];
  await page.evaluate(key => {
    const draft = JSON.parse(sessionStorage.getItem(key)!);
    draft.expanded = 99;
    sessionStorage.setItem(key, JSON.stringify(draft));
  }, key);
  await page.reload();
  await expect(section).toHaveAttribute('aria-expanded', 'false');
  await section.click();
  await expect(notes).toHaveValue('A quiet morning after arrival.');
  await page.getByRole('button', { name: 'Save and open trip' }).click();
  await expect(page.getByRole('alert')).toContainText('no longer active');
  await expect(notes).toHaveValue('A quiet morning after arrival.');
  fail = false;
  await page.getByRole('button', { name: 'Save and open trip' }).click();
  await expect(page.getByRole('button', { name: 'Save and open trip' })).toHaveCount(0);
  await expect.poll(() => draftKeys(page)).toEqual([]);
});

test('large group counts stay concise and assigned days read chronologically in both themes', async ({ page }) => {
  await demo(page);
  await page.evaluate(() => {
    const key = 'trip-planner-demo-v1:demo-maya';
    const state = JSON.parse(localStorage.getItem(key)!);
    const trip = state.trips[0];
    for (let i = 0; i < 22; i++) {
      const id = `count-${i}`;
      trip.members.push({ id, name: `Traveler ${i} Alexandria Montgomery-Wellington`, email: `traveler-${i}@example.test`, role: 'Viewer', status: 'accepted', days: [] });
      trip.prefs[id] = { ...trip.prefs.maya, notes: 'Please allow a quiet morning before our group explores the city.' };
    }
    const dayEditor = trip.members.find((member: { role: string }) => member.role === 'Day Editor');
    dayEditor.days = ['2027-05-04', '2027-05-01', '2027-05-03'];
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.goto('./#/13');
  await page.reload();
  for (const width of [390, 1440]) {
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme });
      await page.evaluate(async () => {
        window.scrollTo(0, 0);
        await document.fonts.ready;
        await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
      });
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await expect(page.locator('.group-chart-legend')).toContainText('Traveler counts · Select an item for names.');
      await expect(page.locator('.preference-dot-overflow')).toHaveCount(0);
      await page.screenshot({ path: test.info().outputPath(`group-${width}-${colorScheme}.png`), fullPage: true });
      for (const [index, name] of ['dietary', 'dining', 'spending', 'mobility', 'interests', 'notes'].entries()) {
        await page.locator(`#group-preference-${index}`).evaluate(element => element.scrollIntoView({ block: 'start' }));
        await page.screenshot({ path: test.info().outputPath(`${name}-${width}-${colorScheme}.png`) });
      }
      const bubble = page.locator('.dietary-bubble-item').first();
      await bubble.scrollIntoViewIfNeeded();
      // The chart deliberately dismisses tooltips on scroll; focus after that event settles.
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      await bubble.focus();
      const tooltip = page.locator('.chart-tooltip-active');
      await expect(tooltip).toBeVisible();
      await expect(tooltip).toContainText(/\d+ travelers/);
      await expect(tooltip).not.toContainText('Alexandria');
      const bounds = await tooltip.boundingBox();
      expect(bounds!.height).toBeLessThan(120);
      await page.screenshot({ path: test.info().outputPath(`tooltip-${width}-${colorScheme}.png`) });
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog')).toContainText('Traveler 21 Alexandria Montgomery-Wellington');
      await page.keyboard.press('Escape');
      await expect(bubble).toBeFocused();
      await page.getByRole('button', { name: 'Travelers', exact: true }).click();
      await expect(page.locator('.assigned-days')).toHaveText('May 1, May 3, May 4');
      await expect(page.getByRole('button', { name: 'Change permissions for Sam Rivera' })).toContainText('Permissions');
      await page.screenshot({ path: test.info().outputPath(`travelers-${width}-${colorScheme}.png`) });
    }
  }
});


test('large rosters filter full names and email, retain actions, and clearly recover from no results', async ({ page }) => {
  await demo(page);
  await page.evaluate(() => {
    const key = 'trip-planner-demo-v1:demo-maya';
    const state = JSON.parse(localStorage.getItem(key)!);
    for (let i = 0; i < 22; i++) {
      state.trips[0].members.push({ id: `filter-${i}`, name: `Traveler ${i} Alexandria Montgomery-Wellington`, email: `traveler-${i}@example.test`, role: 'Viewer', status: 'accepted', days: [] });
    }
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.goto('./#/13');
  await page.reload();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ colorScheme: width === 768 ? 'dark' : 'light' });
    await page.getByRole('button', { name: 'Travelers', exact: true }).click();
    const filter = page.getByRole('searchbox', { name: 'Find a traveler' });
    await filter.fill('TRAVELER 21');
    await expect(page.locator('.collaborator-row')).toHaveCount(1);
    await expect(page.locator('#traveler-filter-count')).toHaveText('1 of 26 travelers');
    await expect(page.locator('.collaborator-row')).toContainText('Traveler 21 Alexandria Montgomery-Wellington');
    await expect(page.getByRole('button', { name: 'Change permissions for Traveler 21 Alexandria Montgomery-Wellington' })).toBeVisible();
    await page.evaluate(async () => { await document.fonts.ready; });
    await page.screenshot({ path: test.info().outputPath(`roster-filter-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await filter.fill('traveler-20@example.test');
    await expect(page.locator('.collaborator-row')).toHaveCount(1);
    await expect(page.locator('.collaborator-row')).toContainText('Traveler 20 Alexandria Montgomery-Wellington');
    await filter.fill('Nobody matches');
    await expect(page.locator('.collaborator-row')).toHaveCount(0);
    await expect(page.getByText('No travelers match “Nobody matches”. Try another name or email.')).toBeVisible();
    await page.getByRole('button', { name: 'Clear filter' }).click();
    await expect(filter).toHaveValue('');
    await expect(page.locator('.collaborator-row')).toHaveCount(26);
  }
});
