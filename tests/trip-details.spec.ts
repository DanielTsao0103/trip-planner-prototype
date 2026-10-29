import { test, expect, type Page } from "@playwright/test";
import { detailJourney, saved } from "../scripts/trip-detail-browser-flow.mjs";
const owner = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "detail-owner@example.com",
  aud: "authenticated",
  role: "authenticated",
  user_metadata: { name: "QA Traveler" },
  app_metadata: { provider: "email" },
  created_at: "2026-01-01T00:00:00Z",
};
async function backend(page: Page) {
  const rows: any[] = [];
  let fail = false;
  await page.route("https://*.supabase.co/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (path.endsWith("/token"))
      return route.fulfill({
        json: {
          user: owner,
          access_token: "qa-token",
          refresh_token: "qa-refresh",
          expires_in: 3600,
          token_type: "bearer",
        },
      });
    if (path.endsWith("/user")) return route.fulfill({ json: owner });
    if (path.endsWith("/load_trip_bundles"))
      return route.fulfill({ json: rows });
    if (path.endsWith("/save_trip_bundle")) {
      if (fail) return route.abort("failed");
      const { p_data: d, p_expected_revision: r } = req.postDataJSON();
      const old = rows.find((x) => x.tripID === d.id);
      if (old && r !== old.revision)
        return route.fulfill({
          status: 409,
          json: { code: "PT409", message: "This trip changed in another tab." },
        });
      const row = {
        tripID: d.id,
        owner_id: owner.id,
        created_by: owner.id,
        trip_name: d.title,
        destinations: d.destinations,
        start_date: d.start,
        end_date: d.end,
        timezone: d.zone,
        revision: (old?.revision ?? 0) + 1,
        content_version: 1,
        content: {
          image: d.image,
          members: d.members,
          events: d.events,
          expenses: d.expenses,
          prefs: d.prefs,
          budget: d.budget,
          budgetMode: d.budgetMode,
          individual: d.individual,
          todos: d.todos,
          dismissed: d.dismissed,
        },
      };
      if (old) rows[rows.indexOf(old)] = row;
      else rows.push(row);
      return route.fulfill({ json: row });
    }
    throw new Error(`Unexpected API ${path}`);
  });
  await page.goto("./");
  await page.getByLabel("Email", { exact: true }).fill(owner.email);
  await page.getByLabel("Password", { exact: true }).fill("qa-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Where to next, QA?" }),
  ).toBeVisible();
  return {
    rows,
    setFail: (value: boolean) => {
      fail = value;
    },
  };
}
test("all detail screens persist changes and preserve financial history", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(90000);
  const api = await backend(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const { today } = await detailJourney(page, baseURL!);
  const row = api.rows[0],
    c = row.content;
  expect(c.events[0]).toMatchObject({
    name: "Museum visit",
    notes: "Bring printed tickets",
    cost: 1007,
    date: today,
  });
  expect(c.events[0].attendees).toHaveLength(2);
  expect(c.members[1]).toMatchObject({
    role: "Day Editor",
    status: "removed",
    days: [today],
  });
  expect(c.prefs[owner.id]).toMatchObject({
    diet: ["Vegetarian"],
    atmosphere: "Quiet",
    access: ["Step-free access"],
    walk: 1500,
    notes: "A slower pace",
    destinations: "Old town",
  });
  expect(c).toMatchObject({
    budget: 100001,
    budgetMode: "individual",
    individual: { [owner.id]: 60002 },
  });
  expect(c.expenses).toHaveLength(1);
  expect(c.expenses[0]).toMatchObject({
    amount: 1001,
    purpose: "Shared lunch edited",
  });
  expect(c.expenses[0].settled).toHaveLength(1);
  expect(c.todos).toHaveLength(1);
  expect(c.todos[0]).toMatchObject({ text: "Pack tickets", done: true });
  const local = await page.evaluate(
    (id) => ({
      store: JSON.parse(localStorage.getItem(`trip-planner-demo-v1:${id}`)!),
      recovery: localStorage.getItem(`trip-planner-pending-v1:${id}`),
    }),
    owner.id,
  );
  expect(local.store.trips.some((t: any) => t.id === row.tripID)).toBe(false);
  expect(local.recovery).toBeNull();
  await page.goto(`./#/7?event=${c.events[0].id}`);
  await expect(
    page.getByLabel("Notes (optional)", { exact: true }),
  ).toHaveValue("Bring printed tickets");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete event", exact: true }).click();
  await saved(page);
  expect(api.rows[0].content.events).toEqual([]);
  await expect(
    page.locator(".budget-peek").getByRole("heading", { name: "Your budget" }),
  ).toBeVisible();
  const remaining = (60002 - c.expenses[0].shares[owner.id]) / 100;
  await expect(page.locator(".budget-peek > strong")).toHaveText(
    `$${remaining.toFixed(2)}`,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  const banner = await page.locator(".account-save-banner").boundingBox();
  const sidebar = await page.locator(".sidebar").boundingBox();
  if (sidebar && banner)
    expect(banner.x).toBeGreaterThanOrEqual(sidebar.x + sidebar.width);
  await page.screenshot({
    path: test.info().outputPath("saved-details.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("failed detail saves recover after reload and can be retried without losing edits", async ({
  page,
}) => {
  const api = await backend(page);
  await page.goto("./#/6");
  await page.getByLabel("Trip title", { exact: true }).fill("Offline recovery");
  await page.getByLabel("Where are you going?", { exact: true }).fill("Taipei");
  await page.getByLabel("Start date", { exact: true }).fill("2027-05-01");
  await page.getByLabel("End date", { exact: true }).fill("2027-05-04");
  await page.getByRole("button", { name: "Create trip", exact: true }).click();
  await page
    .getByRole("button", { name: "Offline recovery", exact: true })
    .click();
  await saved(page);
  api.setFail(true);
  await page.goto("./#/7");
  await page.getByLabel("Event name", { exact: true }).fill("Offline museum");
  await page.getByLabel("Where", { exact: true }).fill("Museum");
  await page
    .getByRole("button", { name: "Add to itinerary", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Not saved:");
  expect(api.rows[0].content.events).toEqual([]);
  await page.reload();
  await expect(page.getByRole("alert")).toContainText(
    "Recovered unsaved changes",
  );
  await expect(
    page.getByRole("button", { name: /Offline museum/ }).first(),
  ).toBeVisible();
  api.setFail(false);
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  await saved(page);
  expect(api.rows[0].content.events[0].name).toBe("Offline museum");
  await page.reload();
  await saved(page);
  await expect(
    page.getByRole("button", { name: /Offline museum/ }).first(),
  ).toBeVisible();
});

test("legacy browser trip details import once into the owned database trip", async ({
  page,
}) => {
  const api = await backend(page);
  const id = "44444444-4444-4444-8444-444444444444";
  const draft = {
    id,
    title: "Imported local plan",
    destinations: ["Taipei"],
    start: "2027-05-01",
    end: "2027-05-04",
    zone: "Asia/Taipei",
    image: "/image.jpg",
    persistence: "account",
    revision: 1,
    members: [
      {
        id: owner.id,
        name: "QA Traveler",
        email: owner.email,
        role: "Owner",
        days: [],
        status: "accepted",
      },
      {
        id: "legacy-guest",
        name: "Legacy guest",
        email: "legacy@example.com",
        role: "Viewer",
        days: [],
        status: "accepted",
      },
    ],
    events: [
      {
        id: "legacy-event",
        name: "Legacy museum",
        place: "Museum",
        date: "2027-05-01",
        start: "10:00",
        end: "11:00",
        cost: 100,
        notes: "Keep my old plan",
        image: "/image.jpg",
        attendees: [owner.id, "legacy-guest"],
      },
    ],
    expenses: [],
    prefs: {},
    budget: null,
    budgetMode: "group",
    individual: {},
    todos: [],
    dismissed: [],
  };
  api.rows.push({
    tripID: id,
    owner_id: owner.id,
    trip_name: draft.title,
    destinations: draft.destinations,
    start_date: draft.start,
    end_date: draft.end,
    timezone: draft.zone,
    revision: 1,
    content_version: 0,
  });
  await page.evaluate(
    ({ draft, owner }) => {
      const key = `trip-planner-demo-v1:${owner.id}`;
      const store = JSON.parse(localStorage.getItem(key)!);
      store.trips.push(draft);
      store.tripId = draft.id;
      localStorage.setItem(key, JSON.stringify(store));
    },
    { draft, owner },
  );
  await page.reload();
  await saved(page);
  await expect.poll(() => api.rows[0].content_version).toBe(1);
  expect(api.rows[0].content.events[0].notes).toBe("Keep my old plan");
  expect(api.rows[0].content.members[1].id).not.toBe("legacy-guest");
  expect(api.rows[0].content.events[0].attendees).toContain(
    api.rows[0].content.members[1].id,
  );
  const revision = api.rows[0].revision;
  await page.reload();
  await saved(page);
  expect(api.rows[0].revision).toBe(revision);
});
