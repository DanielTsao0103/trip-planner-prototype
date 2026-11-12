import { installGoogleMapFixture } from "./google-map-fixture";
import { expect, test } from "@playwright/test";
import { seed } from "../src/data.ts";

test("slow map tiles offer recovery and become ready when they arrive", async ({ page }) => {
  await installGoogleMapFixture(page, { tilesLoaded: false });
  await page.clock.install();
  await page.addInitScript(() => sessionStorage.setItem('trip-planner-demo-session', 'active'));
  await page.goto('./#/17');
  await expect(page.locator('.trip-map-host')).toHaveAttribute('tabindex', '0');
  await page.clock.fastForward(8500);
  await expect(page.getByText('Still loading Google Maps', { exact: true })).toBeVisible();
  await expect(page.locator('.google-map-state').getByRole('button', { name: 'Retry', exact: true })).toBeVisible();
  await page.locator('.trip-map-host').evaluate(host => host.dispatchEvent(new Event('tilesloaded')));
  await expect(page.locator('.trip-map')).toHaveAttribute('data-map-state', 'ready');
  await expect(page.getByText('Still loading Google Maps', { exact: true })).toHaveCount(0);
});

test("a delayed map SDK offers recovery before its connection timeout", async ({ page }) => {
  await page.route('https://maps.googleapis.com/**', () => {});
  await page.clock.install();
  await page.addInitScript(() => sessionStorage.setItem('trip-planner-demo-session', 'active'));
  await page.goto('./#/17');
  await expect(page.getByText('Loading Google Maps…', { exact: true })).toBeVisible();
  await page.clock.fastForward(8500);
  await expect(page.getByText('Still loading Google Maps', { exact: true })).toBeVisible();
  await page.clock.fastForward(8000);
  await expect(page.getByText('Google Maps could not connect. Check your connection and retry.', { exact: true })).toBeVisible();
  await expect(page.getByText('Still loading Google Maps', { exact: true })).toHaveCount(0);
});

test("map access denial remains accurate after the tile timeout", async ({ page }) => {
  await installGoogleMapFixture(page, { tilesLoaded: false });
  await page.clock.install();
  await page.goto("./");
  await page.getByRole("button", { name: "Try demo as Maya", exact: true }).click();
  await page.goto("./#/17");
  await expect(page.locator('.trip-map-host')).toHaveAttribute("tabindex", "0");
  await page.evaluate(() => window.dispatchEvent(new Event("trip-google-maps-auth-failure")));
  await expect(page.getByText("Your itinerary is still available. Try again later or open Google Maps.", { exact: true })).toBeVisible();
  await page.clock.fastForward(20000);
  await expect(page.getByText("Your itinerary is still available. Try again later or open Google Maps.", { exact: true })).toBeVisible();
  await expect(page.getByText("Google Maps is taking longer than usual to display this area.", { exact: true })).toHaveCount(0);
  await expect(page.locator('.trip-map[data-map-state="unavailable"]')).toBeVisible();
});

test("select a shared stop, fine-tune its pin, reload, and restore the overview", async ({
  page,
}) => {
  const store = seed();
  const stops = store.trips.find((t) => t.id === "seattle")!.events;
  stops[0].place = "400 Broad St, Seattle, WA";
  stops[1].place = "85 Pike St, Seattle, WA";
  stops.reverse(); // Saved event order can differ from the itinerary after a reschedule.
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
  // Keep the save/reload regression deterministic. Live provider rendering is
  // checked separately with the published origin and its restricted browser key.
  await installGoogleMapFixture(page);
  await page.route("https://photon.komoot.io/**", (route) =>
    route.fulfill({ json: { features: [] } }),
  );
  await page.goto("./#/17");
  await expect(
    page.getByRole("button", {
      name: "Select 400 Broad St, Seattle, WA",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Select 85 Pike St, Seattle, WA",
      exact: true,
    }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("trip-planner-demo-v1:demo-maya")!,
          ).trips.find((t: { id: string }) => t.id === "seattle").events.find((e: { id: string }) => e.id === "hotel")?.googlePlaceId,
      ),
    )
    .toBe("needle");
  const museum = page.getByRole("button", {
    name: "Select Seattle Art Museum",
    exact: true,
  });
  await expect(museum).toBeVisible();
  // Simulate two Google marker faces drawn on top of one another at this zoom.
  const overlap = await page.addStyleTag({ content: `
    test-map-marker[aria-label="Select Seattle Art Museum"],
    test-map-marker[aria-label="Select 400 Broad St, Seattle, WA"] {
      position: absolute; top: 100px; left: 100px;
    }` });
  await museum.focus();
  await museum.press("Enter");
  const picker = page.getByRole("group", { name: "Choose a map stop" });
  await expect(picker.getByRole("button", {name: /Settle into our city stay/})).toBeVisible();
  await picker.getByRole("button", {name: /A morning of art/}).click();
  await expect(picker).toHaveCount(0);
  // Reopening from a partially scrolled map must reveal the chooser's close control.
  await page.locator('.trip-map-host').evaluate(host => window.scrollTo(0, host.getBoundingClientRect().top + window.scrollY + 160));
  await museum.evaluate(marker => (marker as HTMLElement).focus({ preventScroll: true }));
  await page.keyboard.press('Enter');
  await expect(picker.getByRole('button', { name: 'Close stop list', exact: true })).toBeFocused();
  await expect.poll(() => picker.evaluate(panel => {
    const bounds = panel.getBoundingClientRect();
    const nav = document.querySelector<HTMLElement>('.mobile-nav');
    const bottom = nav?.getClientRects().length ? nav.getBoundingClientRect().top : innerHeight;
    return bounds.top >= 0 && bounds.bottom <= bottom;
  })).toBe(true);
  await page.screenshot({ path: test.info().outputPath('reopened-map-choices-visible.png') });
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  await expect(museum).toBeFocused();
  await overlap.evaluate((el) => el.remove());
  await expect(
    page.getByRole("link", { name: "Directions", exact: true }),
  ).toHaveAttribute("href", /47.6077008%2C-122.3385575/);
  const adjustPin = page.getByRole("button", { name: "Adjust pin" });
  await adjustPin.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", {name:"Cancel pin placement",exact:true})).toHaveText("Cancel");
  if (test.info().project.name === "mobile") {
    await page.setViewportSize({width:390,height:600});
    const toolbar=await page.locator('.trip-map-tools').boundingBox(), actions=await page.locator('.pin-placement').boundingBox();
    expect(toolbar!.y+toolbar!.height).toBeLessThanOrEqual(actions!.y);
    const crosshair=await page.locator('.pin-crosshair').boundingBox();
    expect(crosshair!.y+crosshair!.height).toBeLessThan(actions!.y);
    await page.screenshot({path:test.info().outputPath('short-pin-actions.png')});
  }
  const map = page.locator(".trip-map-host");
  await expect(map).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Save pin", exact: true }).click();
  await expect(adjustPin).toBeFocused();
  const url = await page
    .getByRole("link", { name: "Directions", exact: true })
    .getAttribute("href");
  expect(url).not.toContain("47.6077008%2C-122.3385575");
  await expect(page.getByRole("link", { name: "Open A morning of art in itinerary" })).toBeVisible();
  await expect(page.locator(".place-select").first()).toContainText("Settle into our city stay");
  await expect(page).toHaveURL(/#\/17\?event=museum$/);
  await page.reload();
  await expect(page.getByRole("button", { name: /A morning of art.*Seattle Art Museum/ }))
    .toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("link", { name: "Directions", exact: true }),
  ).toHaveAttribute("href", url!);
  await page.getByRole("button", { name: "Show all pins" }).click();
  await expect(
    page.getByRole("link", { name: "Directions", exact: true }),
  ).toHaveCount(0);
  const ferry = page.getByRole("button", {name: /Across the sound.*Bainbridge Island ferry/});
  await ferry.click();
  await page.getByRole("button", { name: "Place pin", exact: true }).click();
  if (await page.getByRole("button", { name: "Save pin" }).isDisabled()) {
    for (let step = 0; step < 14; step++) await page.getByRole("button", { name: "Zoom in" }).click();
  }
  await page.getByRole("button", { name: "Save pin" }).click();
  await page.reload();
  await expect(ferry).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("link", {name: "Directions", exact:true})).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  if (test.info().project.name === "mobile") {
    await page.evaluate(() => { const key="trip-planner-demo-v1:demo-maya", state=JSON.parse(localStorage.getItem(key)!); state.trips.find((t: any)=>t.id===state.tripId).events.find((e: any)=>e.id==="museum").name="A very long gallery visit with the whole group and a detailed meeting point before the afternoon tour"; localStorage.setItem(key,JSON.stringify(state)); });
    await page.reload();
    await page.goto("./#/17?event=museum");
    await page.getByRole("button",{name:"Adjust pin",exact:true}).click();
    await expect.poll(async()=>{const cross=await page.locator('.pin-crosshair').boundingBox(), bar=await page.locator('.pin-placement').boundingBox();return !!cross&&!!bar&&cross.y+cross.height<bar.y;}).toBe(true);
    await expect(page.getByRole("button",{name:"Save pin",exact:true})).toBeInViewport();
    await page.screenshot({path:test.info().outputPath('short-long-pin-actions.png')});
    await page.getByRole("button",{name:"Cancel pin placement",exact:true}).click();
  }
});

test("a blocked Google SDK offers recovery and keeps saved directions available", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("trip-planner-demo-session", "active"),
  );
  await page.route("https://maps.googleapis.com/maps/api/js?**", (route) =>
    route.abort(),
  );
  await page.goto("./#/17?event=museum");
  await expect(
    page.getByText("Google Maps is unavailable", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Open Google Maps", exact: true }),
  ).toHaveAttribute("href", /47.6077008/);
  await expect(
    page.getByRole("link", { name: "Directions", exact: true }),
  ).toHaveAttribute("href", /47.6077008/);
  await page.getByRole("link", { name: "View itinerary item" }).click();
  const item = page.getByRole("article", { name: "A morning of art" });
  await expect(item).toBeFocused();
  await expect(item).toBeInViewport();
  await expect(item).toContainText("Tickets are in our sample confirmations");
  await item.getByRole("button", { name: "Seattle Art Museum" }).click();
  await expect(page).toHaveURL(/#\/17\?event=museum$/);
});

test("a viewer can collapse a stop, return to it with Back, and follow a rescheduled event", async ({page}) => {
  const store = seed();
  store.tripId = "seattle";
  store.userId = "nora";
  const address = "Seattle Art Museum " + "A".repeat(1950);
  store.trips.find(t => t.id === "seattle")!.events.find(e => e.id === "museum")!.place = address;
  await page.addInitScript(value => {
    sessionStorage.setItem("trip-planner-demo-session", "active");
    localStorage.setItem("trip-planner-demo-v1:demo-maya", JSON.stringify(value));
  }, store);
  await page.route("https://maps.googleapis.com/maps/api/js?**", r => r.abort());
  await page.goto("./#/17");
  const row = page.getByRole("button", {name: /A morning of art.*Seattle Art Museum/});
  await row.click();
  await row.click();
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await row.click();
  await page.getByRole("link", {name:"View itinerary item"}).click();
  const item = page.getByRole("article", {name:"A morning of art"});
  await expect(item).toBeVisible();
  await expect(item.getByRole("button", {name:"Edit event"})).toHaveCount(0);
  await page.goBack();
  await expect(row).toHaveAttribute("aria-expanded", "true");
  await page.goto("./#/11?date=2026-10-15&event=museum");
  await expect(item).toBeFocused();
  await expect(page.getByRole("heading", {name:/Friday/})).toBeVisible();
  const addressLink = item.getByRole("button", {name:address});
  expect(await addressLink.evaluate((el) =>
    el.getBoundingClientRect().right <= el.closest("article")!.getBoundingClientRect().right
  )).toBe(true);
});
