import { test, expect } from "@playwright/test";
import { seed } from "../src/data.ts";

test("Home keeps a returning trip and its key actions compact on a phone", async ({
  page,
}) => {
  const state = seed();
  state.tripId = "seattle";
  state.userId = "maya";
  state.trips.find((trip) => trip.id === "seattle")!.sample = false;
  await page.addInitScript((value) => {
    sessionStorage.setItem("trip-planner-demo-session", "active");
    localStorage.setItem(
      "trip-planner-demo-v1:demo-maya",
      JSON.stringify(value),
    );
  }, state);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./#/4");
  const resume = page.getByRole("button", {
    name: "Continue planning Seattle & Bainbridge getaway",
    exact: true,
  });
  await expect(resume).toBeInViewport({ ratio: 1 });
  await expect(
    page.getByRole("button", { name: "New trip", exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await expect(
    page.getByRole("heading", { name: "Pre-planned trips", exact: true }),
  ).toBeInViewport({ ratio: 1 });
  expect((await resume.boundingBox())!.height).toBeLessThan(120);
  const photo = page.locator(".recent-trip-card img");
  await expect
    .poll(() =>
      photo.evaluate(
        (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
      ),
    )
    .toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await resume.click();
  await expect(page).toHaveURL(/#\/8$/);
  await expect(
    page.getByRole("heading", {
      name: "Seattle & Bainbridge getaway",
      exact: true,
    }),
  ).toBeVisible();
  await page.goto("./#/4");
  await page.getByRole("button", { name: "All trips", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "My trips", exact: true }),
  ).toBeVisible();
  await page.goto("./#/4");
  await page.getByRole("button", { name: "New trip", exact: true }).click();
  await expect(page.getByLabel("Trip title", { exact: true })).toBeVisible();
});

test("an empty Home retains creation, templates and the sample without duplicate actions", async ({
  page,
}) => {
  const state = seed();
  state.trips = state.trips.filter((trip) => trip.sample);
  state.tripId = "seattle";
  state.userId = "maya";
  await page.addInitScript((value) => {
    sessionStorage.setItem("trip-planner-demo-session", "active");
    localStorage.setItem(
      "trip-planner-demo-v1:demo-maya",
      JSON.stringify(value),
    );
  }, state);
  await page.goto("./#/4");
  await expect(
    page.getByRole("button", { name: "New trip", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByText("No trips yet. Start with a new trip or an idea below.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Open the sample trip", exact: true })
    .click();
  await expect(
    page.getByRole("group", { name: "Itinerary view", exact: true }),
  ).toBeVisible();
});
