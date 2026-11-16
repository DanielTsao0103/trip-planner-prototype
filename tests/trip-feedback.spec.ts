import { expect, test } from "@playwright/test";

const user = {
  id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated",
  email: "traveler@example.com", user_metadata: { name: "Traveler" },
  app_metadata: { provider: "email" }, created_at: "2026-01-01T00:00:00Z",
};

test("trip feedback appears only after trip completion and asks about the full trip", async ({ page }) => {
  let completed = false;
  let submitted: unknown;
  await page.route("https://*.supabase.co/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path.endsWith("/token")) return route.fulfill({ json: {
      user, access_token: "qa-token", refresh_token: "qa-refresh", expires_in: 3600, token_type: "bearer",
    } });
    if (path.endsWith("/user")) return route.fulfill({ json: user });
    if (path.endsWith("/pending_trip_experience_feedback")) return route.fulfill({ json: completed ? [{
      trip_id: "33333333-3333-4333-8333-333333333333", title: "Osaka and Kyoto", completed_on: "2026-11-10",
    }] : [] });
    if (path.endsWith("/submit_trip_experience_feedback")) {
      submitted = request.postDataJSON();
      return route.fulfill({ json: true });
    }
    return route.fulfill({ json: [] });
  });

  await page.goto("./");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill("qa-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "How was your trip?" })).toHaveCount(0);

  completed = true;
  await page.reload();
  const dialog = page.getByRole("dialog", { name: "How was your trip?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Did the trip as a whole meet your expectations?")).toBeVisible();
  await expect(dialog.getByText("Would you recommend this trip experience to someone else?")).toBeVisible();
  await dialog.getByRole("group", { name: "Did the trip as a whole meet your expectations?" }).getByRole("button", { name: "Yes" }).click();
  await dialog.getByRole("group", { name: "Would you recommend this trip experience to someone else?" }).getByRole("button", { name: "No" }).click();
  await dialog.getByRole("button", { name: "Send feedback" }).click();
  await expect(dialog).toHaveCount(0);
  expect(submitted).toEqual({ p_trip: "33333333-3333-4333-8333-333333333333", p_met_expectations: true, p_would_recommend: false });
});
