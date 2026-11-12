import { test, expect, type Page } from "@playwright/test";

const tripId = "77777777-7777-4777-8777-777777777777";
const invitationId = "44444444-4444-4444-8444-444444444444";
const receiptToken = "a".repeat(64);
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
async function invitation(page: Page, registered: boolean, alternateIdentity: Identity = alternate) {
  let selected = recipient;
  let joined = false;
  let opens = 0;
  let canSetup = !registered;
  let passwordUpdates = 0;
  let setupMarker = true;
  let signupIdentity = recipient;
  let expired = false;
  let historicalSetup: "valid" | "expired" | null = null;
  let sentEmails = 0;
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
    if (path.endsWith("/open_trip_token")) {
      opens++;
      requests.push("open");
      expect(req.postDataJSON()).toEqual({ p_trip: tripId, p_token: receiptToken, p_invitation: invitationId, ...(opens > 1 ? { p_ticket: ticket } : {}) });
      expect(req.headers().authorization).not.toBe("Bearer " + token(recipient));
      if (expired) return route.fulfill({ status: 403, json: { code: "42501", message: "Invitation expired." } });
      return route.fulfill({ json: { trip: tripId, email: recipient.email, ticket,
        canSetup, accountId: registered ? recipient.id : null, tokenInvite: true, invitationId, setupAccountId: recipient.id } });
    }
    if (path.endsWith("/accept_trip_invite") || path.endsWith("/open_trip_notice")) {
      expect(req.postDataJSON()).toEqual(registered ? { p_trip: tripId, p_invitation: invitationId } : { p_trip: tripId, p_ticket: ticket });
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
    if (path.endsWith("/verify")) {
      expect(req.postDataJSON()).toMatchObject({ token_hash: receiptToken, type: "email" });
      return historicalSetup === "expired"
        ? route.fulfill({ status: 403, json: { code: "otp_expired", msg: "Token expired" } })
        : route.fulfill({ json: session(recipient) });
    }
    if (path.endsWith("/otp")) {
      expect(req.postDataJSON().email).toBe(recipient.email);
      sentEmails++;
      return route.fulfill({ json: {} });
    }
    if (path.endsWith("/signup") && historicalSetup)
      return route.fulfill({ status: 422, headers: { "x-supabase-api-version": "2024-01-01", "access-control-expose-headers": "x-supabase-api-version" }, json: { code: "user_already_exists", msg: "User already registered" } });
    if (path.endsWith("/token") || path.endsWith("/signup")) {
      const data = req.postDataJSON();
      selected = path.endsWith("/signup") ? signupIdentity : data.email === alternateIdentity.email ? alternateIdentity : recipient;
      return route.fulfill({ json: session(selected) });
    }
    if (path === "/auth/v1/user" && req.method() === "PUT") passwordUpdates++;
    if (path === "/auth/v1/user")
      return route.fulfill({ json: { ...user(req.headers().authorization === "Bearer " + token(recipient) ? recipient : selected), app_metadata: { provider: "email", trip_planner_needs_setup: setupMarker } } });
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
    ? page.goto("./?trip_notice=" + tripId + "&invitation=" + invitationId)
    : page.goto("./?trip_invite=" + tripId + "&trip_token=" + receiptToken + "&invitation=" + invitationId);
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
    passwordUpdates: () => passwordUpdates, emails: () => sentEmails,
    historicalSetup: (value: "valid" | "expired") => { historicalSetup = value; }, requests, expire: () => { expired = true; },
    changeSignupIdentity: () => { signupIdentity = alternate; }, clearSetupMarker: () => { setupMarker = false; }, failAcceptanceOnce: () => { failNextAccept = true; } };
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
  await expect(page.getByRole("button", {name:"Try again",exact:true})).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText(recipient.email);
  await page.getByRole("button", { name: "Use another account", exact: true }).click();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("");
  expect(api.accepts).toEqual([alternate.id]);
  await api.login(recipient);
  await expect(page.getByText("Joined Invited Osaka trip", { exact: true })).toBeVisible();
  expect(api.accepts).toEqual([alternate.id, recipient.id]);
  expect(api.errors).toEqual([]);
});

test("a long active-account email stays inside the invitation action and account switching recovers", async ({ page }) => {
  const longAccount = { ...alternate, email: "alexandra.traveler.with.a.long.email.address@example.test" };
  const api = await invitation(page, true, longAccount);
  await page.goto("./");
  await api.login(longAccount);
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  await api.open();
  const action = page.getByRole("button", { name: "Continue as " + longAccount.email, exact: true });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 600 });
    await page.evaluate(() => document.fonts.ready);
    const contained = await action.evaluate(button => {
      const box = button.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(button);
      return [...range.getClientRects()].every(rect => rect.left >= box.left + 8 && rect.right <= box.right - 8);
    });
    expect(contained).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`long-invite-identity-${width}.png`) });
  }
  await action.click();
  await expect(page.getByRole("alert")).toContainText("unavailable for this account");
  await page.getByRole("button", { name: "Use another account", exact: true }).click();
  await api.login(recipient);
  await expect(page.getByText("Joined Invited Osaka trip", { exact: true })).toBeVisible();
  expect(api.accepts).toEqual([longAccount.id, recipient.id]);
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
  await page.goto("./?trip_notice=" + tripId + "&invitation=" + invitationId + "&email=" + recipient.email + "&signup=true" +
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


test("a seven-day receipt never creates an account session just by opening or refreshing", async ({ page }) => {
  const api = await invitation(page, false);
  await page.goto("./?trip_invite=" + tripId + "&trip_token=" + receiptToken + "&invitation=" + invitationId +
    "#type=magiclink&access_token=" + token(recipient) + "&refresh_token=forged-refresh");
  await expect(page.getByRole("button", { name: "Create account", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Create account", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Continue as/ })).toHaveCount(0);
  expect(page.url()).not.toContain(receiptToken);
  const entry = await page.evaluate(() => JSON.parse(sessionStorage.getItem("trip-planner-invite-entry-v1")!));
  expect(entry.access).toBe("");
  expect(entry.refresh).toBe("");
  expect(entry.invitationId).toBe(invitationId);
  expect(api.accepts).toEqual([]);
});

test("a reserved signup completes only the verified setup identity", async ({ page }) => {
  const api = await invitation(page, false);
  await api.open();
  await page.getByLabel("Your name", { exact: true }).fill("Traveler");
  await page.getByLabel("Password", { exact: true }).fill("new-password");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await api.survey();
  expect(api.passwordUpdates()).toBe(1);
});

for (const guard of ["identity", "protected marker"] as const) {
  test(`a reserved signup cannot replace a password after its ${guard} changes`, async ({ page }) => {
    const api = await invitation(page, false);
    await api.open();
    await page.getByLabel("Your name", { exact: true }).fill("Traveler");
    await page.getByLabel("Password", { exact: true }).fill("new-password");
    if (guard === "identity") api.changeSignupIdentity();
    else api.clearSetupMarker();
    await page.getByRole("button", { name: "Create account", exact: true }).click();
    await expect(page.getByText("Your account details changed. Continue with your signed-in account or use another account.", { exact: true })).toBeVisible();
    expect(api.passwordUpdates()).toBe(0);
    expect(api.accepts).toEqual([]);
  });
}

test("a cached seven-day receipt rechecks server expiry on refresh", async ({ page }) => {
  const api = await invitation(page, false);
  await api.open();
  await expect(page.getByRole("button", { name: "Create account", exact: true })).toBeVisible();
  api.expire();
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("This invitation has expired");
  await expect(page.getByRole("button", {name:"Try again",exact:true})).toHaveCount(0);
  expect(api.accepts).toEqual([]);
  expect(api.passwordUpdates()).toBe(0);
});


test("an unfinished historical reservation completes only after its isolated proof verifies", async ({ page }) => {
  const api = await invitation(page, false);
  api.historicalSetup("valid");
  await api.open();
  await page.getByLabel("Your name", { exact: true }).fill("Traveler");
  await page.getByLabel("Password", { exact: true }).fill("new-password");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await api.survey();
  expect(api.passwordUpdates()).toBe(1);
  expect(api.emails()).toBe(0);
});

test("an expired historical setup proof sends fresh mail only after the explicit action", async ({ page }) => {
  const api = await invitation(page, false);
  api.historicalSetup("expired");
  await api.open();
  await page.getByLabel("Your name", { exact: true }).fill("Traveler");
  await page.getByLabel("Password", { exact: true }).fill("new-password");
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("button", { name: "Email me a fresh setup link", exact: true })).toBeVisible();
  expect(api.passwordUpdates()).toBe(0);
  expect(api.accepts).toEqual([]);
  expect(api.emails()).toBe(0);
  await page.getByRole("button", { name: "Email me a fresh setup link", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");
  expect(api.emails()).toBe(1);
  expect(api.passwordUpdates()).toBe(0);
});

test('a cancelled token explains the terminal state and offers leaving the invitation', async ({ page }) => {
  const api=await invitation(page,false);
  await page.route('**/rest/v1/rpc/open_trip_token',route=>route.fulfill({status:403,json:{code:'42501',message:'This invitation is no longer active.'}}));
  await api.open();
  await expect(page.getByRole('alert')).toContainText('This invitation is no longer active');
  await expect(page.getByRole('button',{name:'Try again',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Leave invitation',exact:true}).click();
  await expect(page.getByRole('button',{name:'Log in',exact:true})).toBeVisible();
});

for (const state of ["new", "existing", "signed-in"] as const) {
  test(`leaving an unaccepted ${state} invitation clears its context without joining`, async ({ page }) => {
    const api = await invitation(page, state !== "new");
    if (state === "signed-in") {
      await page.goto("./");
      await api.login(recipient);
      await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
    }
    await api.open();
    await page.getByRole("button", { name: "Leave invitation", exact: true }).click();
    await expect(page.getByRole("heading", { name: state === "signed-in" ? "Home" : "Welcome to Stir Crazy", exact: true })).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem("trip-planner-invite-entry-v1"))).toBeNull();
    expect(api.accepts).toEqual([]);
    await page.reload();
    await expect(page.getByRole("button", { name: "Leave invitation", exact: true })).toHaveCount(0);
    expect(api.accepts).toEqual([]);
  });
}
