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
    if (url.pathname.endsWith("/token"))
      return route.fulfill({ json: session() });
    if (url.pathname.endsWith("/user")) return route.fulfill({ json: owner });
    if (url.pathname === "/rest/v1/trip") {
      expect(
        url.searchParams.get("owner_id") ??
          `eq.${request.postDataJSON()?.owner_id}`,
      ).toBe(`eq.${owner.id}`);
      if (request.method() === "POST") {
        const draft = request.postDataJSON();
        ids.push(draft.tripID);
        expect(draft.created_by).toBe(owner.id);
        if (!rows.length) rows.push({ ...draft, revision: 1 });
        if (loseResponse) {
          loseResponse = false;
          return route.abort("failed");
        }
        return route.fulfill({ status: 201, body: "" });
      }
      if (request.method() === "PATCH") {
        if (conflict) return route.fulfill({ json: null });
        expect(url.searchParams.get("revision")).toBe(`eq.${rows[0].revision}`);
        Object.assign(rows[0], request.postDataJSON(), {
          revision: rows[0].revision + 1,
        });
        return route.fulfill({ json: rows[0] });
      }
      if (request.method() === "DELETE") {
        if (failDelete) {
          failDelete = false;
          return route.fulfill({
            status: 503,
            json: { message: "Unavailable" },
          });
        }
        const deleted = rows.splice(0);
        return route.fulfill({
          json: deleted.map((r) => ({ tripID: r.tripID })),
        });
      }
      return route.fulfill({
        json: url.searchParams.has("tripID") ? rows[0] : rows,
      });
    }
    throw new Error(`Unexpected request ${request.method()} ${url.pathname}`);
  });
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Where to next, Owner?" }),
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
  await expect(page.getByRole("alert")).toContainText("Could not save");
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
  await expect(page.getByRole("alert")).toContainText(
    "changed or was deleted elsewhere",
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
    if (url.pathname.endsWith("/token"))
      return route.fulfill({ json: session() });
    if (url.pathname.endsWith("/user")) return route.fulfill({ json: owner });
    if (url.pathname === "/rest/v1/trip") {
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
    page.getByRole("heading", { name: "Where to next, Owner?" }),
  ).toBeVisible();
});
