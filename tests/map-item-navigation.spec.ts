import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("trip-planner-demo-session", "active"));
  await page.route("https://maps.googleapis.com/maps/api/js?**", (route) => route.abort());
});

test("map → daily item → edit keeps the item focused and cancel retains its saved day", async ({ page }) => {
  await page.goto("./#/17?event=museum");
  await page.getByRole("link", { name: "View itinerary item" }).click();
  const card = page.getByRole("article", { name: "A morning of art" });
  await card.getByRole("button", { name: "Edit event" }).click();
  await page.getByLabel("Day", {exact: true}).selectOption("2026-10-15");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole('dialog', { name: 'Discard event changes?' }).getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(card).toBeFocused();
  await expect(page).toHaveURL(/#\/11\?date=2026-10-16&event=museum$/);

  await card.getByRole("button", { name: "Edit event" }).click();
  await page.getByLabel("Day", {exact:true}).selectOption("2026-10-15");
  await page.getByRole("button", { name: "Save changes", exact:true }).click();
  await expect(page).toHaveURL(/#\/11\?date=2026-10-15&event=museum$/);
  await expect(card).toBeFocused();
});

test("map-origin edits reopen the selected stop after save or unchanged cancel", async ({ page }) => {
  const edit = "./#/7?event=museum&date=2026-10-16&return=17";
  await page.goto(edit);
  // Playwright dismisses unexpected dialogs: a needless discard prompt fails this assertion.
  await page.getByRole("button", {name:"Cancel",exact:true}).click();
  await expect(page).toHaveURL(/#\/17\?event=museum$/);
  await page.goto(edit);
  await page.getByLabel("Notes (optional)").fill("Meet outside the north entrance.");
  await page.getByRole("button", {name:"Save changes",exact:true}).click();
  await expect(page).toHaveURL(/#\/17\?event=museum$/);
  await page.getByRole("link", {name:"View itinerary item"}).click();
  await expect(page.getByRole("article", {name:"A morning of art"})).toContainText("Meet outside the north entrance.");
});

test("deleted event links offer recovery and never open an empty event form", async ({ page }) => {
  const edit = "./#/7?event=museum&date=2026-10-16&return=17";
  await page.goto(edit);
  await page.getByRole("button", {name:"Delete event",exact:true}).click();
  await page.locator(".delete-event-panel").getByRole("button", {name:"Delete event",exact:true}).click();
  await expect(page).toHaveURL(/#\/17$/);
  await page.goto("./#/17?event=museum");
  await expect(page.getByText("This stop was removed or no longer has a location.")).toBeVisible();
  await page.goto(edit);
  await expect(page.getByRole("heading", {name:"Itinerary item unavailable"})).toBeVisible();
  await expect(page.getByRole("button", {name:"Add to itinerary"})).toHaveCount(0);
  await page.getByRole("button", {name:"Back to map"}).click();
  await expect(page).toHaveURL(/#\/17$/);
  await page.goto("./#/17?event=museum");
  await expect(page.getByText("This stop was removed or no longer has a location.")).toBeVisible();
  await page.goto("./#/11?event=museum&date=2026-10-16");
  await page.getByRole("button", {name:"View day"}).click();
  await expect(page).toHaveURL(/#\/11\?date=2026-10-16$/);
  await expect(page.getByRole("article", {name:"Wander through Pike Place"})).toBeVisible();
});

test('a removed selected stop remains explained when no mapped places remain', async ({ page }) => {
  await page.goto('./#/17?event=museum');
  await expect(page.locator('.place-row')).not.toHaveCount(0);
  await page.evaluate(() => {
    const key = 'trip-planner-demo-v1:demo-maya';
    const state = JSON.parse(localStorage.getItem(key)!);
    state.trips.find((trip: { id: string }) => trip.id === state.tripId).events = [];
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await expect(page.locator('.place-row')).toHaveCount(0);
  await expect(page.locator('.map-empty-places').getByRole('status')).toHaveText('This stop was removed or no longer has a location.');
  await page.getByRole('button', { name: 'View itinerary', exact: true }).click();
  await expect(page).toHaveURL(/#\/8$/);
  await page.goto('./#/17');
  await expect(page.locator('.map-empty-places')).toContainText('Add a place to your itinerary to see it on the map.');
  await expect(page.locator('.map-empty-places').getByRole('status')).toHaveCount(0);
});
