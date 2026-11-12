import { expect, test, type Page } from "@playwright/test";
import { installGoogleMapFixture } from "./google-map-fixture";
import { blankPrefs } from "../src/domain";
import { DEFAULT_STYLE } from "../src/theme";

type MapState = { center: { lat: number; lng: number }; zoom: number; heading: number; tilt: number; mapTypeId: string; colorScheme: string };
async function mapStates(page: Page): Promise<MapState[]> {
  return page.evaluate("window.__googleMapFixture.instances");
}
async function lastMap(page: Page): Promise<MapState> {
  return (await mapStates(page)).at(-1)!;
}

/** A slow initial account-style read can resolve after a traveler opens the map. */
async function openMapWithPendingStyle(page: Page, tilesLoaded = true) {
  await installGoogleMapFixture(page, { tilesLoaded });
  await page.addInitScript(style => localStorage.setItem("trip-planner-style", JSON.stringify(style)), { ...DEFAULT_STYLE, matchDevice: false });
  const account = { id: "11111111-1111-4111-8111-111111111111", email: "map-style@example.test", aud: "authenticated", role: "authenticated", user_metadata: { name: "Map traveler" }, app_metadata: { provider: "email" }, created_at: "2026-01-01T00:00:00Z" };
  const traveler = account.id;
  const trip = {
    tripID: "33333333-3333-4333-8333-333333333333", owner_id: account.id,
    trip_name: "Map appearance weekend", destinations: ["Seattle"], timezone: "America/Los_Angeles",
    start_date: "2027-05-01", end_date: "2027-05-04", content_version: 1, revision: 1,
    content: {
      members: [{ id: traveler, accountId: account.id, name: "Map traveler", email: account.email, role: "Owner", status: "accepted", days: [] }],
      prefs: { [traveler]: blankPrefs() }, image: "", expenses: [], todos: [], dismissed: [], budget: null, individual: {}, budgetMode: "group",
      events: [{ id: "museum", name: "Museum visit", place: "Seattle Art Museum", point: { lat: 47.6077, lng: -122.3386 }, date: "2027-05-01", start: "10:00", end: "11:00", notes: "", attendees: [traveler], image: "", cost: 0 }],
    },
  };
  let releaseStyle!: () => void;
  const styleResponse = new Promise<void>(resolve => { releaseStyle = resolve; });
  await page.route("https://*.supabase.co/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/token")) return route.fulfill({ json: { user: account, access_token: "qa-token", refresh_token: "qa-refresh", expires_in: 3600, token_type: "bearer" } });
    if (path.endsWith("/user")) return route.fulfill({ json: account });
    if (path.endsWith("/user_style")) {
      await styleResponse;
      return route.fulfill({ json: { user_id: account.id, theme: "blue", match_device: false, mode: "dark", heading: "serif", corners: "soft" } });
    }
    if (path.endsWith("/load_trip_bundles")) return route.fulfill({ json: [trip] });
    if (path.endsWith("/read_invited_trip")) return route.fulfill({ json: trip });
    if (path.endsWith("/save_account_trip")) {
      trip.content.events = route.request().postDataJSON().p_data.events;
      trip.revision++;
      return route.fulfill({ json: trip });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("./");
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill("qa-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  await page.goto("./#/5");
  await page.getByRole("button", { name: trip.trip_name, exact: true }).click();
  await page.goto("./#/17?event=museum");
  await expect.poll(async () => (await mapStates(page)).length).toBe(1);
  if (!tilesLoaded) await page.locator(".trip-map-host").dispatchEvent("tilesloaded");
  await expect(page.locator(".trip-map")).toHaveAttribute("data-map-state", "ready");
  return releaseStyle;
}

for (const mode of ["light", "dark", "device"] as const) {
  test(`map initializes with the resolved ${mode} appearance`, async ({ page }) => {
    await installGoogleMapFixture(page);
    await page.emulateMedia({ colorScheme: mode === "dark" ? "light" : "dark" });
    await page.addInitScript(style => {
      sessionStorage.setItem("trip-planner-demo-session", "active");
      localStorage.setItem("trip-planner-style", JSON.stringify(style));
    }, { ...DEFAULT_STYLE, matchDevice: mode === "device", mode: mode === "dark" ? "dark" : "light" });
    await page.goto("./#/17?event=museum");
    await expect(page.locator(".trip-map")).toHaveAttribute("data-map-state", "ready");
    expect((await lastMap(page)).colorScheme).toBe(mode === "light" ? "LIGHT" : "DARK");
    if (mode !== "device") {
      const initial = await lastMap(page);
      await page.emulateMedia({ colorScheme: "light" });
      await page.emulateMedia({ colorScheme: "dark" });
      expect(await mapStates(page)).toHaveLength(1);
      expect(await lastMap(page)).toEqual(initial);
    }
  });
}

async function openDeviceMap(page: Page, tilesLoaded = true) {
  await installGoogleMapFixture(page, { tilesLoaded });
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(() => sessionStorage.setItem("trip-planner-demo-session", "active"));
  await page.goto("./#/17?event=museum");
  if (!tilesLoaded) {
    await expect.poll(async () => (await mapStates(page)).length).toBe(1);
    await page.locator(".trip-map-host").dispatchEvent("tilesloaded");
  }
  await expect(page.locator(".trip-map")).toHaveAttribute("data-map-state", "ready");
}

for (const action of ["Save pin", "Cancel pin placement", "Escape"]) {
  test(`slow appearance tiles restore the pin opener after ${action}`, async ({ page }) => {
    await openDeviceMap(page, false);
    await page.getByRole("button", { name: "Adjust pin", exact: true }).click();
    await expect(page.locator(".trip-map-host")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(() => page.evaluate(() => document.documentElement.style.colorScheme)).toBe("dark");
    if (action === "Escape") await page.keyboard.press("Escape");
    else await page.getByRole("button", { name: action, exact: true }).click();
    await expect.poll(async () => (await mapStates(page)).length).toBe(2);
    await expect(page.locator(".trip-map")).toHaveAttribute("data-map-state", "loading");
    await page.locator(".trip-map-host").dispatchEvent("tilesloaded");
    const opener = page.getByRole("button", { name: "Adjust pin", exact: true });
    await expect(opener).toBeFocused();
    expect(await opener.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      const nav = document.querySelector<HTMLElement>(".mobile-nav");
      const bottom = nav?.getClientRects().length ? nav.getBoundingClientRect().top : innerHeight;
      return bounds.top >= 0 && bounds.bottom <= bottom;
    })).toBe(true);
  });
}

test("late appearance tiles preserve focus deliberately moved away from a completed pin", async ({ page }) => {
  await openDeviceMap(page, false);
  await page.getByRole("button", { name: "Adjust pin", exact: true }).click();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(() => page.evaluate(() => document.documentElement.style.colorScheme)).toBe("dark");
  await page.getByRole("button", { name: "Cancel pin placement", exact: true }).click();
  await expect.poll(async () => (await mapStates(page)).length).toBe(2);
  const elsewhere = page.getByRole("button", { name: "Nearby suggestion", exact: true });
  await elsewhere.focus();
  await page.locator(".trip-map-host").dispatchEvent("tilesloaded");
  await expect(page.locator(".trip-map")).toHaveAttribute("data-map-state", "ready");
  await expect(elsewhere).toBeFocused();
});

test("device appearance changes reconstruct the idle map while retaining camera, satellite and focus", async ({ page }) => {
  await openDeviceMap(page);
  await page.getByRole("button", { name: "Satellite", exact: true }).click();
  const zoom = page.getByRole("button", { name: "Zoom out", exact: true });
  await zoom.click();
  await zoom.focus();
  const before = await lastMap(page);
  for (const [deviceMode, mapScheme] of [["dark", "DARK"], ["light", "LIGHT"]] as const) {
    await page.emulateMedia({ colorScheme: deviceMode });
    await expect.poll(async () => (await lastMap(page)).colorScheme).toBe(mapScheme);
    await expect(page.locator(".trip-map")).toHaveAttribute("data-map-state", "ready");
    expect(await lastMap(page)).toEqual({ ...before, colorScheme: mapScheme });
    await expect(zoom).toBeFocused();
    await expect(page.getByRole("button", { name: "Satellite", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Select Seattle Art Museum", exact: true })).toHaveAttribute("aria-pressed", "true");
  }
  expect(await mapStates(page)).toHaveLength(3);
});

for (const action of ["Save pin", "Cancel pin placement"]) {
  test(`device appearance waits for ${action} and then applies without losing coordinates or focus`, async ({ page }) => {
    await openDeviceMap(page);
    const directions = page.getByRole("link", { name: "Directions", exact: true });
    const original = await directions.getAttribute("href");
    await page.getByRole("button", { name: "Adjust pin", exact: true }).click();
    await expect(page.locator(".trip-map-host")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    const draft = await lastMap(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(() => page.evaluate(() => document.documentElement.style.colorScheme)).toBe("dark");
    expect(await mapStates(page)).toHaveLength(1);
    expect(await lastMap(page)).toEqual(draft);
    await expect(page.locator(".trip-map-host")).toBeFocused();
    await page.getByRole("button", { name: action, exact: true }).click();
    await expect.poll(async () => (await lastMap(page)).colorScheme).toBe("DARK");
    await expect(page.locator(".trip-map")).toHaveAttribute("data-map-state", "ready");
    expect(await lastMap(page)).toEqual({ ...draft, colorScheme: "DARK" });
    await expect(page.getByRole("button", { name: "Adjust pin", exact: true })).toBeFocused();
    if (action === "Save pin") expect(await directions.getAttribute("href")).not.toBe(original);
    else expect(await directions.getAttribute("href")).toBe(original);
    expect(await mapStates(page)).toHaveLength(2);
  });
}

test("late explicit appearance preserves the selected stop, custom zoom, satellite and keyboard focus", async ({ page }) => {
  const release = await openMapWithPendingStyle(page);
  await page.getByRole("button", { name: "Satellite", exact: true }).click();
  const zoomOut = page.getByRole("button", { name: "Zoom out", exact: true });
  await zoomOut.click();
  await zoomOut.click();
  await zoomOut.focus();
  const before = await lastMap(page);
  release();
  await expect.poll(async () => (await lastMap(page)).colorScheme).toBe("DARK");
  await expect(page.locator(".trip-map")).toHaveAttribute("data-map-state", "ready");
  expect(await lastMap(page)).toEqual({ ...before, colorScheme: "DARK" });
  await expect(zoomOut).toBeFocused();
  await expect(page.getByRole("button", { name: "Select Seattle Art Museum", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Satellite", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page).toHaveURL(/#\/17\?event=museum$/);
  await page.screenshot({ path: test.info().outputPath("appearance-camera-preserved.png") });
});

for (const action of ["Save pin", "Cancel pin placement"]) {
  test(`late explicit appearance waits for ${action} without discarding the draft or focus`, async ({ page }) => {
    const release = await openMapWithPendingStyle(page);
    const directions = page.getByRole("link", { name: "Directions", exact: true });
    const original = await directions.getAttribute("href");
    await page.getByRole("button", { name: "Adjust pin", exact: true }).click();
    await expect(page.locator(".trip-map-host")).toBeFocused();
    await page.keyboard.press("ArrowRight");
    const draft = await lastMap(page);
    release();
    await expect.poll(() => page.evaluate(() => document.documentElement.style.colorScheme)).toBe("dark");
    expect(await mapStates(page)).toHaveLength(1);
    expect(await lastMap(page)).toEqual(draft);
    await expect(page.locator(".trip-map-host")).toBeFocused();
    await page.getByRole("button", { name: action, exact: true }).click();
    await expect.poll(async () => (await lastMap(page)).colorScheme).toBe("DARK");
    await expect(page.locator(".trip-map")).toHaveAttribute("data-map-state", "ready");
    expect(await lastMap(page)).toEqual({ ...draft, colorScheme: "DARK" });
    await expect(page.getByRole("button", { name: "Adjust pin", exact: true })).toBeFocused();
    if (action === "Save pin") expect(await directions.getAttribute("href")).not.toBe(original);
    else expect(await directions.getAttribute("href")).toBe(original);
  });
}

test("appearance reload retains recovery after slow tiles and Retry accepts late tiles", async ({ page }) => {
  await page.clock.install();
  const release = await openMapWithPendingStyle(page, false);
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  const before = await lastMap(page);
  release();
  await expect.poll(async () => (await mapStates(page)).length).toBe(2);
  await page.clock.fastForward(8500);
  await expect(page.getByText("Still loading Google Maps", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect.poll(async () => (await mapStates(page)).length).toBe(3);
  await page.clock.fastForward(8500);
  await expect(page.getByText("Still loading Google Maps", { exact: true })).toBeVisible();
  await page.locator(".trip-map-host").dispatchEvent("tilesloaded");
  await expect(page.locator(".trip-map")).toHaveAttribute("data-map-state", "ready");
  expect(await lastMap(page)).toEqual({ ...before, colorScheme: "DARK" });
  await expect(page.getByRole("link", { name: "Directions", exact: true })).toBeVisible();
});


test("appearance rebuild reconnects the focused selected marker", async ({ page }) => {
  const release = await openMapWithPendingStyle(page);
  const marker = page.getByRole("button", { name: "Select Seattle Art Museum", exact: true });
  await marker.focus();
  release();
  await expect.poll(async () => (await lastMap(page)).colorScheme).toBe("DARK");
  await expect(marker).toHaveCount(1);
  await expect(marker).toBeFocused();
  await expect(marker).toHaveAttribute("aria-pressed", "true");
});
