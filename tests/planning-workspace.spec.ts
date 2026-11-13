import { test, expect } from "@playwright/test";
import { seed } from "../src/data.ts";
import { installGoogleMapFixture } from "./google-map-fixture";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("trip-planner-demo-session", "active"),
  );
  await installGoogleMapFixture(page);
  await page.route("https://places.googleapis.com/**", (route) =>
    route.abort(),
  );
  await page.route("https://photon.komoot.io/**", (route) => route.abort());
});
test("saved ideas retain drafts on cancel, survive reload, schedule once, and confirm removal", async ({
  page,
}) => {
  await page.goto("./#/8?view=list&date=2026-10-16");
  await page.getByRole("button", { name: "Save a place", exact: true }).click();
  await page.getByLabel("Place name", { exact: true }).fill("A quiet garden");
  await page.getByLabel("Where", { exact: true }).fill("Seattle garden");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const discard = page.getByRole("dialog", {
    name: "Discard saved place?",
    exact: true,
  });
  await discard
    .getByRole("button", { name: "Keep editing", exact: true })
    .click();
  await expect(page.getByLabel("Place name", { exact: true })).toHaveValue(
    "A quiet garden",
  );
  await page.getByRole("button", { name: "Save place", exact: true }).click();
  await expect(page.locator(".saved-place-row")).toContainText(
    "A quiet garden",
  );
  await page.reload();
  await page.getByRole("button", { name: "Show places", exact: true }).click();
  await page
    .locator(".saved-place-row")
    .getByRole("button", { name: "Schedule", exact: true })
    .click();
  await expect(page.getByLabel("Event name", { exact: true })).toHaveValue(
    "A quiet garden",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Show places", exact: true }).click();
  await expect(page.locator(".saved-place-row")).toContainText(
    "A quiet garden",
  );
  await page
    .getByRole("button", {
      name: "Remove saved place A quiet garden",
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog", { name: "Remove saved place?", exact: true })
    .getByRole("button", { name: "Remove place", exact: true })
    .click();
  await page.reload();
  await expect(page.locator(".saved-place-row")).toHaveCount(0);
});
test("daily planning keeps dates across views and synchronizes stop selection without horizontal overflow", async ({
  page,
}, info) => {
  await page.goto("./#/11?date=2026-10-16");
  const article = page.getByRole("article", {
    name: "A morning of art",
    exact: true,
  });
  await article
    .getByRole("button", { name: "Seattle Art Museum", exact: true })
    .click();
  const map = page.getByRole("complementary", {
    name: "Map of selected day",
    exact: true,
  });
  await expect(map).toBeVisible();
  await expect(map.locator(".next-place-card")).toContainText("SELECTED STOP");
  if (info.project.name === "mobile")
    await page.getByRole("button", { name: "Day plan", exact: true }).click();
  await expect(article).toHaveClass(/focused/);
  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page).toHaveURL(/date=2026-10-16/);
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page).toHaveURL(/date=2026-10-16/);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
test("viewers see saved ideas without actions that require editing permission", async ({
  page,
}) => {
  const store = seed();
  store.userId = "nora";
  store.tripId = "seattle";
  store.trips.find((t) => t.id === "seattle")!.savedPlaces = [
    { id: "idea", name: "Garden", place: "Seattle", notes: "" },
  ];
  await page.addInitScript(
    (value) =>
      localStorage.setItem(
        "trip-planner-demo-v1:demo-maya",
        JSON.stringify(value),
      ),
    store,
  );
  await page.goto("./#/8?view=list");
  await page.getByRole("button", { name: "Show places", exact: true }).click();
  await expect(page.locator(".saved-place-row")).toContainText("Garden");
  await expect(
    page.getByRole("button", { name: "Save a place", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".saved-place-row button")).toHaveCount(0);
});
