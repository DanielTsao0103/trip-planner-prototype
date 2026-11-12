import { expect, test, type Page } from "@playwright/test";

const account = {
  id: "22222222-2222-4222-8222-222222222222", aud: "authenticated", role: "authenticated",
  email: "ivysanford13@gmail.com", app_metadata: { provider: "google", providers: ["google"] },
  user_metadata: { name: "Ivy QA" }, created_at: "2026-01-01T00:00:00Z",
};
const seeded = ["ivysanford13@gmail.com", "danieljuntsao@gmail.com", "thefergusondrew@gmail.com", "sethshireman@gmail.com"];

/** Mocked Supabase with an in-memory admin list. `admin: false` mimics a signed-in account that is not listed. */
async function mockSupabase(page: Page, options: { admin: boolean; lastAdminGuard?: boolean }) {
  let rows = seeded.map((email, index) => ({ email, added_at: `2026-11-12T15:00:0${index}Z` }));
  const log = { rpc: 0, inserts: [] as string[], deletes: [] as string[] };
  await page.route("https://*.supabase.co/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path === "/rest/v1/rpc/is_admin") {
      log.rpc += 1;
      return route.fulfill({ json: options.admin });
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

test("an approved admin sees the Admin link beside Style and can manage the access list", async ({ page }) => {
  const log = await mockSupabase(page, { admin: true });
  await signIn(page);
  const more = page.locator(".menu-links");
  await expect(more.getByRole("button", { name: "Style", exact: true })).toBeVisible();
  await more.getByRole("button", { name: "Admin", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Admin", exact: true, level: 1 })).toBeVisible();
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
  await expect(page.getByRole("status").filter({ hasText: "new.teammate@example.com can now open the Admin page." })).toBeVisible();
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

test("the database refusing to empty the list is reported, not shown as success", async ({ page }) => {
  await mockSupabase(page, { admin: true, lastAdminGuard: true });
  await signIn(page);
  await page.locator(".menu-links").getByRole("button", { name: "Admin", exact: true }).click();
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
  await page.goto("./#/20");
  await expect(page.getByRole("heading", { name: "You do not have access to this page." })).toBeVisible();
  await expect(page.getByLabel("Add an email")).toHaveCount(0);
  await page.getByRole("button", { name: "Back to account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Account", exact: true, level: 1 })).toBeVisible();
});

test("demo accounts never see Admin and never ask the database", async ({ page }) => {
  const log = await mockSupabase(page, { admin: true });
  await page.goto("./");
  await page.getByRole("button", { name: "Try demo as Maya", exact: true }).click();
  await page.goto("./#/19");
  await expect(page.getByRole("button", { name: "Style", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Admin", exact: true })).toHaveCount(0);
  await page.goto("./#/20");
  await expect(page.getByRole("heading", { name: "You do not have access to this page." })).toBeVisible();
  expect(log.rpc).toBe(0);
});
