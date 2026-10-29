import { test, expect, type Page } from "@playwright/test";

async function demo(page: Page) {
  await page.route("https://*.supabase.co/**", (route) =>
    route.fulfill({ json: {} }),
  );
  await page.goto("./");
  await page
    .getByRole("button", { name: "Try demo as Maya", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Seattle & Bainbridge getaway",
      exact: true,
    }),
  ).toBeVisible();
}
async function capped(page: Page, label: string, max: number) {
  const input = page.getByLabel(label, { exact: true });
  await expect(input).toHaveAttribute("maxlength", String(max));
  await input.fill("x".repeat(max + 1));
  await expect(input).toHaveValue("x".repeat(max));
  await expect(input).toHaveAccessibleDescription(
    new RegExp(
      `${max.toLocaleString("en-US")} / ${max.toLocaleString("en-US")} characters`,
    ),
  );
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}

test("text controls cap pasted text and expose counts across all forms", async ({
  page,
}) => {
  await demo(page);
  await page.goto("./#/6");
  await capped(page, "Trip title", 100);
  await capped(page, "Where are you going?", 220);
  await capped(page, "Invite by email (optional)", 5600);
  await noOverflow(page);
  await page.goto("./#/7");
  await capped(page, "Event name", 100);
  await capped(page, "Where", 220);
  await capped(page, "Notes (optional)", 2200);
  await noOverflow(page);
  await page.goto("./#/15");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await capped(page, "Places you’d love to include", 1100);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await capped(page, "Anything else the group should know?", 2200);
  await noOverflow(page);
  await page.goto("./#/13");
  await page
    .getByRole("button", { name: "Invite someone", exact: true })
    .click();
  await capped(page, "Fictional name", 90);
  await capped(page, "Fictional email", 280);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.goto("./#/12");
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  await capped(page, "What was it for?", 130);
  await noOverflow(page);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "Demo controls & screen index", exact: true })
    .click();
  await page.getByRole("button", { name: "During", exact: true }).click();
  await page
    .getByRole("button", { name: "Apply & preview landing", exact: true })
    .click();
  await page.goto("./#/10");
  await capped(page, "New to-do", 220);
  await page.getByRole("button", { name: "Add to-do", exact: true }).click();
  await page.reload();
  await expect(page.getByText("x".repeat(220), { exact: true })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: test.info().outputPath("limits-reminder.png"),
    fullPage: true,
  });
});

test("budget and expenses enforce decimal precision and upper bounds before saving", async ({
  page,
}) => {
  await demo(page);
  await page.goto("./#/12");
  await page
    .getByRole("button", { name: "Budget settings", exact: true })
    .click();
  const budget = page.getByLabel("Group budget (USD)", { exact: true });
  await expect(budget).toHaveAttribute("max", "999999.99");
  for (const amount of ["1000000", "12.345"]) {
    await budget.fill(amount);
    expect(
      await budget.evaluate((el: HTMLInputElement) => el.validity.valid),
    ).toBe(false);
  }
  await budget.fill("999999.99");
  await page.getByRole("button", { name: "Save budget", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  await page
    .getByLabel("What was it for?", { exact: true })
    .fill("Boundary expense");
  const amount = page.getByLabel("Amount (USD)", { exact: true });
  await amount.fill("1e3");
  await page.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "no letters or exponents",
  );
  await amount.fill("99999.99");
  await page.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByText("Boundary expense", { exact: true }),
  ).toBeVisible();
  await noOverflow(page);
});

test("existing oversized notes stay intact and cannot be resaved until shortened", async ({
  page,
}) => {
  await demo(page);
  await page.evaluate(() => {
    const key = "trip-planner-demo-v1:demo-maya";
    const saved = JSON.parse(localStorage.getItem(key)!);
    const trip = saved.trips.find((t: any) => t.id === saved.tripId);
    trip.prefs[saved.userId] = {
      ...trip.prefs[saved.userId],
      notes: "z".repeat(2201),
    };
    localStorage.setItem(key, JSON.stringify(saved));
  });
  await page.goto("./#/15");
  await page.reload();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  const notes = page.getByLabel("Anything else the group should know?", {
    exact: true,
  });
  await expect(notes).toHaveValue("z".repeat(2201));
  await page
    .getByRole("button", { name: "Save my preferences", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "2,200 characters or fewer",
  );
  await notes.fill("Repaired notes");
  await page
    .getByRole("button", { name: "Save my preferences", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/13/);
});

test("signup name and email use the approved limits without capping passwords", async ({
  page,
}) => {
  await page.route("https://*.supabase.co/**", (route) =>
    route.fulfill({ json: {} }),
  );
  await page.goto("./");
  await page
    .getByRole("button", { name: "New here? Create an account", exact: true })
    .click();
  await capped(page, "Your name", 90);
  await capped(page, "Email", 280);
  await expect(
    page.getByLabel("Password", { exact: true }),
  ).not.toHaveAttribute("maxlength");
});

test("maximum-length trip and event details survive saving and remain within the layout", async ({
  page,
}) => {
  await demo(page);
  await page.goto("./#/6");
  await page.getByLabel("Trip title", { exact: true }).fill("T".repeat(100));
  await page
    .getByLabel("Where are you going?", { exact: true })
    .fill("D".repeat(220));
  await page.getByLabel("Start date", { exact: true }).fill("2027-05-01");
  await page.getByLabel("End date", { exact: true }).fill("2027-05-02");
  await page.getByRole("button", { name: "Create trip", exact: true }).click();
  await page
    .getByRole("button", { name: "T".repeat(100), exact: true })
    .click();
  await noOverflow(page);
  await page.goto("./#/7");
  await page.getByLabel("Event name", { exact: true }).fill("E".repeat(100));
  await page.getByLabel("Where", { exact: true }).fill("L".repeat(220));
  await page
    .getByLabel("Notes (optional)", { exact: true })
    .fill("N".repeat(2200));
  await page
    .getByLabel("Estimated cost (USD)", { exact: true })
    .fill("99999.99");
  await page
    .getByRole("button", { name: "Add to itinerary", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/8/);
  await page.reload();
  await expect(
    page.getByText("E".repeat(100), { exact: true }).first(),
  ).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: test.info().outputPath("maximum-text-itinerary.png"),
    fullPage: true,
  });
});
