import { expect, test } from "@playwright/test";
import { seed } from "../src/data.ts";
import { installGoogleMapFixture } from "./google-map-fixture.ts";

for (const time of ["09:00", "23:00"]) {
  test(`Today map only shows its day's stops at ${time}`, async ({ page }) => {
    const store = seed();
    const trip = store.trips.find((item) => item.id === "seattle")!;
    store.tripId = trip.id;
    store.userId = "maya";
    store.date = "2026-10-16";
    store.time = time;
    trip.events.forEach((event, index) => {
      event.point = { lat: 47.6 + index * 0.001, lng: -122.3 + index * 0.001 };
    });
    await page.addInitScript((value) => {
      sessionStorage.setItem("trip-planner-demo-session", "active");
      localStorage.setItem("trip-planner-demo-v1:demo-maya", JSON.stringify(value));
    }, store);
    await installGoogleMapFixture(page);
    await page.goto("./#/10");

    const markers = page.locator("test-map-marker");
    const todays = trip.events.filter((event) => event.date === store.date);
    await expect(markers).toHaveCount(todays.length);
    for (const event of todays) {
      await expect(page.getByRole("button", { name: `Select ${event.place}`, exact: true })).toBeVisible();
    }
    await page.getByRole("button", { name: "Show all pins", exact: true }).click();
    await expect(markers).toHaveCount(todays.length);

    // The week selector changes the displayed day without changing the clock.
    // Compare stop identities: these days happen to have equal marker counts.
    const expectDayPins = async (date: string) => {
      const labels = trip.events.filter((event) => event.date === date)
        .map((event) => `Select ${event.place}`).sort();
      await expect.poll(() => markers.evaluateAll((items) =>
        items.map((item) => item.getAttribute("aria-label")).sort(),
      )).toEqual(labels);
    };
    for (const day of [15, 17]) {
      await page.getByRole("button", { name: `October ${day}, 2026`, exact: true }).click();
      await expect(page.getByRole("heading", { name: `Map for Oct ${day}`, exact: true })).toBeVisible();
      await expectDayPins(`2026-10-${day}`);
      await page.getByRole("button", { name: "Show all pins", exact: true }).click();
      await expectDayPins(`2026-10-${day}`);
    }
    await page.getByRole("button", { name: "Next week", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Map for Oct 18", exact: true })).toBeVisible();
    await expect(page.locator(".trip-map .map-feedback")).toHaveText("No plans for this day.");
    await expectDayPins("2026-10-18");
    await page.getByRole("button", { name: "Previous week", exact: true }).click();
    await expectDayPins("2026-10-17");
    await page.getByRole("button", { name: "October 16, 2026", exact: true }).click();
    await expectDayPins("2026-10-16");

    // An explicit agenda selection stays in sync with its map when the clock changes.
    if (!await page.getByRole("button", { name: "Prototype", exact: true }).isVisible()) {
      await page.getByRole("button", { name: "Open navigation menu", exact: true }).click();
    }
    await page.getByRole("button", { name: "Prototype", exact: true }).click();
    const timeTab = page.getByRole("button", { name: "Date & time", exact: true });
    if (await timeTab.isVisible()) await timeTab.click();
    await page.getByLabel("Demo date", { exact: true }).fill("2026-10-17");
    await page.getByRole("button", { name: "Apply & open Today", exact: true }).filter({ visible: true }).click();
    await expectDayPins("2026-10-16");
    await page.getByRole("button", { name: "October 17, 2026", exact: true }).click();
    const tomorrow = trip.events.filter((event) => event.date === "2026-10-17");
    await expect(markers).toHaveCount(tomorrow.length);
    for (const event of tomorrow) {
      await expect(page.getByRole("button", { name: `Select ${event.place}`, exact: true })).toBeVisible();
    }

    await page.getByRole("button", { name: "Open map", exact: true }).click();
    await expect(markers).toHaveCount(trip.events.length);
    await expect(page.getByRole("checkbox", { name: "Show events from all days on the trip" })).toBeChecked();
  });
}

test("Today with no plans never borrows another day's pins", async ({ page }) => {
  const store = seed();
  store.tripId = "seattle";
  store.userId = "maya";
  store.date = "2026-10-16";
  const trip = store.trips.find((item) => item.id === store.tripId)!;
  trip.events = trip.events.filter((event) => event.date !== store.date);
  trip.events.forEach((event) => { event.point = { lat: 47.6, lng: -122.3 }; });
  await page.addInitScript((value) => {
    sessionStorage.setItem("trip-planner-demo-session", "active");
    localStorage.setItem("trip-planner-demo-v1:demo-maya", JSON.stringify(value));
  }, store);
  await installGoogleMapFixture(page);
  await page.goto("./#/10");
  await expect(page.locator(".trip-map .map-feedback")).toHaveText("No plans for this day.");
  await expect(page.locator("test-map-marker")).toHaveCount(0);
  await page.getByRole("button", { name: "Show all pins", exact: true }).click();
  await expect(page.locator("test-map-marker")).toHaveCount(0);
});
