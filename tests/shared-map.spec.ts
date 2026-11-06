import { expect, test } from "@playwright/test";
import { seed } from "../src/data.ts";

test("select a shared stop, fine-tune its pin, reload, and restore the overview", async ({
  page,
}) => {
  const store = seed();
  store.tripId = "seattle";
  store.userId = "maya";
  await page.addInitScript((value) => {
    sessionStorage.setItem("trip-planner-demo-session", "active");
    if (!localStorage.getItem("trip-planner-demo-v1:demo-maya"))
      localStorage.setItem(
        "trip-planner-demo-v1:demo-maya",
        JSON.stringify(value),
      );
  }, store);
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  await page.route("https://photon.komoot.io/**", (route) =>
    route.fulfill({ json: { features: [] } }),
  );
  await page.goto("./#/17");
  const museum = page.getByRole("button", {
    name: "Select Seattle Art Museum",
    exact: true,
  });
  await expect(museum).toBeVisible();
  await museum.focus();
  await museum.press("Enter");
  await expect(
    page.getByRole("link", { name: "Directions", exact: true }),
  ).toHaveAttribute("href", /47.6077008%2C-122.3385575/);
  await page.getByRole("button", { name: "Adjust pin" }).click();
  const map = page.locator(".trip-map-host");
  await map.focus();
  await map.press("ArrowRight");
  await expect
    .poll(
      async () => await map.locator(".leaflet-map-pane").getAttribute("style"),
    )
    .toContain("translate");
  await page.getByRole("button", { name: "Save pin", exact: true }).click();
  const url = await page
    .getByRole("link", { name: "Directions", exact: true })
    .getAttribute("href");
  expect(url).not.toContain("47.6077008%2C-122.3385575");
  await page.reload();
  await museum.click();
  await expect(
    page.getByRole("link", { name: "Directions", exact: true }),
  ).toHaveAttribute("href", url!);
  await page.getByRole("button", { name: "Show all pins" }).click();
  await expect(
    page.getByRole("link", { name: "Directions", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
