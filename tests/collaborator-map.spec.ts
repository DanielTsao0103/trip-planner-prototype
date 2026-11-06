import { expect, test } from "@playwright/test";

test("a viewer follows a shared pin, receives itinerary changes, and loses access when removed", async ({ page }) => {
  // The browser is the invited account. Change the mock database row as if its owner
  // saved from a second device, without granting the viewer a write endpoint.
  const account = {
    id: "11111111-1111-4111-8111-111111111111", email: "viewer@example.com",
    aud: "authenticated", role: "authenticated", user_metadata: { name: "Viewer" },
    app_metadata: { provider: "email" }, created_at: "2026-01-01T00:00:00Z",
  };
  const traveler = "22222222-2222-4222-8222-222222222222";
  const trip = {
    tripID: "33333333-3333-4333-8333-333333333333", trip_name: "Shared museum weekend",
    destinations: ["Seattle"], timezone: "America/Los_Angeles",
    start_date: "2027-05-01", end_date: "2027-05-04", content_version: 1, revision: 1,
    content: {
      members: [{ id: traveler, accountId: account.id, name: "Viewer", email: account.email,
        role: "Viewer", status: "accepted", days: [] }],
      prefs: { [traveler]: {} }, image: "", expenses: [], todos: [], dismissed: [],
      budget: null, individual: {}, budgetMode: "group",
      events: [{ id: "museum", name: "Museum visit", place: "Seattle Art Museum",
        point: { lat: 47.6077, lng: -122.3386 }, date: "2027-05-01", start: "10:00", end: "11:00",
        notes: "Meet at the front", attendees: [traveler], image: "", cost: 0 }],
    },
  };
  let revoked = false;
  let writes = 0;
  await page.route("https://*.supabase.co/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/token")) return route.fulfill({ json: {
      user: account, access_token: "qa-token", refresh_token: "qa-refresh",
      expires_in: 3600, token_type: "bearer",
    } });
    if (path.endsWith("/user")) return route.fulfill({ json: account });
    if (path.endsWith("/load_trip_bundles")) return route.fulfill({ json: revoked ? [] : [trip] });
    if (path.endsWith("/read_invited_trip")) return revoked
      ? route.fulfill({ status: 403, json: { code: "42501", message: "Trip access denied" } })
      : route.fulfill({ json: trip });
    if (path.endsWith("/save_trip_bundle")) writes++;
    return route.fulfill({ json: [] });
  });
  await page.route("https://maps.googleapis.com/maps/api/js?**", route => route.abort());
  await page.goto("./");
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill("qa-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  await page.goto("./#/5");
  await page.getByRole("button", { name: trip.trip_name, exact: true }).click();
  await page.goto("./#/17?event=museum");
  await page.getByRole("link", { name: "View itinerary item" }).click();
  const event = page.getByRole("article", { name: "Museum visit" });
  await expect(event.getByRole("button", { name: "Edit event" })).toBeDisabled();
  await expect(event).toContainText("Meet at the front");
  Object.assign(trip.content.events[0], { date: "2027-05-02", notes: "Meet at the south door" });
  trip.revision++;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(event).toContainText("Meet at the south door");
  await expect(page.getByRole("heading", { name: /Sunday/ })).toBeVisible();

  trip.content.events = [];
  trip.revision++;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(event).toHaveCount(0);
  await page.goto("./#/8");
  await expect(page.getByRole("heading", { name: trip.trip_name, exact: true }).first()).toBeVisible();
  revoked = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("button", { name: "Choose a trip", exact: true })).toBeVisible();
  expect(writes).toBe(0);
});
