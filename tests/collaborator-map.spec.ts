import { expect, test } from "@playwright/test";
import { blankPrefs } from "../src/domain.ts";

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
      prefs: { [traveler]: blankPrefs() }, image: "", expenses: [], todos: [], dismissed: [],
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
    if (path.endsWith("/save_trip_bundle")) throw new Error("Invited account attempted an owner write");
    if (path.endsWith("/save_shared_trip_changes")) {
      // Demote the editor while their save is in flight, before this database transaction starts.
      writes++;
      trip.content.members[0].role = "Viewer";
      trip.revision++;
      return route.fulfill({ status: 409, json: { code: "PT409", message: "The trip changed." } });
    }
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
  const editButton = event.getByRole("button", { name: "Edit event" });
  await editButton.click();
  const denial = page.getByRole("dialog");
  await expect(denial).toContainText("You do not have permission to edit this event.");
  await denial.getByRole("button", { name: "Got it" }).click();
  await expect(page).toHaveURL(/#\/11\?/);
  await expect(event).toContainText("Meet at the front");
  Object.assign(trip.content.events[0], { date: "2027-05-02", notes: "Meet at the south door" });
  trip.revision++;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(event).toContainText("Meet at the south door");
  await expect(page.getByRole("heading", { name: /Sunday/ })).toBeVisible();

  expect(writes).toBe(0);
  trip.content.members[0].role = "Editor";
  trip.revision++;
  await page.goto("./#/13");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".collaborator-row")).toContainText("Editor", { timeout: 10000 });
  await page.goto("./#/11?date=2027-05-02&event=museum");
  await editButton.click();
  const notes = page.getByLabel("Notes (optional)");
  await notes.fill("Unsubmitted draft");
  // A different trip setting and an automatic place lookup do not invalidate this event form.
  trip.trip_name += " updated";
  Object.assign(trip.content.events[0], { googlePlaceId: "qa-museum-place" });
  trip.revision++;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText(trip.trip_name, { exact: true }).filter({ visible: true }).first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeEnabled();
  trip.content.events[0].notes = "Owner's concurrent note";
  trip.revision++;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText(/This event changed while you were editing/)).toBeVisible({ timeout: 10000 });
  await expect(notes).toHaveValue("Unsubmitted draft");
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Delete event" })).toBeDisabled();
  expect(writes).toBe(0);
  await page.getByRole("button", { name: "View latest event" }).click();
  await expect(event).toContainText("Owner's concurrent note");
  await editButton.click();
  await notes.fill("This stale edit must disappear");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(denial).toContainText("You do not have permission to edit this event.");
  await denial.getByRole("button", { name: "Got it" }).click();
  await expect(event).toContainText("Owner's concurrent note");
  await expect(event).not.toContainText("This stale edit must disappear");
  await expect(page.locator(".account-save-banner")).toHaveCount(0);
  expect(await page.evaluate((id) => localStorage.getItem("trip-planner-pending-v1:" + id), account.id)).toBeNull();
  trip.content.events = [];
  trip.revision++;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(event).toHaveCount(0);
  await page.goto("./#/8");
  await expect(page.getByRole("heading", { name: trip.trip_name, exact: true }).first()).toBeVisible();
  revoked = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("button", { name: "Choose a trip", exact: true })).toBeVisible();
  expect(writes).toBe(1);
});
