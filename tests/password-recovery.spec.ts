import { test, expect, type Page } from "@playwright/test";

const accountId = "11111111-1111-4111-8111-111111111111";
const tripId = "77777777-7777-4777-8777-777777777777";
const receiptToken = "a".repeat(64);
const user = { id: accountId, email: "traveler@example.test", aud: "authenticated", role: "authenticated",
  app_metadata: { provider: "email" }, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
function session(id = accountId, sessionId = "recovery-session") {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const expires_at = Math.floor(Date.now() / 1000) + 3600;
  return { user: { ...user, id }, access_token: `${part({ alg: "HS256" })}.${part({ sub: id, session_id: sessionId, exp: expires_at })}.dGVzdA`,
    refresh_token: "test-recovery-refresh", expires_in: 3600, expires_at, token_type: "bearer" };
}

/** Exercise the installed Supabase SDK with HTTP-shaped responses. Never send real emails. */
async function recoveryApi(page: Page) {
  let sends = 0, updates = 0, accepts = 0, opens = 0;
  let failSend = false, failUpdate = false, mismatch = false, invalidCallback = false;
  let callback = "";
  let delay = 0;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("https://*.supabase.co/**", async route => {
    const req = route.request(), url = new URL(req.url()), path = url.pathname;
    if (path.endsWith("/recover")) {
      sends++;
      expect(req.postDataJSON()).toMatchObject({ email: user.email, code_challenge_method: "s256" });
      callback = url.searchParams.get("redirect_to")!;
      expect(new URL(callback).searchParams.get("password_recovery")).toBe("1");
      if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      return failSend ? route.fulfill({ status: 429, json: { msg: "Email rate limit exceeded" } }) : route.fulfill({ json: {} });
    }
    if (path.endsWith("/token")) {
      if (url.searchParams.get("grant_type") === "password") return route.fulfill({ json: session("22222222-2222-4222-8222-222222222222", "main-session") });
      expect(url.searchParams.get("grant_type")).toBe("pkce");
      expect(req.postDataJSON()).toMatchObject({ auth_code: "recovery-code" });
      expect(req.postDataJSON().code_verifier.length).toBeGreaterThan(20);
      return invalidCallback ? route.fulfill({ status: 400, json: { code: "otp_expired", msg: "Expired code" } }) : route.fulfill({ json: session() });
    }
    if (path.endsWith("/user")) {
      if (req.method() === "PUT") {
        updates++;
        expect(req.postDataJSON()).toMatchObject({ password: "new-test-password" });
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        if (failUpdate) return route.fulfill({ status: 422, json: { msg: "Password update failed" } });
      }
      return route.fulfill({ json: { ...user, id: mismatch ? "other-account" : accountId } });
    }
    if (path.endsWith("/logout")) return route.fulfill({ status: 204 });
    if (path.endsWith("/open_trip_token")) {
      opens++;
      expect(req.postDataJSON()).toMatchObject({ p_trip: tripId, p_token: receiptToken });
      return route.fulfill({ json: { trip: tripId, email: user.email, ticket: "test-ticket", canSetup: false, tokenInvite: true, accountId } });
    }
    if (path.endsWith("/accept_trip_invite")) { accepts++; return route.fulfill({ status: 204 }); }
    if (path.startsWith("/rest/v1/")) return route.fulfill({ json: [] });
    throw new Error("Unexpected recovery request: " + path);
  });
  const send = async () => {
    await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
    await page.getByLabel("Email", { exact: true }).fill(user.email);
    await page.getByRole("button", { name: "Send reset link", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  };
  const open = () => page.goto(callback + "&code=recovery-code");
  const fillPassword = async () => {
    await page.getByLabel("New password", { exact: true }).fill("new-test-password");
    await page.getByLabel("Confirm new password", { exact: true }).fill("new-test-password");
  };
  return { send, open, fillPassword, errors, callback: () => callback, sends: () => sends, updates: () => updates, accepts: () => accepts, opens: () => opens,
    failSend: (v: boolean) => { failSend = v; }, failUpdate: (v: boolean) => { failUpdate = v; }, mismatch: () => { mismatch = true; },
    invalidCallback: () => { invalidCallback = true; }, delay: (v: number) => { delay = v; } };
}

test("reset request validates, retries, announces neutral confirmation and returns to login", async ({ page }) => {
  const api = await recoveryApi(page);
  await page.goto("./");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.getByRole("button", { name: "Send reset link", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(api.sends()).toBe(0);
  await page.getByLabel("Email", { exact: true }).fill("invalid");
  await page.getByRole("button", { name: "Send reset link", exact: true }).click();
  expect(api.sends()).toBe(0);
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  api.failSend(true); api.delay(350);
  await page.getByRole("button", { name: "Send reset link", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sending reset link…" })).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("Too many requests");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(user.email);
  api.failSend(false); api.delay(0);
  await page.getByRole("button", { name: "Send reset link", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("If an account exists");
  await page.getByRole("button", { name: "Change email or resend" }).click();
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue(user.email);
  await page.getByRole("button", { name: "Back to log in" }).click();
  await expect(page.getByRole("button", { name: "Log in", exact: true })).toBeVisible();
  expect(api.errors).toEqual([]);
});

test("verified PKCE recovery survives reload and supports validation, reveal, update retry and confirmed success", async ({ page }) => {
  const api = await recoveryApi(page);
  await page.goto("./"); await api.send();
  await page.getByRole("button", { name: "Back to log in" }).click();
  await api.open();
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await page.getByRole("button", { name: "Update password", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("at least 8");
  await page.getByLabel("New password", { exact: true }).fill("new-test-password");
  await page.getByRole("button", { name: "Show passwords" }).click();
  await expect(page.getByLabel("New password", { exact: true })).toHaveAttribute("type", "text");
  await page.getByLabel("Confirm new password", { exact: true }).fill("different-password");
  await page.getByRole("button", { name: "Update password", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("don’t match");
  expect(api.updates()).toBe(0);
  await api.fillPassword(); api.failUpdate(true); api.delay(300);
  await page.getByRole("button", { name: "Update password", exact: true }).click();
  await expect(page.getByRole("button", { name: "Updating password…" })).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("Couldn’t update");
  await expect(page.getByLabel("New password", { exact: true })).toHaveValue("new-test-password");
  api.failUpdate(false); api.delay(0);
  await page.getByRole("button", { name: "Update password", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Password updated" })).toBeVisible();
  expect(api.updates()).toBe(2);
  await page.getByRole("button", { name: "Back to log in" }).click();
  await expect(page.getByRole("button", { name: "Log in", exact: true })).toBeVisible();
  expect(api.errors).toEqual([]);
});

test("a URL flag or an expired code cannot turn a normal session into recovery", async ({ page }) => {
  const api = await recoveryApi(page);
  await page.goto("./?password_recovery=1");
  await expect(page.getByRole("heading", { name: "Request a new reset link" })).toBeVisible();
  await expect(page.getByLabel("New password", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Back to log in" }).click();
  await api.send(); api.invalidCallback(); await api.open();
  await expect(page.getByRole("heading", { name: "Request a new reset link" })).toBeVisible();
  await page.getByRole("button", { name: "Request new link" }).click();
  await expect(page.getByRole("button", { name: "Send reset link", exact: true })).toBeVisible();
  expect(api.updates()).toBe(0);
});

test("server account mismatch refuses update instead of changing a different account", async ({ page }) => {
  const api = await recoveryApi(page);
  await page.goto("./"); await api.send(); await api.open(); await api.fillPassword();
  api.mismatch();
  await page.getByRole("button", { name: "Update password", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Request a new reset link" })).toBeVisible();
  expect(api.updates()).toBe(0);
});

test("invitation remains attached through reset and never accepts before password completion", async ({ page }) => {
  const api = await recoveryApi(page);
  await page.goto(`./?trip_invite=${tripId}&trip_token=${receiptToken}`);
  await api.send();
  expect(new URL(api.callback()).searchParams.get("trip_invite")).toBe(tripId);
  const before = api.opens();
  await api.open(); await api.fillPassword();
  expect(api.accepts()).toBe(0); expect(api.opens()).toBe(before);
  await page.getByRole("button", { name: "Update password", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Password updated" })).toBeVisible();
  expect(api.accepts()).toBe(0);
  await page.getByRole("button", { name: "Back to log in" }).click();
  await expect(page.getByRole("button", { name: "Log in", exact: true })).toBeVisible();
  expect(api.accepts()).toBe(0);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("trip-planner-invite-entry-v1")!).trip)).toBe(tripId);
});

test("legacy recovery hash survives invitation capture and leaves the existing main account unchanged", async ({ page }) => {
  const api = await recoveryApi(page);
  await page.goto("./");
  const reset = session();
  await page.getByLabel("Email", { exact: true }).fill("other@example.test");
  await page.getByLabel("Password", { exact: true }).fill("existing-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Forgot password?" })).toHaveCount(0);
  const mainBefore = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(key => /^sb-.*-auth-token$/.test(key))!;
    return { key, value: JSON.parse(localStorage.getItem(key)!) };
  });
  expect(mainBefore.value.user.id).toBe("22222222-2222-4222-8222-222222222222");
  await page.evaluate(() => sessionStorage.setItem("trip-planner-demo-session", "active"));
  const hash = new URLSearchParams({ access_token: reset.access_token, refresh_token: reset.refresh_token, expires_in: "3600", token_type: "bearer", type: "recovery" });
  await page.goto(`./?password_recovery=1&trip_invite=${tripId}&trip_token=${receiptToken}#${hash}`);
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  expect(api.accepts()).toBe(0);
  expect(await page.evaluate(() => sessionStorage.getItem("trip-planner-demo-session"))).toBeNull();
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).user.id, mainBefore.key)).toBe(mainBefore.value.user.id);
  await expect(page.getByRole("button", { name: "Back to your account" })).toBeVisible();
});

test("an independent tab keeps the invited trip and shares only the recovery PKCE verifier", async ({ page, context }) => {
  const api = await recoveryApi(page);
  await page.goto(`./?trip_invite=${tripId}&trip_token=${receiptToken}`);
  await api.send();
  const other = await context.newPage();
  const otherApi = await recoveryApi(other);
  await other.goto(api.callback() + "&code=recovery-code");
  await expect(other.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  expect(otherApi.accepts()).toBe(0);
  expect(await other.evaluate(() => JSON.parse(sessionStorage.getItem("trip-planner-invite-entry-v1")!).trip)).toBe(tripId);
  await otherApi.fillPassword();
  await other.getByRole("button", { name: "Update password", exact: true }).click();
  await expect(other.getByRole("heading", { name: "Password updated" })).toBeVisible();
  await other.getByRole("button", { name: "Back to log in" }).click();
  await expect(other.getByRole("button", { name: "Log in", exact: true })).toBeVisible();
  expect(otherApi.accepts()).toBe(0);
  await other.close();
});

test("a replaced recovery session is refused on reload even for the same account", async ({ page }) => {
  const api = await recoveryApi(page);
  await page.goto("./"); await api.send(); await api.open();
  await expect(page.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await page.evaluate(value => localStorage.setItem("trip-password-recovery", JSON.stringify(value)), session(accountId, "replacement-session"));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Request a new reset link" })).toBeVisible();
  expect(api.updates()).toBe(0);
});

for (const mode of ["light", "dark"] as const) {
  test(`recovery forms remain usable across responsive widths in ${mode} mode`, async ({ page }, testInfo) => {
    const api = await recoveryApi(page);
    await page.emulateMedia({ colorScheme: mode });
    await page.goto("./");
    await page.getByRole("button", { name: "Forgot password?" }).click();
    const widths = testInfo.project.name === "mobile" ? [320, 390] : [768, 1024, 1440];
    const checkLayout = async (state: string) => {
      for (const width of widths) {
        await page.setViewportSize({ width, height: width <= 390 ? 600 : 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        const button = page.getByRole("button", { name: state === "request" ? "Send reset link" : "Update password", exact: true });
        await button.scrollIntoViewIfNeeded();
        const box = await button.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.y + box!.height).toBeLessThanOrEqual(width <= 390 ? 600 : 900);
        await page.screenshot({ path: testInfo.outputPath(`recovery-${mode}-${width}-${state}.png`), fullPage: true });
      }
    };
    await checkLayout("request");
    await page.getByLabel("Email", { exact: true }).fill(user.email);
    await page.getByRole("button", { name: "Send reset link", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    await api.open(); await api.fillPassword();
    await checkLayout("password");
    // Keyboard submits the same form and confirms the server response.
    await page.getByLabel("Confirm new password", { exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Password updated" })).toBeVisible();
    expect(api.errors).toEqual([]);
  });
}
