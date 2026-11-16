import { expect, test, type Page } from "@playwright/test";

const account = {
  id: "22222222-2222-4222-8222-222222222222", aud: "authenticated", role: "authenticated",
  email: "ivysanford13@gmail.com", app_metadata: { provider: "google", providers: ["google"] },
  user_metadata: { name: "Ivy QA" }, created_at: "2026-01-01T00:00:00Z",
};
const seeded = ["ivysanford13@gmail.com", "danieljuntsao@gmail.com", "thefergusondrew@gmail.com", "sethshireman@gmail.com"];

/** Mocked Supabase with an in-memory admin list. `admin: false` mimics a signed-in account that is not listed. */
async function mockSupabase(page: Page, options: { admin: boolean; lastAdminGuard?: boolean; stats?: { total_trips: number; shared_trips: number }[]; history?: { day: string; total_trips: number; shared_trips: number; is_estimate?: boolean }[] }) {
  let rows = seeded.map((email, index) => ({ email, added_at: `2026-11-12T15:00:0${index}Z` }));
  const log = { rpc: 0, statsCalls: 0, inserts: [] as string[], deletes: [] as string[] };
  await page.route("https://*.supabase.co/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === "/rest/v1/rpc/okr4_trip_budget_stats") return route.fulfill({ json: { eligible_trips: 0, within_budget_trips: 0, trips_without_expenses: 0 } });
    if (path === "/rest/v1/rpc/pending_trip_experience_feedback") return route.fulfill({ json: [] });
    if (path === "/rest/v1/rpc/get_budget_cadence_metrics") return route.fulfill({ json: {
      windowStart: "2026-11-01", windowEnd: "2026-11-14", windowDays: 14,
      observedDays: 14, eligibleUsers: 0, consistentUsers: 0, percent: null,
      targetPercent: 85, definition: "test fixture",
    } });
    if (path === "/rest/v1/rpc/get_daniel_okr_metrics") return route.fulfill({ status: 503, json: { message: "Metrics fixture is unavailable" } });
    if (path === "/rest/v1/rpc/is_admin") {
      log.rpc += 1;
      return route.fulfill({ json: options.admin });
    }
    if (path === "/rest/v1/rpc/okr2_history") return route.fulfill({ json: options.history ?? [] });
    if (path === "/rest/v1/rpc/okr2_sharing_stats") {
      const sequence = options.stats ?? [{ total_trips: 0, shared_trips: 0 }];
      const row = sequence[Math.min(log.statsCalls, sequence.length - 1)];
      log.statsCalls += 1;
      return route.fulfill({ json: [row] });
    }
    if (path === "/rest/v1/admin_email") {
      if (!options.admin) return route.fulfill({ json: [] });
      if (request.method() === "GET") return route.fulfill({ json: rows });
      if (request.method() === "POST") {
        const { email } = request.postDataJSON();
        if (rows.some((row) => row.email === email))
          return route.fulfill({ status: 409, json: { code: "23505", message: "duplicate key" } });
        log.inserts.push(email);
        rows = [...rows, { email, added_at: "2026-11-12T16:00:00Z" }];
        return route.fulfill({ status: 201, json: null });
      }
      if (request.method() === "DELETE") {
        if (options.lastAdminGuard)
          return route.fulfill({ status: 422, json: { code: "PT422", message: "The admin list must keep at least one email." } });
        const email = decodeURIComponent(url.searchParams.get("email") ?? "").replace(/^eq\./, "");
        log.deletes.push(email);
        const removed = rows.filter((row) => row.email === email);
        rows = rows.filter((row) => row.email !== email);
        return route.fulfill({ json: removed.map((row) => ({ email: row.email })) });
      }
    }
    if (path.endsWith("/token")) return route.fulfill({ json: {
      access_token: "test-access-token", token_type: "bearer", expires_in: 3600,
      refresh_token: "test-refresh-token", user: account,
    } });
    if (path === "/auth/v1/user") return route.fulfill({ json: account });
    if (path === "/auth/v1/settings") return route.fulfill({ json: { external: { apple: false } } });
    if (request.method() === "GET" || path.endsWith("/load_trip_bundles") || path.endsWith("/trip_companion_pictures")) {
      return route.fulfill({ json: [] });
    }
    if (new URL(route.request().url()).pathname.endsWith("/record_trip_plan_access")) return route.fulfill({ json: null });
    if (path === "/rest/v1/rpc/pending_trip_experience_feedback") return route.fulfill({ json: [] });
    throw Error(`Unexpected mocked request: ${request.method()} ${path}`);
  });
  return log;
}

async function signIn(page: Page) {
  await page.goto("./");
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill("qa-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  await page.goto("./#/19");
}

test("an approved admin sees the Admin link beside Style and manages the access list from the Admin menu", async ({ page }) => {
  const log = await mockSupabase(page, { admin: true });
  await signIn(page);
  const more = page.locator(".menu-links");
  await expect(more.getByRole("button", { name: "Style", exact: true })).toBeVisible();
  await more.getByRole("button", { name: "Admin", exact: true }).click();
  await page.getByRole("button", { name: "Manage admin access" }).click();
  await expect(page.getByRole("heading", { name: "Admin access", exact: true, level: 1 })).toBeVisible();
  const list = page.getByRole("list", { name: "Emails with admin access" });
  await expect(list.getByRole("listitem")).toHaveCount(4);
  // The signed-in admin cannot remove themselves; everyone else has a Remove button.
  await expect(list.getByRole("listitem").filter({ hasText: "ivysanford13@gmail.com" }).getByText("You", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove ivysanford13@gmail.com" })).toHaveCount(0);

  // Add: validated first, stored lowercase, and shown in the refreshed list.
  const field = page.getByLabel("Add an email");
  await field.fill("not-an-email");
  await page.getByRole("button", { name: "Add email", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("valid email");
  await field.fill("SETHSHIREMAN@gmail.com");
  await page.getByRole("button", { name: "Add email", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("already has admin access");
  expect(log.inserts).toEqual([]);
  await field.fill("  New.Teammate@Example.com ");
  await page.getByRole("button", { name: "Add email", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "new.teammate@example.com can now open the Admin pages." })).toBeVisible();
  await expect(list.getByRole("listitem")).toHaveCount(5);
  expect(log.inserts).toEqual(["new.teammate@example.com"]);

  // Remove asks first; Keep and Escape change nothing.
  await page.getByRole("button", { name: "Remove sethshireman@gmail.com" }).click();
  await page.getByRole("button", { name: "Keep", exact: true }).click();
  expect(log.deletes).toEqual([]);
  await page.getByRole("button", { name: "Remove sethshireman@gmail.com" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Remove sethshireman@gmail.com" })).toBeVisible();
  await page.getByRole("button", { name: "Remove sethshireman@gmail.com" }).click();
  await page.getByRole("button", { name: "Yes, remove", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "sethshireman@gmail.com was removed." })).toBeFocused();
  await expect(list.getByRole("listitem")).toHaveCount(4);
  expect(log.deletes).toEqual(["sethshireman@gmail.com"]);
  await page.screenshot({ path: test.info().outputPath("admin-page.png"), fullPage: true });
});

test("budget cadence lives in Seth's OKR tracker without a separate team section", async ({ page }) => {
  await mockSupabase(page, { admin: true });
  await signIn(page);
  await page.locator(".menu-links").getByRole("button", { name: "Admin", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Admin", exact: true, level: 1 })).toBeVisible();
  const owners = ["Daniel", "Ivy", "Seth", "Drew"];
  const menu = page.locator(".admin-page .menu-links");
  await expect(menu.locator(".tracker-availability")).toHaveText(Array(4).fill("Available · account data"));
  await expect(page.getByRole("heading", { name: "Team measurement", exact: true })).toHaveCount(0);
  // The access list is a secondary page now, not the main content here.
  await expect(page.getByLabel("Add an email")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Manage admin access" })).toBeVisible();
  for (const owner of owners) {
    await menu.getByRole("button", { name: `${owner}’s OKR tracker`, exact: true }).click();
    await expect(page.getByRole("heading", { name: `${owner}’s OKR tracker`, exact: true, level: 1 })).toBeVisible();
    if (owner === "Daniel") await expect(page.getByText("Dashboard unavailable")).toBeVisible();
    else if (owner === "Seth") await expect(page.getByRole("heading", { name: "Budget cadence", exact: true })).toBeVisible();
    else if (owner === "Drew") await expect(page.getByRole("heading", { name: "Help people stay within their trip budgets" })).toBeVisible();
    else if (owner !== "Ivy") await expect(page.getByText("Nothing here yet.")).toBeVisible();
    const trail = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(trail.locator('[aria-current="page"]')).toHaveText(`${owner}’s OKR tracker`);
    await expect(trail.getByRole("link", { name: "Account", exact: true })).toBeVisible();
    await trail.getByRole("link", { name: "Admin", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Admin", exact: true, level: 1 })).toBeVisible();
  }
  await page.screenshot({ path: test.info().outputPath("admin-menu.png"), fullPage: true });
});

test("the database refusing to empty the list is reported, not shown as success", async ({ page }) => {
  await mockSupabase(page, { admin: true, lastAdminGuard: true });
  await signIn(page);
  await page.locator(".menu-links").getByRole("button", { name: "Admin", exact: true }).click();
  await page.getByRole("button", { name: "Manage admin access" }).click();
  await page.getByRole("button", { name: "Remove danieljuntsao@gmail.com" }).click();
  await page.getByRole("button", { name: "Yes, remove", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("at least one admin email");
  await expect(page.getByText("danieljuntsao@gmail.com", { exact: true })).toBeVisible();
  await expect(page.getByText("was removed.")).toHaveCount(0);
});

test("a signed-in account that is not an admin gets no link and a plain no-access page", async ({ page }) => {
  await mockSupabase(page, { admin: false });
  await signIn(page);
  await expect(page.getByRole("button", { name: "Style", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Admin", exact: true })).toHaveCount(0);
  for (const route of [20, 21, 22, 23, 24, 25]) {
    await page.goto(`./#/${route}`);
    await expect(page.getByRole("heading", { name: "You do not have access to this page." })).toBeVisible();
    await expect(page.getByLabel("Add an email")).toHaveCount(0);
    await expect(page.getByText("Nothing here yet.")).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Back to account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Account", exact: true, level: 1 })).toBeVisible();
});

test("demo accounts never see Admin and never ask the database", async ({ page }) => {
  const log = await mockSupabase(page, { admin: true });
  await page.goto("./");
  await page.getByRole("button", { name: "Explore a sample trip", exact: true }).click();
  await page.goto("./#/19");
  await expect(page.getByRole("button", { name: "Style", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Admin", exact: true })).toHaveCount(0);
  for (const route of [20, 22, 25]) {
    await page.goto(`./#/${route}`);
    await expect(page.getByRole("heading", { name: "You do not have access to this page." })).toBeVisible();
  }
  expect(log.rpc).toBe(0);
});

test("Ivy's tracker shows OKR #2 and updates on its own", async ({ page }) => {
  const log = await mockSupabase(page, { admin: true, stats: [{ total_trips: 20, shared_trips: 9 }, { total_trips: 20, shared_trips: 15 }] });
  await signIn(page);
  await page.clock.install();
  await page.goto("./#/22");
  const tracker = page.getByTestId("okr2");
  await expect(tracker.getByText("Help trip planners save and share trips with friends")).toBeVisible();
  await expect(tracker.getByText("75% of all trips have more than 1 account")).toBeVisible();
  await expect(page.getByTestId("okr2-percent")).toHaveText("45%");
  await expect(page.getByTestId("okr2-gap")).toHaveText("6 more shared");
  await expect(tracker.getByText("Below target")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("okr2-below.png"), fullPage: true });
  // No click: the next refresh arrives by itself.
  await page.clock.runFor(16000);
  await expect(page.getByTestId("okr2-percent")).toHaveText("75%");
  await expect(page.getByTestId("okr2-gap")).toHaveText("None");
  await expect(tracker.getByText("Target met")).toBeVisible();
  expect(log.statsCalls).toBeGreaterThanOrEqual(2);
  await page.screenshot({ path: test.info().outputPath("okr2-met.png"), fullPage: true });
});

test("Ivy's tracker charts the last 14 days with a table and a readout", async ({ page }) => {
  const history = [
    { day: "2026-11-14", total_trips: 10, shared_trips: 3, is_estimate: true },
    { day: "2026-11-15", total_trips: 12, shared_trips: 6 },
    { day: "2026-11-16", total_trips: 12, shared_trips: 9 },
  ];
  await mockSupabase(page, { admin: true, stats: [{ total_trips: 12, shared_trips: 9 }], history });
  await signIn(page);
  await page.goto("./#/22");
  const trend = page.getByTestId("okr2-trend");
  await expect(trend.getByRole("heading", { name: "Last 14 days" })).toBeVisible();
  await expect(trend.getByText("Up 25 percentage points since Nov 15.")).toBeVisible();
  await expect(page.getByTestId("okr2-readout")).toHaveText("Nov 16: 75% (9 of 12 trips)");
  await trend.getByRole("img", { name: /Nov 14: 30%/ }).focus();
  await expect(page.getByTestId("okr2-readout")).toHaveText("Nov 14: 30% (3 of 10 trips), estimated");
  await expect(page.getByTestId("okr2-estimate-note")).toBeVisible();
  await expect(trend.getByRole("img", { name: /Nov 14: 30%.*estimated/ })).toBeVisible();
  await trend.getByText("Show as a table").click();
  await expect(trend.getByRole("cell", { name: "Estimated" })).toHaveCount(1);
  await expect(trend.getByRole("row")).toHaveCount(4);
  await page.screenshot({ path: test.info().outputPath("okr2-trend.png"), fullPage: true });
});

test("a first-day trend says tracking just started", async ({ page }) => {
  await mockSupabase(page, { admin: true, history: [{ day: "2026-11-14", total_trips: 4, shared_trips: 0, is_estimate: true }, { day: "2026-11-15", total_trips: 4, shared_trips: 1 }] });
  await signIn(page);
  await page.goto("./#/22");
  await expect(page.getByTestId("okr2-trend").getByText("Tracking started. The trend appears after the second day.", { exact: true })).toBeVisible();
});
