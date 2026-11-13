import { expect, test } from "@playwright/test";
import { seed } from "../src/data.ts";
import { installGoogleMapFixture } from "./google-map-fixture.ts";

test("map places group by trip day, use day colors, and filter visible pins", async ({ page }) => {
  const store = seed();
  const trip = store.trips.find((item) => item.id === "seattle")!;
  trip.events.forEach((event, index) => {
    event.point = { lat: 47.6 + index * 0.001, lng: -122.3 + index * 0.001 };
  });
  store.tripId = trip.id;
  store.userId = "maya";
  await page.addInitScript((value) => {
    sessionStorage.setItem("trip-planner-demo-session", "active");
    localStorage.setItem("trip-planner-demo-v1:demo-maya", JSON.stringify(value));
  }, store);
  await installGoogleMapFixture(page);
  await page.goto("./#/17");

  await expect(page.locator("test-map-marker")).toHaveCount(6);
  await expect(page.locator(".map-day-group")).toHaveCount(3);
  await expect(page.getByRole("checkbox", { name: "Show events from all days on the trip" })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "Show Day 1 events on the map" })).toBeChecked();
  await expect(page.locator(".map-day-group").nth(0).locator("details")).toHaveAttribute("open", "");
  await expect(page.locator(".map-day-group").nth(1).locator("summary")).toContainText("Day 2");

  const colorsByDate = await page.locator("test-map-marker").evaluateAll((markers, events) => {
    const byPlace = new Map(events.map((event) => [event.place, event.date]));
    return markers.map((marker) => ({
      date: byPlace.get(marker.getAttribute("aria-label")!.replace("Select ", "")),
      color: getComputedStyle(marker.querySelector(".trip-pin-face")!).backgroundColor,
    }));
  }, trip.events);
  const dayColors = new Map<string, Set<string>>();
  colorsByDate.forEach(({ date, color }) => {
    if (date) dayColors.set(date, new Set([...(dayColors.get(date) || []), color]));
  });
  expect(dayColors.size).toBe(3);
  expect(new Set([...dayColors.values()].map((colors) => [...colors][0])).size).toBe(3);

  const dayTwo = page.getByRole("checkbox", { name: "Show Day 2 events on the map" });
  await dayTwo.uncheck();
  await expect(page.locator("test-map-marker")).toHaveCount(4);
  await expect(dayTwo).not.toBeChecked();
  await expect(page.locator(".place-row")).toHaveCount(6);
  await expect(page.getByRole("checkbox", { name: "Show events from all days on the trip" })).not.toBeChecked();

  await page.getByRole("checkbox", { name: "Show events from all days on the trip" }).check();
  await expect(page.locator("test-map-marker")).toHaveCount(6);
  await expect(page.getByRole("checkbox", { name: "Show Day 2 events on the map" })).toBeChecked();
  const allDaysStyle = await page.locator(".map-day-all-toggle").evaluate((label) => ({
    text: getComputedStyle(label).color,
    checkbox: getComputedStyle(label.querySelector("input")!).accentColor,
  }));
  expect(allDaysStyle.checkbox).toBe(allDaysStyle.text);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: test.info().outputPath(`map-day-groups-${test.info().project.name}.png`) });
});
