import { expect, test, type Page } from '@playwright/test';

const actorId = '11111111-1111-4111-8111-111111111111';
const tripId = '22222222-2222-4222-8222-222222222222';
const bookingId = '33333333-3333-4333-8333-333333333333';

/** Exercise the real queue/UI, while keeping writes and identities entirely in memory. */
async function setup(page: Page, editor = false) {
  const account = { id: actorId, aud: 'authenticated', role: 'authenticated', email: 'booking-qa@example.invalid', user_metadata: { name: 'Booking QA' }, app_metadata: { provider: 'email' }, created_at: '2026-01-01T00:00:00Z' };
  const ownerId = editor ? '44444444-4444-4444-8444-444444444444' : actorId;
  let row: any = {
    tripID: tripId, owner_id: ownerId, created_by: ownerId, trip_name: 'Booking import QA', destinations: ['Seattle'], timezone: 'America/Los_Angeles', start_date: '2027-05-01', end_date: '2027-05-04', revision: 1, content_version: 1,
    content: { image: '', destinationTimezones: ['America/Los_Angeles'], events: [], expenses: [], prefs: {}, todos: [], dismissed: [], budget: null, budgetMode: 'group', individual: {}, members: [
      { id: ownerId, name: editor ? 'Trip Owner' : 'Booking QA', email: editor ? 'owner@example.invalid' : account.email, role: 'Owner', status: 'accepted', days: [] },
      ...(editor ? [{ id: actorId, accountId: actorId, name: 'Booking QA', email: account.email, role: 'Editor', status: 'accepted', days: [] }] : []),
    ] },
  };
  // An accepted collaborator has already completed their survey.
  if (editor) row.content.prefs[actorId] = { diet: [], food: '', spending: '', dining: '', atmosphere: '', access: [], walk: 1000, interests: [], destinations: '', tickets: '', notes: '' };
  const api = { failSave: false, failMarker: false, markers: 0, saves: 0, sharedSaves: 0, get row() { return row; } };
  await page.route('https://places.googleapis.com/**', route => route.abort());
  await page.route('https://*.supabase.co/**', route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path.endsWith('/token')) return route.fulfill({ json: { user: account, access_token: 'qa-token', refresh_token: 'qa-refresh', token_type: 'bearer', expires_in: 3600 } });
    if (path.endsWith('/user')) return route.fulfill({ json: account });
    if (path.endsWith('/load_trip_bundles')) return route.fulfill({ json: [row] });
    if (path.endsWith('/is_admin')) return route.fulfill({ json: false });
    if (path.endsWith('/record_trip_plan_access')) return route.fulfill({ json: true });
    if (path.endsWith('/forwarded_booking')) return route.fulfill({ json: [{ booking_id: bookingId, kind: 'event', title: 'Confirmed booking', start_date: '2027-05-01', end_date: null, location: 'Seattle', confirmation_code: null, sender: 'qa@example.invalid', received_at: '2026-11-16T00:00:00Z', trip_id: null, details: null }] });
    if (path.endsWith('/mark_forwarded_booking_added')) {
      api.markers++;
      if (api.failMarker) return route.fulfill({ status: 503, json: { message: 'Temporary list failure' } });
      const data = request.postDataJSON();
      expect(data).toEqual({ p_booking: bookingId, p_trip: tripId });
      expect(row.content.events.some((event: any) => event.id === bookingId)).toBe(true);
      return route.fulfill({ json: true });
    }
    if (path.endsWith('/save_account_trip') || path.endsWith('/save_shared_trip_changes')) {
      api.saves++;
      if (path.endsWith('/save_shared_trip_changes')) api.sharedSaves++;
      if (api.failSave) return route.fulfill({ status: 503, json: { message: 'Temporary save failure' } });
      const data = request.postDataJSON().p_data;
      row = { ...row, revision: row.revision + 1, content: { ...row.content, ...data } };
      return route.fulfill({ json: row });
    }
    if (path.endsWith('/read_invited_trip')) return route.fulfill({ json: row });
    if (path.includes('/functions/')) return route.fulfill({ json: { results: [] } });
    return route.fulfill({ json: [] });
  });
  await page.goto('./');
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill('qa-password');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await page.goto('./#/5');
  await page.getByRole('button', { name: row.trip_name, exact: true }).click();
  await page.goto(`./#/7?booking=${bookingId}&date=2027-05-01&suggestion=Confirmed%20booking&place=Seattle`);
  await page.getByLabel('Start time', { exact: true }).fill('10:00');
  await page.getByLabel('End time', { exact: true }).fill('11:00');
  return api;
}

test('a failed trip save never marks the booking added, and retry preserves one event', async ({ page }) => {
  const api = await setup(page); api.failSave = true;
  await page.getByRole('button', { name: 'Add to itinerary', exact: true }).click();
  await expect(page.locator('.account-save-banner')).toContainText('Not saved');
  expect(api.markers).toBe(0); expect(api.row.content.events).toHaveLength(0);
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
  api.failSave = false;
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(() => api.markers).toBe(1);
  expect(api.row.content.events).toHaveLength(1);
  expect(api.row.content.events[0].id).toBe(bookingId);
});

test('a failed booking marker can be retried without creating another event', async ({ page }) => {
  const api = await setup(page); api.failMarker = true;
  await page.getByRole('button', { name: 'Add to itinerary', exact: true }).click();
  await expect(page.getByText('Your plan is saved, but the forwarded booking list could not update. Try again to finish adding it.', { exact: true })).toBeVisible();
  expect(api.row.content.events).toHaveLength(1); expect(api.markers).toBe(1);
  api.failMarker = false;
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(() => api.markers).toBe(2);
  expect(api.row.content.events).toHaveLength(1);
  expect(api.row.content.events[0].id).toBe(bookingId);
});

test('an accepted Editor can import through the confirmed shared-save path', async ({ page }) => {
  const api = await setup(page, true);
  await page.getByRole('button', { name: 'Add to itinerary', exact: true }).click();
  await expect.poll(() => api.markers).toBe(1);
  expect(api.sharedSaves).toBeGreaterThan(0);
  expect(api.row.content.events).toHaveLength(1);
});

test('a traveler downgraded to Viewer can recover the saved plan after its booking marker failed', async ({ page }) => {
  const api = await setup(page, true); api.failMarker = true;
  await page.getByRole('button', { name: 'Add to itinerary', exact: true }).click();
  await expect(page.getByText('Your plan is saved, but the forwarded booking list could not update. Try again to finish adding it.', { exact: true })).toBeVisible();
  expect(api.row.content.events).toHaveLength(1);
  const savedWrites = api.saves;
  api.row.content.members.find((member: any) => member.id === actorId).role = 'Viewer';
  api.failMarker = false;
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'Home', exact: true })).toBeVisible();
  await page.locator('.home-bookings > summary').click();
  await expect(page.getByRole('combobox', { name: 'Trip for Confirmed booking' })).toHaveCount(0);
  await page.getByRole('button', { name: 'View saved plan', exact: true }).click();
  await expect.poll(() => api.markers).toBe(2);
  await expect(page).toHaveURL(new RegExp(`/#/11\\?.*event=${bookingId}`));
  expect(api.saves).toBe(savedWrites);
  expect(api.row.content.events).toHaveLength(1);
});

test('older waiting bookings remain reachable after fifty newer added bookings', async ({ page }) => {
  await setup(page);
  const ranges: string[] = [];
  let failMore = true;
  await page.route('**/rest/v1/forwarded_booking?**', route => {
    const url = new URL(route.request().url());
    const offset = Number(url.searchParams.get('offset') || 0);
    ranges.push(`${offset}:${url.searchParams.get('limit')}`);
    expect(url.searchParams.get('order')).toBe('received_at.desc,booking_id.desc');
    if (offset === 50 && failMore) return route.fulfill({ status: 422, json: { message: 'Temporary page failure' } });
    const rows = offset === 0 ? Array.from({ length: 50 }, (_, index) => ({ booking_id: `55555555-5555-4555-8555-${String(index).padStart(12, '0')}`, title: `Newer booking ${index}`, trip_id: tripId })) : [{ booking_id: bookingId, title: 'Older waiting booking', trip_id: null }];
    return route.fulfill({ json: rows.map(row => ({ kind: 'event', start_date: '2027-05-01', end_date: null, location: 'Seattle', confirmation_code: null, sender: 'qa@example.invalid', received_at: '2026-11-16T00:00:00Z', details: null, ...row })) });
  });
  await page.goto('./#/4');
  await page.locator('.home-bookings > summary').click();
  await expect(page.getByRole('heading', { name: 'Newer booking 49', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Older waiting booking', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Load more bookings', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('We could not load more bookings');
  await expect(page.getByRole('heading', { name: 'Newer booking 49', exact: true })).toBeVisible();
  failMore = false;
  await page.getByRole('button', { name: 'Load more bookings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Older waiting booking', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Load more bookings', exact: true })).toHaveCount(0);
  expect(ranges).toEqual(['0:50', '50:50', '50:50']);
  await page.getByRole('button', { name: 'Review and add', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/#/7\\?.*booking=${bookingId}`));
});
