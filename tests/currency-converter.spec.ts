import { expect, test, type Page } from "@playwright/test";

const date = new Date().toISOString().slice(0, 10);
async function openBudget(page: Page) {
  await page.goto("./");
  await page
    .getByRole("button", { name: "Try demo as Maya", exact: true })
    .click();
  await page.goto("./#/12");
  await expect(
    page.getByRole("heading", { name: "Currency converter" }),
  ).toBeVisible();
}
const result = (page: Page) => page.locator(".currency-result");

test("converts, swaps, validates and keeps the USD ledger unchanged", async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route("https://api.frankfurter.dev/**", (route) => {
    const [base, quote] = new URL(route.request().url()).pathname
      .split("/")
      .slice(-2);
    requests.push(`${base}/${quote}`);
    return route.fulfill({
      json: { base, quote, date, rate: base === "KRW" ? 1 / 1400 : 1400 },
    });
  });
  await openBudget(page);
  await expect(result(page)).toContainText("KRW 140,000");
  const ledger = await page.locator(".budget-stats").innerText();
  await page.getByLabel("Amount to convert", { exact: true }).fill("0");
  await expect(result(page)).toContainText("KRW 0");
  await page.getByLabel("Amount to convert", { exact: true }).fill("100");
  await page.getByRole("button", { name: "Swap currencies" }).click();
  await expect(result(page)).toContainText("USD 0.07");
  await page.getByLabel("From currency").selectOption("USD");
  await expect(result(page)).toContainText("USD 100.00");
  expect(requests).toEqual(["USD/KRW", "KRW/USD"]);
  await page.getByLabel("Amount to convert", { exact: true }).fill("-4");
  await expect(page.getByRole("alert")).toContainText("Enter an amount");
  await expect(result(page).locator("strong")).toHaveText("—");
  await page.getByLabel("Amount to convert", { exact: true }).fill("");
  await expect(result(page).locator("strong")).toHaveText("—");
  expect(await page.locator(".budget-stats").innerText()).toBe(ledger);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("refreshes, labels cached fallback, and recovers after an initial failure", async ({
  page,
}) => {
  let fail = true;
  let rate = 1400;
  await page.route("https://api.frankfurter.dev/**", (route) =>
    fail
      ? route.fulfill({ status: 503, json: {} })
      : route.fulfill({ json: { base: "USD", quote: "KRW", date, rate } }),
  );
  await openBudget(page);
  await expect(result(page)).toContainText("Exchange rates are unavailable");
  await expect(result(page).locator("strong")).toHaveText("—");
  fail = false;
  await page.getByRole("button", { name: "Refresh rates" }).click();
  await expect(result(page)).toContainText("KRW 140,000");
  rate = 1500;
  await page.getByRole("button", { name: "Refresh rates" }).click();
  await expect(result(page)).toContainText("KRW 150,000");
  fail = true;
  await page.getByRole("button", { name: "Refresh rates" }).click();
  await expect(result(page)).toContainText("Showing a saved rate");
  await expect(result(page)).toContainText("KRW 150,000");
  await page.reload();
  await expect(result(page)).toContainText("KRW 150,000");
});

test("discards outdated rates and never shows a response for the wrong pair", async ({
  page,
}) => {
  await page.route("https://api.frankfurter.dev/**", async (route) => {
    const [base, quote] = new URL(route.request().url()).pathname
      .split("/")
      .slice(-2);
    if (quote === "KRW")
      await new Promise((resolve) => setTimeout(resolve, 500));
    return route.fulfill({
      json: {
        base,
        quote,
        date: quote === "EUR" ? "2000-01-01" : date,
        rate: quote === "JPY" ? 150 : 1400,
      },
    });
  });
  await openBudget(page);
  await page.getByLabel("To currency").selectOption("JPY");
  await expect(result(page)).toContainText("JPY 15,000");
  await page.waitForTimeout(700);
  await expect(result(page)).toContainText("JPY 15,000");
  await expect(result(page)).not.toContainText("KRW");
  await page.getByLabel("To currency").selectOption("EUR");
  await expect(result(page)).toContainText("Exchange rates are unavailable");
  await expect(result(page).locator("strong")).toHaveText("—");
});

test("automatically renews expired rates while the budget stays open", async ({
  page,
}) => {
  let count = 0;
  await page.clock.install();
  await page.route("https://api.frankfurter.dev/**", (route) =>
    route.fulfill({
      json: {
        base: "USD",
        quote: "KRW",
        date,
        rate: ++count === 1 ? 1400 : 1500,
      },
    }),
  );
  await openBudget(page);
  await expect(result(page)).toContainText("KRW 140,000");
  await page.clock.fastForward(61 * 60 * 1000);
  await expect(result(page)).toContainText("KRW 150,000");
  expect(count).toBe(2);
});
