import { test, expect, type Page } from "@playwright/test";

const tripId = "77777777-7777-4777-8777-777777777777";
const ticket = "99999999-9999-4999-8999-999999999999";
const recipient = { id: "11111111-1111-4111-8111-111111111111", email: "invited@example.test" };
const alternate = { id: "22222222-2222-4222-8222-222222222222", email: "other@example.test" };
type Identity = typeof recipient;
const user = (identity: Identity) => ({ ...identity, aud: "authenticated", role: "authenticated",
  user_metadata: { name: "Traveler" }, app_metadata: { provider: "email" }, created_at: "2026-01-01T00:00:00Z" });
const tokenExpiry = Math.floor(Date.now() / 1000) + 3600;
function token(identity: Identity) {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return part({ alg: "HS256" }) + "." + part({ sub: identity.id, exp: tokenExpiry }) + ".dGVzdA";
}
const session = (identity: Identity) => ({ user: user(identity), access_token: token(identity),
  refresh_token: "test-refresh", expires_in: 3600, token_type: "bearer" });

/** No external mail or accounts. The actual SDK handles proof and selected-account sessions separately. */
async function invitation(page: Page, registered: boolean) {
  let selected = recipient;
  let joined = false;
  let opens = 0;
  let canSetup = !registered;
  let passwordUpdates = 0;
  const accepts: string[] = [];
  const requests: string[] = [];
  let failNextAccept = false;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const row = (id: string, name: string) => ({ tripID: id, trip_name: name,
    owner_id: "33333333-3333-4333-8333-333333333333", destinations: ["Osaka"], timezone: "Asia/Tokyo",
    start_date: "2027-05-01", end_date: "2027-05-04", content_version: 1, revision: 1,
    content: { image: "", budget: null, budgetMode: "group", prefs: {}, events: [], todos: [], expenses: [],
      dismissed: [], individual: {}, members: [{ ...selected, accountId: selected.id, name: "Traveler",
        role: "Viewer", status: "accepted", days: [] }] } });
  await page.route("https://*.supabase.co/**", async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    if (path.endsWith("/open_trip_invite")) {
      opens++;
      requests.push("open");
      expect(req.postDataJSON()).toEqual({ p_trip: tripId, ...(opens > 1 ? { p_ticket: ticket } : {}) });
      expect(req.headers().authorization).toBe("Bearer " + token(recipient));
      return route.fulfill({ json: { trip: tripId, email: recipient.email, ticket,
        canSetup, accountId: registered ? recipient.id : null } });
    }
    if (path.endsWith("/accept_trip_invite") || path.endsWith("/open_trip_notice")) {
      expect(req.postDataJSON()).toEqual(registered ? { p_trip: tripId } : { p_trip: tripId, p_ticket: ticket });
      accepts.push(selected.id);
      requests.push(registered ? "notice" : "accept");
      if (failNextAccept) {
        failNextAccept = false;
        return route.fulfill({ status: 500, json: { code: "XX000", message: "Transient test failure" } });
      }
      if (registered && selected.id !== recipient.id)
        return route.fulfill({ status: 403, json: { code: "42501", message: "This trip is unavailable for this account." } });
      joined = true;
      return route.fulfill(registered ? { json: { trip: tripId } } : { status: 204 });
    }
    if (path.endsWith("/authorize")) {
      expect(url.searchParams.get("provider")).toBe("google");
      const callback = new URL(url.searchParams.get("redirect_to")!);
      expect(callback.searchParams.has("trip_invite")).toBe(false);
      callback.searchParams.set("code", "test-google-code");
      return route.fulfill({ status: 302, headers: { location: callback.href } });
    }
    if (path.endsWith("/token") || path.endsWith("/signup")) {
      const data = req.postDataJSON();
      selected = data.email === alternate.email ? alternate : recipient;
      return route.fulfill({ json: session(selected) });
    }
    if (path === "/auth/v1/user" && req.method() === "PUT") passwordUpdates++;
    if (path === "/auth/v1/user")
      return route.fulfill({ json: user(req.headers().authorization === "Bearer " + token(recipient) ? recipient : selected) });
    if (path.endsWith("/logout")) return route.fulfill({ status: 204 });
    if (path.endsWith("/settings")) return route.fulfill({ json: { external: { apple: false } } });
    if (path.endsWith("/load_trip_bundles")) return route.fulfill({ json: joined
      ? [row("88888888-8888-4888-8888-888888888888", "Other pending survey"), row(tripId, "Invited Osaka trip")] : [] });
    if (path.endsWith("/save_invited_preferences"))
      return route.fulfill({ json: row(tripId, "Invited Osaka trip") });
    if (path.startsWith("/rest/v1/")) return route.fulfill({ json: [] });
    throw Error("Unexpected request: " + path);
  });
  const open = () => registered
    ? page.goto("./?trip_notice=" + tripId)
    : page.goto("./?trip_invite=" + tripId + "#type=magiclink&access_token=" + token(recipient) + "&refresh_token=test-proof");
  const login = async (identity: Identity) => {
    await page.getByLabel("Email", { exact: true }).fill(identity.email);
    await page.getByLabel("Password", { exact: true }).fill("test-password");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
  };
  const survey = async (attempts = 1) => {
    await expect(page.getByText("Joined Invited Osaka trip", { exact: true })).toBeVisible();
    expect(accepts).toEqual(Array(attempts).fill(selected.id));
    expect(errors).toEqual([]);
  };
  return { open, login, survey, accepts, errors, opened: () => opens, completedElsewhere: () => { canSetup = false; },
    passwordUpdates: () => passwordUpdates, requests, failAcceptanceOnce: () => { failNextAccept = true; } };
}

for (const registered of [false, true]) {
  test(`an invited ${registered ? "existing" : "new"} account starts on ${registered ? "login" : "signup"} and preserves a deliberate mode switch through refresh`, async ({ page }) => {
    const api = await invitation(page, registered);
    await api.open();
    await expect(page.getByRole("button", { name: registered ? "Log in" : "Create account", exact: true })).toBeVisible();
    await expect(page.getByLabel("Email", { exact: true })).toHaveValue(registered ? "" : recipient.email);
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
    await expect(page.getByLabel("Your name", { exact: true })).toHaveCount(registered ? 0 : 1);
    await page.reload();
    await expect(page.getByRole("button", { name: registered ? "Log in" : "Create account", exact: true })).toBeVisible();
    await page.getByRole("button", { name: registered ? "New here? Create an account" : "Already have an account? Log in" }).click();
    await page.reload();
    await expect(page.getByRole("button", { name: registered ? "Create account" : "Log in", exact: true })).toBeVisible();
    expect(api.accepts).toEqual([]);
    expect(api.errors).toEqual([]);
    if (registered) expect(api.opened()).toBe(0);
    else expect(api.opened()).toBeGreaterThanOrEqual(3);
  });
}

test("an existing invited account signs in and reaches its exact trip survey", async ({ page }) => {
  const api = await invitation(page, true);
  await api.open();
  await api.login(recipient);
  await api.survey();
});

test("a new invite keeps the destination while choosing a different email account", async ({ page }) => {
  const api = await invitation(page, false);
  await api.open();
  await page.getByRole("button", { name: "Already have an account? Log in" }).click();
  await api.login(alternate);
  await api.survey();
});

test("a registered invite preserves the existing session until the traveler explicitly continues", async ({ page }) => {
  const api = await invitation(page, true);
  await page.goto("./");
  await api.login(recipient);
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  await api.open();
  await expect(page.getByRole("button", { name: "Continue as " + recipient.email, exact: true })).toBeVisible();
  expect(api.accepts).toEqual([]);
  await page.reload();
  await page.getByRole("button", { name: "Continue as " + recipient.email, exact: true }).click();
  await api.survey();
});

test("an existing-account invitation cannot be claimed by the wrong active account", async ({ page }) => {
  const api = await invitation(page, true);
  await page.goto("./");
  await api.login(alternate);
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  await api.open();
  await page.getByRole("button", { name: "Continue as " + alternate.email, exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("unavailable for this account");
  await expect(page.locator("main")).not.toContainText(recipient.email);
  await page.getByRole("button", { name: "Use another account", exact: true }).click();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("");
  expect(api.accepts).toEqual([alternate.id]);
  await api.login(recipient);
  await expect(page.getByText("Joined Invited Osaka trip", { exact: true })).toBeVisible();
  expect(api.accepts).toEqual([alternate.id, recipient.id]);
  expect(api.errors).toEqual([]);
});

for (const registered of [false, true]) {
  test(`a ${registered ? "notice" : "setup invitation"} keeps its destination through Google cancellation and retry`, async ({ page }) => {
    const api = await invitation(page, registered);
    await api.open();
    const action = registered ? "Log in" : "Create account";
    await page.getByRole("button", { name: action, exact: true }).waitFor();
    await page.goto("./?error=access_denied&error_description=Google%20cancelled");
    await expect(page.getByRole("alert")).toContainText("Google cancelled");
    await expect(page.getByRole("button", { name: action, exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await api.survey();
  });
}


test("a cached setup invitation rechecks account state before changing a password", async ({ page }) => {
  const api = await invitation(page, false);
  await api.open();
  await page.getByLabel("Your name", { exact: true }).fill("Traveler");
  await page.getByLabel("Password", { exact: true }).fill("new-password");
  api.completedElsewhere();
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("button", { name: "Log in", exact: true })).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  expect(api.passwordUpdates()).toBe(0);
  expect(api.accepts).toEqual([]);
  await api.login(recipient);
  await api.survey();
});


for (const registered of [false, true]) {
  test(`retrying a failed ${registered ? "notice" : "setup invitation"} keeps the destination and refreshes any proof`, async ({ page }) => {
    const api = await invitation(page, registered);
    await api.open();
    if (!registered) await page.getByRole("button", { name: "Already have an account? Log in" }).click();
    api.failAcceptanceOnce();
    await api.login(recipient);
    await expect(page.getByRole("alert")).toContainText("Couldn’t join the trip");
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await api.survey(2);
    expect(api.requests).toEqual(registered ? ["notice", "notice"] : ["open", "accept", "open", "accept"]);
  });
}


test("a plain existing-account notice drops forged auth tokens and reveals no account details before login", async ({ page }) => {
  const api = await invitation(page, true);
  await page.goto("./?trip_notice=" + tripId + "&email=" + recipient.email + "&signup=true" +
    "#type=magiclink&access_token=" + token(recipient) + "&refresh_token=forged-refresh");
  await expect(page.getByRole("button", { name: "Log in", exact: true })).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("");
  await expect(page.getByRole("button", { name: /Continue as/ })).toHaveCount(0);
  expect(api.opened()).toBe(0);
  expect(api.accepts).toEqual([]);
  const pending = await page.evaluate(() => JSON.parse(sessionStorage.getItem("trip-planner-invite-entry-v1")!));
  expect(pending.access || "").toBe("");
  expect(pending.refresh || "").toBe("");
  await api.login(recipient);
  await api.survey();
});
