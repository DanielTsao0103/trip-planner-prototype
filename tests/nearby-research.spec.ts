import { expect, test, type Page } from "@playwright/test";
import { seed } from "../src/data.ts";

test("nearby entry points share a responsive context popup without fictional research", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("trip-planner-demo-session", "active"));
  await page.route("https://maps.googleapis.com/**", r => r.abort());
  for (const [route, button] of [["8", "Nearby suggestions"], ["17", "Nearby suggestion"], ["9", "Nearby suggestions"], ["11", "Find something nearby"]]) {
    await page.goto(`./#/${route}`);
    await page.getByRole("button", { name: button, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Nearby suggestions" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/Sample trip: you can explore/)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Find nearby suggestions", exact: true })).toBeDisabled();
    await dialog.getByText("Planning details used", { exact: true }).click();
    await expect(dialog).toContainText("Dietary needs");
    await expect(dialog).not.toContainText("Cedar Gallery");
    expect(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`nearby-${route}.png`) });
    await page.keyboard.press("Escape");
  }
});

async function account(page: Page, generation: (request: Record<string, unknown>) => { status?: number; json: unknown }) {
  const owner = { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated", email: "qa@example.com", user_metadata: { name: "QA Traveler" }, app_metadata: { provider: "email" } };
  const trip = seed().trips[0];
  trip.members = [{ id: owner.id, name: "QA Traveler", email: owner.email, role: "Owner", status: "accepted", days: [] }];
  trip.start = "2027-05-01"; trip.end = "2027-05-03"; trip.events = []; trip.prefs = {};
  const row = { tripID: "22222222-2222-4222-8222-222222222222", owner_id: owner.id, created_by: owner.id, trip_name: "Research trip", destination: "Seattle", destinations: ["Seattle"], start_date: trip.start, end_date: trip.end, timezone: "America/Los_Angeles", revision: 1, content_version: 1, content: trip };
  await page.route("https://*.supabase.co/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/token")) return route.fulfill({ json: { user: owner, access_token: "test-token", refresh_token: "test-refresh", token_type: "bearer", expires_in: 3600 } });
    if (url.pathname.endsWith("/user")) return route.fulfill({ json: owner });
    if (url.pathname.endsWith("/load_trip_bundles")) return route.fulfill({ json: [row] });
    if (url.pathname.endsWith("/nearby-suggestions")) return route.fulfill(generation(route.request().postDataJSON()));
    return route.fulfill({ json: [] });
  });
  await page.goto("./");
  await page.getByLabel("Email", { exact: true }).fill(owner.email);
  await page.getByLabel("Password", { exact: true }).fill("qa-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/#\/4/);
  await page.goto("./#/5");
  await page.getByRole("button", { name: "Research trip", exact: true }).click();
  await page.goto("./#/9");
  await page.getByRole("button", { name: "Nearby suggestions", exact: true }).click();
}

test("account popup displays sourced review candidates, resets stale results and sends only request identifiers", async ({ page }) => {
  const requests: Record<string, unknown>[] = [];
  await account(page, request => {
    requests.push(request);
    return { json: { results: [{ name: "Fixture venue for UI testing", address: "Test address", reason: "Fixture explanation", durationMinutes: 60, pricePerPersonCents: null, currency: null, facts: [{ topic: "Menu", detail: "Test source fact", sourceUrl: "https://example.com/menu" }], concerns: ["Confirm access and dietary needs"], conflicts: [], status: "review", proposedTime: { start: "12:00", end: "13:00" } }] } };
  });
  const dialog = page.getByRole("dialog", { name: "Nearby suggestions" });
  await dialog.getByRole("button", { name: "Find nearby suggestions", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Options to review" })).toBeVisible();
  await expect(dialog.getByRole("link", { name: "Source 1" })).toHaveAttribute("href", "https://example.com/menu");
  await expect(dialog.getByRole("link", { name: "View on Google Maps", exact: true })).toHaveAttribute("href", /https:\/\/www.google.com\/maps\/search\/\?api=1&query=/);
  await expect(dialog.getByRole("link", { name: "View on Yelp", exact: true })).toHaveAttribute("href", /https:\/\/www.yelp.com\/search\?/);
  await expect(dialog.getByRole("link", { name: "View on Yelp", exact: true })).toHaveAttribute("target", "_blank");
  expect(requests).toHaveLength(1); expect(requests[0]).not.toHaveProperty("preferences");
  expect(requests[0]).toMatchObject({ date: "2027-05-01", revision: 1, intent: "lunch" });
  await dialog.getByText("What needs confirmation", { exact: true }).click();
  await expect(dialog).toContainText("Confirm access and dietary needs");
  await dialog.getByLabel("Find", { exact: true }).selectOption("dinner");
  await expect(dialog.getByRole("heading", { name: "Options to review" })).toHaveCount(0);
  expect(requests).toHaveLength(1);
});
test("a sourced Yelp business page opens directly and supplemental availability is explained", async ({ page }) => {
  const source = "https://www.yelp.com/biz/fixture-venue-seattle";
  await account(page, () => ({ json: { results: [{ name: "Fixture venue", address: "Address needs confirmation from the venue", reason: "Fixture", durationMinutes: 60, pricePerPersonCents: null, currency: null, facts: [{ topic: "Menu", detail: "Fixture Yelp excerpt", sourceUrl: source }], concerns: ["Confirm with venue"], conflicts: [], status: "review", proposedTime: null }], diagnostics: { sourcesFound: 2, sourcesUsed: 2, candidatesReturned: 1, rejected: {}, yelpStatus: "found", yelpSourcesUsed: 1 } } }));
  const dialog = page.getByRole("dialog", { name: "Nearby suggestions" });
  await dialog.getByRole("button", { name: "Find nearby suggestions", exact: true }).click();
  await expect(dialog.getByRole("link", { name: "View on Yelp", exact: true })).toHaveAttribute("href", source);
  await expect(dialog.getByRole("link", { name: "Yelp source", exact: true })).toHaveAttribute("href", source);
  await dialog.getByText("Search details", { exact: true }).click();
  await expect(dialog).toContainText("Public Yelp results were found");
  await expect(dialog).toContainText("1 Yelp excerpt used");
  expect(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
});

test("daily quota errors are visible and do not automatically retry", async ({ page }) => {
  let calls = 0;
  await account(page, () => { calls++; return { status: 429, json: { message: "Daily user limit reached. Try again after midnight UTC." } }; });
  const dialog = page.getByRole("dialog", { name: "Nearby suggestions" });
  await dialog.getByRole("button", { name: "Find nearby suggestions", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Daily user limit reached");
  expect(calls).toBe(1);
});
test("empty research shows the specific cause and rejection counts", async ({ page }) => {
  await account(page, () => ({ json: { results: [], emptyReason: "evidence", diagnostics: { sourcesFound: 4, sourcesUsed: 3, candidatesReturned: 2, rejected: { evidence: 2 } } } }));
  const dialog = page.getByRole("dialog", { name: "Nearby suggestions" });
  await dialog.getByRole("button", { name: "Find nearby suggestions", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Not enough supporting evidence", exact: true })).toBeVisible();
  await expect(dialog).toContainText("more precise event address");
  await dialog.getByText("Search details", { exact: true }).click();
  await expect(dialog).toContainText("4 sources found"); await expect(dialog).toContainText("2 removed: insufficient source evidence");
  await expect(dialog).not.toContainText("No sourced options passed");
  await dialog.getByLabel("Find", { exact: true }).selectOption("activity");
  await expect(dialog.getByText("Search details", { exact: true })).toHaveCount(0);
});
