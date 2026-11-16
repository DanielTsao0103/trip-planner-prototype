import { expect, test, type Page } from "@playwright/test";
import { seed } from "../src/data.ts";
import { installGoogleMapFixture } from "./google-map-fixture.ts";

async function openDefaultSettings(page: Page) {
  if (!(await page.locator('.today-default-settings').evaluate(element => (element as HTMLDetailsElement).open))) await page.locator('.today-default-settings > summary').click();
}

async function setup(page: Page, time = "09:00", change?: (store: ReturnType<typeof seed>) => void) {
  const store = seed(); store.tripId = "seattle"; store.userId = "maya"; store.date = "2026-10-16"; store.time = time;
  change?.(store);
  await page.addInitScript(value => {
    if (!localStorage.getItem("trip-planner-demo-v1:demo-maya")) localStorage.setItem("trip-planner-demo-v1:demo-maya", JSON.stringify(value));
    sessionStorage.setItem("trip-planner-demo-session", "active");
  }, store);
  await installGoogleMapFixture(page);
  await page.route("https://places.googleapis.com/**", route => route.fulfill({ json: { suggestions: [], places: [] } }));
  await page.route("https://photon.komoot.io/**", route => route.fulfill({ json: { features: [] } }));
  await page.route("https://routes.googleapis.com/**", route => {
    const { travelMode } = route.request().postDataJSON();
    return route.fulfill({ json: { routes: [{ duration: { WALK: "1200s", TRANSIT: "600s", DRIVE: "300s" }[travelMode as string], distanceMeters: 1200 }] } });
  });
  await page.goto("./#/10");
}

test("Today starts with next stop, asks for origin, compares routes and navigates with selected mode", async ({ page }) => {
  await setup(page);
  await expect(page.getByRole("region", { name: "Next stop", exact: true })).toContainText("A morning of art");
  await expect(page.locator(".trip-map, .week-card")).toHaveCount(0);
  await expect(page.locator(".today-departure")).toHaveCount(0);
  await page.getByLabel("Starting address or place").fill("Seattle Central Library");
  await page.getByRole("button", { name: "Use start", exact: true }).click();
  await expect(page.locator(".today-departure")).toContainText("Leave by 9:30 AM");
  await page.getByRole("group", { name: "Transportation" }).getByRole("button", { name: /Transit/ }).click();
  await expect(page.locator(".today-departure")).toContainText("Leave by 9:40 AM");
  const link = page.getByRole("link", { name: "Open transit directions" });
  const url = new URL((await link.getAttribute("href"))!);
  expect(url.searchParams.get("origin")).toBe("Seattle Central Library");
  expect(url.searchParams.get("travelmode")).toBe("transit");
  await page.getByRole("button", { name: "2 reminders left", exact: true }).click();
  await expect(page.locator(".todo-card")).toBeFocused();
  await page.getByRole("checkbox", { name: "Have museum tickets handy", exact: true }).check();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Have museum tickets handy", exact: true })).toBeChecked();
  await page.locator(".today-rest-disclosure > summary").click();
  await expect(page.locator(".today-timeline-stop")).toHaveCount(2);
});

test("ongoing activity stays distinct and next transfer uses the previous stop's finish", async ({ page }) => {
  await setup(page, "11:30", store => {
    const trip = store.trips.find(t => t.id === "seattle")!;
    trip.events.find(e => e.id === "museum")!.end = "12:50";
  });
  await expect(page.getByRole("region", { name: "Happening now", exact: true })).toContainText("A morning of art");
  await expect(page.locator(".today-origin")).toContainText("Previous itinerary stop");
  await expect(page.locator(".today-departure")).toContainText("Arrival about 10 min late");
  await page.getByRole("group", { name: "Transportation" }).getByRole("button", { name: /Drive/ }).click();
  await expect(page.locator(".today-departure")).toContainText("arrival buffer is tight");
});

test("route failure preserves navigation and retry without fabricated times", async ({ page }) => {
  await setup(page);
  await page.route("https://routes.googleapis.com/**", route => route.fulfill({ status: 429, json: { error: {} } }));
  await page.getByLabel("Starting address or place").fill("Seattle hotel");
  await page.getByRole("button", { name: "Use start", exact: true }).click();
  await expect(page.locator(".today-route-error")).toContainText("limit has been reached");
  await expect(page.locator(".today-departure")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open walk directions" })).toBeVisible();
  await page.route("https://routes.googleapis.com/**", route => route.fulfill({ json: { routes: [{ duration: "600s", distanceMeters: 500 }] } }));
  await page.getByRole("button", { name: "Refresh estimates" }).click();
  await expect(page.locator(".today-departure")).toContainText("Leave by 9:40 AM");
});

test("changing the origin discards late replies from the previous route", async ({ page }) => {
  await setup(page);
  let release!: () => void;
  const paused = new Promise<void>(resolve => { release = resolve; });
  await page.route("https://routes.googleapis.com/**", async route => {
    const body = route.request().postDataJSON();
    if (body.origin.address === "Old hotel") await paused;
    await route.fulfill({ json: { routes: [{ duration: body.origin.address === "Old hotel" ? "3600s" : "600s", distanceMeters: 500 }] } }).catch(() => {});
  });
  await page.getByLabel("Starting address or place").fill("Old hotel");
  await page.getByRole("button", { name: "Use start", exact: true }).click();
  await page.getByRole("button", { name: "Change", exact: true }).click();
  await page.getByLabel("Starting address or place").fill("New hotel");
  await page.getByRole("button", { name: "Use start", exact: true }).click();
  await expect(page.locator(".today-departure")).toContainText("Leave by 9:40 AM");
  release();
  await expect(page.locator(".today-origin")).toContainText("New hotel");
  await expect(page.locator(".today-departure")).toContainText("Leave by 9:40 AM");
});

for (const variant of ["empty", "finished", "missing", "viewer"] as const) {
  test(`Today ${variant} state stays useful`, async ({ page }) => {
    await setup(page, variant === "finished" ? "23:00" : "09:00", store => {
      const trip = store.trips.find(t => t.id === "seattle")!;
      if (variant === "empty") trip.events = trip.events.filter(e => e.date !== store.date);
      if (variant === "missing") { const event = trip.events.find(e => e.id === "museum")!; event.place = ""; event.point = null; event.googlePlaceId = null; }
      if (variant === "viewer") trip.members.find(m => m.id === "maya")!.role = "Viewer";
    });
    if (variant === "empty") await expect(page.getByRole("heading", { name: "No events today", exact: true })).toBeVisible();
    if (variant === "finished") await expect(page.getByRole("heading", { name: "No more plans today", exact: true })).toBeVisible();
    if (variant === "missing") { await expect(page.locator(".today-missing-location")).toBeVisible(); await expect(page.getByRole("group", { name: "Transportation" })).toHaveCount(0); }
    if (variant === "viewer") { await expect(page.getByRole("checkbox", { name: "Have museum tickets handy", exact: true })).toBeDisabled(); await expect(page.getByLabel("New to-do")).toHaveCount(0); }
    await expect(page.locator(".trip-map, .week-card")).toHaveCount(0);
    await page.getByRole("button", { name: "Open itinerary", exact: true }).click();
    await expect(page).toHaveURL(/#\/11\?date=2026-10-16/);
  });
}

test("location is requested explicitly and navigation uses the returned coordinates", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 47.6067, longitude: -122.3325 });
  await setup(page);
  await expect(page.locator(".today-departure")).toHaveCount(0);
  await page.getByRole("button", { name: "Use my location", exact: true }).click();
  await expect(page.locator(".today-origin")).toContainText("Your location when requested");
  await expect(page.locator(".today-departure")).toBeVisible();
  const url = new URL((await page.getByRole("link", { name: "Open walk directions" }).getAttribute("href"))!);
  expect(url.searchParams.get("origin")).toBe("47.6067,-122.3325");
  expect(await page.evaluate(() => localStorage.getItem("trip-planner-demo-v1:demo-maya"))).not.toContain("47.6067");
});

test("denied location keeps manual start usable", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.geolocation.getCurrentPosition = (_success, error) => error?.({ code: 1, message: "Denied", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
  });
  await setup(page);
  await page.getByRole("button", { name: "Use my location", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Couldn't get your location");
  await page.getByLabel("Starting address or place").fill("Seattle hotel");
  await page.getByRole("button", { name: "Use start", exact: true }).click();
  await expect(page.locator(".today-departure")).toBeVisible();
});

test("a stalled route times out and leaves directions usable", async ({ page }) => {
  await page.clock.install();
  await setup(page);
  await page.route("https://routes.googleapis.com/**", () => new Promise(() => {}));
  await page.getByLabel("Starting address or place").fill("Seattle hotel");
  await page.getByRole("button", { name: "Use start", exact: true }).click();
  await expect(page.getByRole("group", { name: "Transportation" })).toContainText("Checking");
  await page.clock.runFor(10050);
  await expect(page.locator(".today-route-error")).toContainText("took too long");
  await expect(page.locator(".today-departure")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Open walk directions" })).toBeVisible();
});


test("Today reuses event autocomplete and routes from the selected place, clearing it after typing", async ({ page }) => {
  await setup(page);
  const origins: unknown[] = [];
  await page.route("https://routes.googleapis.com/**", route => {
    const origin = route.request().postDataJSON().origin;
    if (origin.placeId === "hotel-seattle" || origin.address === "A different meeting point") origins.push(origin);
    return route.fulfill({ json: { routes: [{ duration: "600s", distanceMeters: 500 }] } });
  });
  await page.route("https://places.googleapis.com/v1/places:autocomplete", route => route.fulfill({ json: {
    suggestions: [{ placePrediction: { placeId: "hotel-seattle", text: { text: "Hyatt Regency Seattle, Seattle, WA" }, structuredFormat: { mainText: { text: "Hyatt Regency Seattle" }, secondaryText: { text: "Seattle, WA" } } } }],
  } }));
  const input = page.getByRole("combobox", { name: "Starting address or place", exact: true });
  await input.fill("Hyatt");
  await expect(page.getByRole("option", { name: "Hyatt Regency Seattle Seattle, WA" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("today-autocomplete.png"), fullPage: true });
  await input.press("ArrowDown"); await input.press("Enter");
  await expect(input).toHaveValue("Hyatt Regency Seattle, Seattle, WA");
  expect(origins).toHaveLength(0); // Enter selects a suggestion; it must not submit the form.
  await page.getByRole("button", { name: "Use start", exact: true }).click();
  await expect(page.locator(".today-departure")).toBeVisible();
  expect(origins).toEqual([{ placeId: "hotel-seattle" }, { placeId: "hotel-seattle" }, { placeId: "hotel-seattle" }]);
  const url = new URL((await page.getByRole("link", { name: "Open walk directions" }).getAttribute("href"))!);
  expect(url.searchParams.get("origin_place_id")).toBe("hotel-seattle");
  await page.getByRole("button", { name: "Change", exact: true }).click();
  await expect(input).toHaveValue("Hyatt Regency Seattle, Seattle, WA");
  await input.fill("A different meeting point"); await input.press("Escape");
  await page.getByRole("button", { name: "Use start", exact: true }).click();
  await expect.poll(() => origins.length).toBe(6);
  expect(origins.slice(3)).toEqual(Array(3).fill({ address: "A different meeting point" }));
});

function addThirdStop(store: ReturnType<typeof seed>) {
  const trip = store.trips.find(t => t.id === "seattle")!;
  const first = trip.events.find(e => e.id === "museum")!; first.start = "11:00"; first.end = "12:00";
  const lunch = trip.events.find(e => e.date === store.date && e.id !== "museum")!; lunch.start = "12:30"; lunch.end = "13:15";
  trip.events.push({ ...first, id: "tour-test", name: "Reserved tour", place: "Seattle tour entrance", start: "13:45", end: "15:00", notes: "" });
}

test("remaining connections use their selected mode, retain overrides and show precise lateness", async ({ page }) => {
  await setup(page, "09:00", addThirdStop);
  await page.route("https://routes.googleapis.com/**", route => route.fulfill({ json: { routes: [{ duration: { WALK: "2280s", TRANSIT: "1440s", DRIVE: "840s" }[route.request().postDataJSON().travelMode as string], distanceMeters: 1000 }] } }));
  await page.locator('.today-rest-disclosure > summary').click();
  await page.getByRole('button', { name: 'Refresh connections', exact: true }).click();
  const legs = page.locator('.today-connection');
  await expect(legs).toHaveCount(2);
  await expect(legs.last()).toContainText('arrive 1:53 PM');
  await expect(legs.last()).toContainText('8 min after Reserved tour starts');
  await openDefaultSettings(page);
  await page.getByRole('group', { name: 'Default travel preference' }).getByRole('button', { name: 'Transit', exact: true }).click();
  await expect(legs.last()).toContainText('On time, with 6 min before the start');
  await expect(page.getByRole('group', { name: 'Transportation' }).getByRole('button', { name: /Transit/ })).toHaveAttribute('aria-pressed', 'true');
  await legs.last().locator('summary').click();
  await legs.last().locator('select').selectOption('DRIVE');
  await expect(legs.last()).toContainText('Drive · about 14 min');
  await openDefaultSettings(page);
  await page.getByRole('group', { name: 'Default travel preference' }).getByRole('button', { name: 'Walk', exact: true }).click();
  await expect(legs.first()).toContainText('Walk · about 38 min');
  await expect(legs.last()).toContainText('Drive · about 14 min');
  await page.reload(); await page.locator('.today-rest-disclosure > summary').click();
  await expect(page.locator('.today-connection').last()).toContainText('Drive · about 14 min');
  await expect(page.locator('.today-connection').last()).toContainText('Custom');
});

test("collapsed day exposes incomplete estimates and never treats a missing location as zero travel", async ({ page }) => {
  await setup(page, '09:00', store => { addThirdStop(store); const event = store.trips.find(t => t.id === 'seattle')!.events.find(e => e.id === 'tour-test')!; event.place = ''; event.point = null; event.googlePlaceId = null; });
  await expect(page.locator('.today-rest-disclosure > summary')).toContainText('1 estimate unavailable');
  await expect(page.locator('.today-rest-disclosure > summary')).toContainText('estimated so far');
  await page.locator('.today-rest-disclosure > summary').click();
  await expect(page.locator('.today-connection').last()).toContainText('Location missing for Reserved tour');
  await expect(page.locator('.today-connection').last()).not.toContainText('0 min');
});

test("later connections request only the selected mode until options open", async ({ page }) => {
  const requests: string[] = [];
  await page.on('request', request => { if (request.url().startsWith('https://routes.googleapis.com/')) requests.push(request.postDataJSON().travelMode); });
  await setup(page, '09:00', addThirdStop);
  await expect.poll(() => requests.length).toBe(2);
  expect(requests).toEqual(['WALK', 'WALK']);
  await page.locator('.today-rest-disclosure > summary').click();
  await page.locator('.today-connection').last().locator('summary').click();
  await expect.poll(() => requests.length).toBe(4);
  expect(requests.slice(2).sort()).toEqual(['DRIVE', 'TRANSIT']);
});

test("return destination uses autocomplete identity, survives reload and can be removed", async ({ page }) => {
  await setup(page);
  await page.route('https://places.googleapis.com/v1/places:autocomplete', route => route.fulfill({ json: { suggestions: [{ placePrediction: { placeId: 'return-hotel', text: { text: 'Hotel Seattle' }, structuredFormat: { mainText: { text: 'Hotel Seattle' }, secondaryText: { text: 'Seattle' } } } }] } }));
  const panel = page.getByRole('region', { name: 'Return journey' });
  await panel.getByRole('button', { name: 'Choose return place' }).click();
  await panel.getByRole('combobox', { name: 'Return address or place', exact: true }).fill('Hotel');
  await panel.getByRole('listbox').getByRole('option').first().click();
  await panel.getByRole('button', { name: 'Use return place' }).click();
  await expect(panel).toContainText('Walk · about 20 min');
  let url = new URL((await panel.getByRole('link', { name: 'Return directions' }).getAttribute('href'))!);
  expect(url.searchParams.get('destination_place_id')).toBe('return-hotel');
  expect(url.searchParams.get('origin')).toBeTruthy();
  await page.reload(); await expect(panel).toContainText('Hotel Seattle');
  await panel.getByRole('button', { name: 'Change return place' }).click();
  await panel.getByRole('combobox', { name: 'Return address or place', exact: true }).fill('Another hotel');
  await panel.getByRole('button', { name: 'Use return place' }).click();
  url = new URL((await panel.getByRole('link', { name: 'Return directions' }).getAttribute('href'))!);
  expect(url.searchParams.has('destination_place_id')).toBe(false);
  await panel.getByRole('button', { name: 'Remove return place' }).click();
  await page.reload(); await expect(panel.getByRole('button', { name: 'Choose return place' })).toBeVisible();
});

test("return journey after the final stop retains manual origin and unavailable-route recovery", async ({ page }) => {
  await setup(page, '23:00');
  const panel = page.getByRole('region', { name: 'Return journey' });
  await panel.getByRole('button', { name: 'Choose return place' }).click();
  await panel.getByRole('combobox', { name: 'Return address or place', exact: true }).fill('My hotel');
  await panel.getByRole('button', { name: 'Use return place' }).click();
  await expect(panel).toContainText('change this if you have moved');
  await panel.locator('.today-return-start > summary').click();
  await page.route('https://routes.googleapis.com/**', route => route.fulfill({ status: 429, json: {} }));
  await panel.getByRole('combobox', { name: 'Return starting point', exact: true }).fill('Actual meeting point');
  await panel.getByRole('button', { name: 'Use return start' }).click();
  await expect(panel).toContainText('limit has been reached');
  expect(new URL((await panel.getByRole('link', { name: 'Return directions' }).getAttribute('href'))!).searchParams.get('origin')).toBe('Actual meeting point');
});

test("next stop surfaces saved essentials and safe links without inventing ticket details", async ({ page }) => {
  await setup(page, '09:00', store => { const event = store.trips.find(t => t.id === 'seattle')!.events.find(e => e.id === 'museum')!; event.notes = 'North entrance. Ticket: https://example.com/ticket javascript:alert(1)'; });
  const panel = page.getByRole('region', { name: 'Next stop', exact: true });
  await expect(panel.getByText('North entrance.', { exact: false })).toBeVisible();
  await expect(panel.getByRole('link', { name: /https:\/\/example.com\/ticket/ })).toHaveAttribute('href', 'https://example.com/ticket');
  await panel.locator('.today-address > summary').click();
  await expect(panel.locator('.today-large-address')).toContainText('Seattle Art Museum');
  await expect(panel.locator('a[href^="javascript:"]')).toHaveCount(0);
});

test("blocked device storage explains that personal choices are temporary", async ({ page }) => {
  await page.addInitScript(() => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key.startsWith('trip-today-personal-v1:')) throw new DOMException('Full', 'QuotaExceededError'); return set.call(this, key, value); }; });
  await setup(page);
  await page.locator('.today-rest-disclosure > summary').click();
  await openDefaultSettings(page);
  await page.getByRole('group', { name: 'Default travel preference' }).getByRole('button', { name: 'Drive', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText("couldn't be remembered");
  await expect(page.locator('.today-connection')).toContainText('Drive · about 5 min');
});

test("current journey can override and reset transport without changing the trip default", async ({ page }) => {
  await setup(page, '12:10');
  await openDefaultSettings(page);
  const defaultMode = page.getByRole('group', { name: 'Default travel preference' });
  const current = page.getByRole('group', { name: 'Transportation' });
  await current.getByRole('button', { name: /Drive/ }).click();
  await expect(defaultMode.getByRole('button', { name: 'Walk', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Use default (Walk)', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Use default (Walk)', exact: true }).click();
  await expect(current.getByRole('button', { name: /Walk/ })).toHaveAttribute('aria-pressed', 'true');
});

test("future planned departures do not instruct leaving now and ongoing destinations retain directions", async ({ page }) => {
  await setup(page, '12:00', store => { store.trips.find(t => t.id === 'seattle')!.events.find(e => e.id === 'museum')!.end = '12:50'; });
  await page.getByRole('group', { name: 'Transportation' }).getByRole('button', { name: /Drive/ }).click();
  await expect(page.locator('.today-departure')).toContainText('Departing at 12:50 PM');
  await expect(page.locator('.today-departure')).not.toContainText('Leave now');
  await expect(page.getByRole('link', { name: 'Directions to A morning of art' })).toBeVisible();
});

test("account clock refreshes current transit requests without refetching walking or driving", async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-16T16:00:00Z') });
  const requests: {travelMode: string; departureTime?: string}[] = [];
  page.on('request', request => { if (request.url().startsWith('https://routes.googleapis.com/') && request.postDataJSON().origin.address === 'My hotel') requests.push(request.postDataJSON()); });
  await setup(page, '09:00', store => { store.trips.find(t => t.id === 'seattle')!.persistence = 'account'; });
  await page.getByLabel('Starting address or place', { exact: true }).fill('My hotel');
  await page.getByRole('button', { name: 'Use start', exact: true }).click();
  await expect.poll(() => requests.length).toBe(3);
  const initial = requests.find(r => r.travelMode === 'TRANSIT')!.departureTime!;
  await page.clock.runFor(61000);
  await expect.poll(() => requests.filter(r => r.travelMode === 'TRANSIT').length).toBe(2);
  expect(requests.filter(r => r.travelMode === 'WALK')).toHaveLength(1);
  expect(requests.filter(r => r.travelMode === 'DRIVE')).toHaveLength(1);
  expect(Date.parse(requests.filter(r => r.travelMode === 'TRANSIT')[1].departureTime!)).toBeGreaterThan(Date.parse(initial));
});

test("finished-day account return transit refreshes with its advancing departure time", async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-16T22:00:00Z') });
  const departures: string[] = [];
  page.on('request', request => { if (request.url().startsWith('https://routes.googleapis.com/') && request.postDataJSON().destination.address === 'Return hotel') departures.push(request.postDataJSON().departureTime); });
  await setup(page, '15:00', store => { store.trips.find(t => t.id === 'seattle')!.persistence = 'account'; });
  await openDefaultSettings(page);
  await page.getByRole('group', { name: 'Default travel preference' }).getByRole('button', { name: 'Transit', exact: true }).click();
  await page.getByRole('button', { name: 'Choose return place' }).click();
  await page.getByLabel('Return address or place', { exact: true }).fill('Return hotel');
  await page.getByRole('button', { name: 'Use return place' }).click();
  await expect.poll(() => departures.length).toBe(1);
  await page.clock.runFor(61000);
  await expect.poll(() => departures.length).toBe(2);
  expect(Date.parse(departures[1])).toBeGreaterThan(Date.parse(departures[0]));
  await expect(page.locator('.today-return-route')).toContainText('Depart 3:01 PM');
});

for (const laterStop of [false, true]) test(`ongoing destination preserves its custom incoming mode (${laterStop ? 'later event' : 'final event'})`, async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('trip-today-personal-v1:demo:maya:seattle', JSON.stringify({ mode: 'WALK', overrides: { '2026-10-16:museum:market': 'DRIVE' } })));
  await setup(page, '13:05', store => { if (laterStop) { const trip = store.trips.find(t => t.id === 'seattle')!; trip.events.push({ ...trip.events.find(e => e.id === 'museum')!, id: 'late-tour', name: 'Later tour', start: '15:00', end: '16:00' }); } });
  if (laterStop) {
    const link = page.getByRole('link', { name: 'Directions to Wander through Pike Place' });
    expect(new URL((await link.getAttribute('href'))!).searchParams.get('travelmode')).toBe('driving');
  } else await expect(page.getByRole('group', { name: 'Transportation' }).getByRole('button', { name: /Drive/ })).toHaveAttribute('aria-pressed', 'true');
});

test("quota failure stops automatic transit refresh while retaining explicit retry", async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-16T16:00:00Z') });
  await setup(page, '09:00', store => { store.trips.find(t => t.id === 'seattle')!.persistence = 'account'; });
  let calls = 0;
  await page.route('https://routes.googleapis.com/**', route => { if (route.request().postDataJSON().origin.address === 'Quota hotel') calls++; return route.fulfill({ status: 429, json: {} }); });
  await page.getByLabel('Starting address or place', { exact: true }).fill('Quota hotel');
  await page.getByRole('button', { name: 'Use start', exact: true }).click();
  await expect(page.locator('.today-route-error')).toContainText('limit has been reached');
  const initial = calls;
  await page.clock.runFor(121000);
  await expect(page.locator('.today-route-error')).toContainText('limit has been reached');
  expect(calls).toBe(initial);
});


test("320px Today keeps origin actions and transport values on one line", async ({page}) => {
  await page.setViewportSize({width:320,height:568});
  await setup(page, "11:30");
  const change = page.locator(".today-origin").getByRole("button", {name:"Change",exact:true});
  await expect(change).toBeVisible();
  // A text range detects mid-word wrapping that document overflow checks miss.
  const lines = await change.evaluate(element => { const range=document.createRange(); range.selectNodeContents(element); return range.getClientRects().length; });
  expect(lines).toBe(1);
  const modes = page.getByRole("group", {name:"Transportation"});
  await expect(modes.getByRole("button", {name:/Walk/})).toBeVisible();
  expect(await modes.locator("strong").evaluateAll(elements => elements.every(element => { const range=document.createRange(); range.selectNodeContents(element); return range.getClientRects().length === 1; }))).toBe(true);
  await modes.getByRole("button", {name:/Transit/}).click();
  await expect(modes.getByRole("button", {name:/Transit/})).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});


test("short landscape Today exposes the next stop without hiding current directions", async ({page}) => {
  await page.setViewportSize({width:844,height:390});
  await setup(page, "11:30");
  const next = page.getByRole("region", {name:"Next stop",exact:true}).getByRole("heading",{name:"Wander through Pike Place",exact:true});
  await expect(next).toBeInViewport();
  await expect(page.getByRole("region", {name:"Happening now"}).getByRole("link", {name:"Directions to A morning of art",exact:true})).toBeVisible();
  await page.locator(".today-default-settings > summary").click();
  await expect(page.getByRole("group",{name:"Default travel preference"})).toBeVisible();
});
