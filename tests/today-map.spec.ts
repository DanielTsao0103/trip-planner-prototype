import { expect, test, type Page } from "@playwright/test";
import { seed } from "../src/data.ts";
import { installGoogleMapFixture } from "./google-map-fixture.ts";

async function setup(page: Page, time = "09:00", change?: (store: ReturnType<typeof seed>) => void) {
  const store = seed(); store.tripId = "seattle"; store.userId = "maya"; store.date = "2026-10-16"; store.time = time;
  change?.(store);
  await page.addInitScript(value => {
    if (!localStorage.getItem("trip-planner-demo-v1:demo-maya")) localStorage.setItem("trip-planner-demo-v1:demo-maya", JSON.stringify(value));
    sessionStorage.setItem("trip-planner-demo-session", "active");
  }, store);
  await installGoogleMapFixture(page);
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
  await page.locator(".today-rest summary").click();
  await expect(page.locator(".today-rest li")).toHaveCount(2);
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
