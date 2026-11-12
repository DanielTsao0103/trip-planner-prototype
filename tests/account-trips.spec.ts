import { test, expect, type Page } from "@playwright/test";

const owner = {
  id: "11111111-1111-4111-8111-111111111111",
  aud: "authenticated",
  role: "authenticated",
  email: "owner@example.com",
  user_metadata: { name: "Owner Traveler" },
  app_metadata: { provider: "email" },
  created_at: "2026-01-01T00:00:00Z",
};
const session = () => ({
  user: owner,
  access_token: "test-token",
  refresh_token: "test-refresh",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
});
async function login(page: Page) {
  await page.goto("./");
  await page.getByLabel("Email", { exact: true }).fill(owner.email);
  await page.getByLabel("Password", { exact: true }).fill("qa-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
}
async function fillTrip(page: Page) {
  await page.route('https://geocoding-api.open-meteo.com/**', route => route.fulfill({json:{results:[{name:'Taipei',timezone:'Asia/Taipei'}]}}));
  await page.goto("./#/6");
  await page.getByLabel("Trip title", { exact: true }).fill("Account weekend");
  await page.getByLabel("Where are you going?", { exact: true }).fill("Taipei");
  await page.getByLabel("Start date", { exact: true }).fill("2027-05-01");
  await page.getByLabel("End date", { exact: true }).fill("2027-05-04");
}

test("account saves recover from lost responses without duplicate trips, reload, edit, and delete", async ({
  page,
}) => {
  const rows: any[] = [];
  let loseResponse = true;
  let failDelete = true;
  let conflict = false;
  const ids: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://*.supabase.co/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/rest/v1/forwarded_booking")
      return route.fulfill({ json: [] });
    if (url.pathname === "/rest/v1/user_style")
      return route.fulfill({ json: [] });
    if (url.pathname === "/rest/v1/rpc/trip_companion_pictures")
      return route.fulfill({ json: [] });
    if (url.pathname === "/rest/v1/rpc/set_google_picture")
      return route.fulfill({ status: 204 });
    if (url.pathname.endsWith("/token"))
      return route.fulfill({ json: session() });
    if (url.pathname.endsWith("/user")) return route.fulfill({ json: owner });
    if (url.pathname === "/rest/v1/rpc/read_invited_trip")
      return route.fulfill({ json: rows.find(row => row.tripID === request.postDataJSON().p_trip) });
    if (url.pathname === "/rest/v1/rpc/load_trip_bundles")
      return route.fulfill({ json: rows });
    if (url.pathname === "/rest/v1/trip_photo_credit" && request.method() === "GET")
      return route.fulfill({ json: [] });
    if (url.pathname === "/functions/v1/unsplash-search" && request.method() === "GET")
      return route.fulfill({ json: { results: [] } });
    if (
      url.pathname === "/rest/v1/rpc/save_account_trip"
    ) {
      const requestData = request.postDataJSON();
      const draft = requestData.p_data;
      ids.push(draft.id);
      if (conflict)
        return route.fulfill({
          status: 409,
          json: {
            code: "PT409",
            message:
              "This trip changed or was deleted elsewhere. Reload before editing it again.",
          },
        });
      const row = {
        tripID: draft.id,
        owner_id: owner.id,
        created_by: owner.id,
        trip_name: draft.title,
        destination: draft.destinations[0],
        destinations: draft.destinations,
        start_date: draft.start,
        end_date: draft.end,
        timezone: draft.zone,
        revision: rows[0]?.revision ?? 1,
        photoCredit: requestData.p_photo_credit ?? rows[0]?.photoCredit ?? null,
        content_version: 1,
        content: {
          image: draft.image,
          destinationTimezones: requestData.p_destination_timezones ?? draft.destinationTimezones,
          members: draft.members,
          events: draft.events,
          expenses: draft.expenses,
          prefs: draft.prefs,
          budget: draft.budget,
          budgetMode: draft.budgetMode,
          individual: draft.individual,
          todos: draft.todos,
          dismissed: draft.dismissed,
        },
      };
      if (
        rows[0] &&
        JSON.stringify(rows[0].content) !== JSON.stringify(row.content)
      )
        row.revision++;
      rows[0] = row;
      if (loseResponse) {
        loseResponse = false;
        return route.abort("failed");
      }
      return route.fulfill({ json: row });
    }
    if (url.pathname === "/rest/v1/trip" && request.method() === "DELETE") {
      expect(url.searchParams.get("owner_id")).toBe(`eq.${owner.id}`);
      if (failDelete) {
        failDelete = false;
        return route.fulfill({ status: 503, json: { message: "Unavailable" } });
      }
      const deleted = rows.splice(0);
      return route.fulfill({
        json: deleted.map((r) => ({ tripID: r.tripID })),
      });
    }
    throw new Error(`Unexpected request ${request.method()} ${url.pathname}`);
  });
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Home" }),
  ).toBeVisible();
  await fillTrip(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("trip-form.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Create trip", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Could not confirm" }).first(),
  ).toContainText("Could not confirm");
  await expect(page.getByLabel("Trip title", { exact: true })).toHaveValue(
    "Account weekend",
  );
  await page.getByRole("button", { name: "Create trip", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Account weekend", exact: true }),
  ).toBeVisible();
  expect(new Set(ids).size).toBe(1);
  expect(rows.length).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("saved-trip.png"),
    fullPage: true,
  });
  // Remove all local planner data: the trip must return from the account API.
  await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k.startsWith("trip-planner"))
      .forEach((k) => localStorage.removeItem(k)),
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Account weekend", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Account weekend", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit trip", exact: true }).click();
  await page
    .getByLabel("Trip title", { exact: true })
    .fill("Updated account trip");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Updated account trip",
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  await expect(page).toHaveURL(/#\/8$/);
  conflict = true;
  await page.getByRole("button", { name: "Edit trip", exact: true }).click();
  await page.getByLabel("Trip title", { exact: true }).fill("Conflicting edit");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "changed or was deleted elsewhere" })
      .first(),
  ).toBeVisible();
  await page.locator(".recovery-more > summary").click();
  await page
    .getByRole("button", { name: "Discard edits and reload", exact: true })
    .click();
  await page.getByRole("dialog", {name: "Discard unsaved trip changes?"}).getByRole("button", {name: "Discard and reload", exact: true}).click();
  await expect(page.getByLabel("Trip title", { exact: true })).toHaveValue(
    "Updated account trip",
  );
  expect(rows[0].trip_name).toBe("Updated account trip");
  await page.goto("./#/5");
  await page
    .getByRole("button", {
      name: "Delete trip: Updated account trip",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: "Delete trip", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Could not delete");
  expect(rows.length).toBe(1);
  await page.getByRole("button", { name: "Delete trip", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Updated account trip", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your first trip is waiting." }),
  ).toBeVisible();
  expect(rows).toEqual([]);
  expect(errors).toEqual([]);
});

test("failed account load offers retry and never pretends the account is empty", async ({
  page,
}) => {
  let fail = true;
  await page.route("https://*.supabase.co/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/rest/v1/forwarded_booking")
      return route.fulfill({ json: [] });
    if (url.pathname === "/rest/v1/user_style")
      return route.fulfill({ json: [] });
    if (url.pathname === "/rest/v1/rpc/trip_companion_pictures")
      return route.fulfill({ json: [] });
    if (url.pathname === "/rest/v1/rpc/set_google_picture")
      return route.fulfill({ status: 204 });
    if (url.pathname.endsWith("/token"))
      return route.fulfill({ json: session() });
    if (url.pathname.endsWith("/user")) return route.fulfill({ json: owner });
    if (url.pathname === "/rest/v1/rpc/load_trip_bundles") {
      if (fail)
        return route.fulfill({ status: 400, json: { message: "Unavailable" } });
      return route.fulfill({ json: [] });
    }
    throw new Error(`Unexpected request ${url.pathname}`);
  });
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Couldn’t load your trips" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your first trip is waiting." }),
  ).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Home" }),
  ).toBeVisible();
});

test("invitees submit their own trip survey before entering the shared trip", async ({ page }) => {
  const travelerId = "22222222-2222-4222-8222-222222222222";
  const row = {
    tripID: "33333333-3333-4333-8333-333333333333", trip_name: "Taipei with friends",
    destinations: ["Taipei"], timezone: "Asia/Taipei", start_date: "2027-05-01", end_date: "2027-05-04",
    content_version: 1, revision: 1, content: {
      members: [{ id: travelerId, accountId: owner.id, name: "Invited traveler", email: owner.email,
        role: "Viewer", status: "accepted", days: [] }],
      prefs: {}, image: "", events: [], expenses: [], todos: [], dismissed: [], budget: null,
      individual: {}, budgetMode: "group",
    },
  };
  let fail = true;
  await page.route("https://*.supabase.co/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/token")) return route.fulfill({ json: session() });
    if (path.endsWith("/user")) return route.fulfill({ json: owner });
    if (path.endsWith("/load_trip_bundles")) return route.fulfill({ json: [row] });
    if (path.endsWith("/read_invited_trip")) return route.fulfill({ json: row });
    if (path.endsWith("/save_invited_preferences")) {
      const { p_trip, p_answers } = route.request().postDataJSON();
      expect(p_trip).toBe(row.tripID);
      expect(p_answers.notes).toBe("Morning walks");
      if (fail) return route.fulfill({ status: 400, json: { message: "Try again" } });
      row.content.prefs = { [travelerId]: p_answers };
      return route.fulfill({ json: row });
    }
    if (path.endsWith("/save_account_trip") || path.endsWith("/save_trip_bundle")) throw new Error("Viewer attempted an owner-only save");
    return route.fulfill({ json: [] });
  });
  await login(page);
  const heading = page.getByRole("heading", { name: "Your trip preferences" });
  await expect(heading).toBeVisible();
  const save = page.getByRole("button", { name: "Save and open trip" });
  await expect(save).toBeInViewport();
  const tickets = page.getByRole("button", { name: /Tickets & notes/ });
  await tickets.click();
  const notes = page.getByLabel("Anything else the group should know?");
  await notes.fill("Morning walks");
  await page.reload();
  // Draft recovery retains the open section as well as its field values.
  await expect(tickets).toHaveAttribute("aria-expanded", "true");
  await expect(notes).toHaveValue("Morning walks");
  await tickets.click();
  await expect(tickets).toContainText("Morning walks");
  await tickets.click();
  await expect(notes).toHaveValue("Morning walks");
  await save.click();
  await expect(page.getByRole("alert")).toContainText("Could not save your preferences");
  fail = false;
  await save.click();
  await expect(page).toHaveURL(/#\/8$/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Taipei with friends", exact: true }).first()).toBeVisible();
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter(k => k.startsWith("trip-survey-draft-v1:")))).toEqual([]);
  await page.goto("./#/15");
  await page.getByRole("button", { name: /Practical details/ }).click();
  await expect(page.getByLabel("Anything else the group should know?")).toHaveValue("Morning walks");
});
