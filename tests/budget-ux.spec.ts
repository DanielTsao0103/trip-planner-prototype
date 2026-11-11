import { expect, test, type Page } from "@playwright/test";

async function budget(page: Page) {
  await page.goto("./");
  await page
    .getByRole("button", { name: "Try demo as Maya", exact: true })
    .click();
  await page.goto("./#/12");
  await expect(
    page.getByRole("heading", { name: "Budget", exact: true, level: 1 }),
  ).toBeVisible();
}

test("optional conversion stays closed until requested and preserves work when collapsed", async ({
  page,
}) => {
  let requests = 0;
  await page.route("https://api.frankfurter.dev/**", (route) => {
    requests++;
    return route.fulfill({
      json: {
        base: "USD",
        quote: "KRW",
        date: new Date().toISOString().slice(0, 10),
        rate: 1400,
      },
    });
  });
  await budget(page);
  const toggle = page.getByRole("button", { name: /Currency converter/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByLabel("Amount to convert", { exact: true }),
  ).toHaveCount(0);
  expect(requests).toBe(0);
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".currency-result")).toContainText("KRW 140,000");
  await page.getByLabel("Amount to convert", { exact: true }).fill("25");
  await toggle.click();
  await expect(
    page.getByLabel("Amount to convert", { exact: true }),
  ).toBeHidden();
  await toggle.click();
  await expect(
    page.getByLabel("Amount to convert", { exact: true }),
  ).toHaveValue("25");
  await expect(page.locator(".currency-result")).toContainText("KRW 35,000");
  expect(requests).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("saving shared expenses returns to the ledger without a simulated message interruption", async ({
  page,
}) => {
  await budget(page);
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  await page
    .getByLabel("What was it for?", { exact: true })
    .fill("Shared lunch UX check");
  await page.getByLabel("Amount (USD)", { exact: true }).fill("48.50");
  await page
    .getByRole("checkbox", { name: /I paid for other people too/ })
    .check();
  await page.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.locator(".expense-row").filter({ hasText: "Shared lunch UX check" }),
  ).toContainText("$48.50");
});

test("repayment confirmation identifies the traveler and amount before recording payment", async ({
  page,
}) => {
  await budget(page);
  await page.getByRole("button", { name: /^Reimbursements/ }).click();
  const row = page
    .locator(".repayment-group")
    .filter({ hasText: /Eli.*owes.*Maya/ })
    .locator(".debt-row")
    .filter({ hasText: "$400.00" })
    .first();
  await row.getByRole("button", { name: "Mark paid" }).click();
  const confirmation = page.getByRole("dialog", { name: "Confirm repayment" });
  await expect(confirmation).toContainText("Eli");
  await expect(confirmation).toContainText("$400.00");
  await expect(confirmation).toContainText("No money is transferred");
});

test("repayment subtotals exclude completed payments and relationship filters preserve totals", async ({
  page,
}) => {
  await budget(page);
  const spent = await page.locator(".budget-stats").innerText();
  await page.getByRole("button", { name: /^Reimbursements/ }).click();
  await expect(page.getByLabel("Show repayments")).toHaveValue("Owed to me");
  await expect(page.locator(".repayment-group")).toHaveCount(3);
  const group = page
    .locator(".repayment-group")
    .filter({ hasText: /Eli.*owes.*Maya/ });
  await expect(group.locator("header")).toContainText("$430.00 unpaid");
  await group
    .locator(".debt-row")
    .filter({ hasText: "$400.00" })
    .getByRole("button", { name: "Mark paid" })
    .click();
  await page
    .getByRole("dialog", { name: "Confirm repayment" })
    .getByRole("button", { name: "Mark paid", exact: true })
    .click();
  await expect(group.locator("header")).toContainText("$30.00 unpaid");
  await expect(group.getByText("Completed", { exact: true })).toHaveCount(1);
  await expect(group.getByText("Awaiting repayment", { exact: true })).toHaveCount(0);
  await page.getByLabel("Show repayments").selectOption("I owe");
  await expect(
    page.getByRole("button", { name: "Mark paid", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Show repayments").selectOption("All repayments");
  await expect(page.locator(".repayment-group")).toHaveCount(9);
  expect(await page.locator(".budget-stats").innerText()).toBe(spent);
});

test("converter shortcut positions the expanded amount and result in the mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("https://api.frankfurter.dev/**", (route) => {
    const [base, quote] = new URL(route.request().url()).pathname
      .split("/")
      .slice(-2);
    return route.fulfill({
      json: {
        base,
        quote,
        date: new Date().toISOString().slice(0, 10),
        rate: base === "KRW" ? 1 / 1344.29 : 1344.29,
      },
    });
  });
  await budget(page);
  await page
    .getByRole("button", { name: "USD · Convert", exact: true })
    .click();
  await expect(
    page.getByLabel("Amount to convert", { exact: true }),
  ).toBeInViewport({ ratio: 1 });
  await page.getByLabel("From currency").selectOption("KRW");
  await page.getByLabel("To currency").selectOption("USD");
  await page.getByLabel("Amount to convert", { exact: true }).fill("25000");
  await expect(page.locator(".currency-result strong")).toContainText(
    "USD 18.60",
  );
  await expect
    .poll(async () => {
      const box = await page.locator(".currency-result strong").boundingBox();
      return !!box && box.y >= 0 && box.y + box.height < 844 - 72;
    })
    .toBe(true);
});

test("expense badge reflects the selected category without changing budget totals", async ({
  page,
}) => {
  await budget(page);
  const totals = await page.locator(".budget-stats").innerText();
  await page.getByLabel("Filter expense category").selectOption("Other");
  await expect(page.getByRole("button", { name: /^Expense log/ })).toHaveText(
    "Expense log 0",
  );
  await page.getByRole("button", { name: "Show all expenses" }).click();
  await expect(page.getByRole("button", { name: /^Expense log/ })).toHaveText(
    "Expense log 4",
  );
  expect(await page.locator(".budget-stats").innerText()).toBe(totals);
});

test("split preview explains extra cents only when the allocation needs rounding", async ({ page }) => {
  await budget(page);
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  await page.getByLabel("Amount (USD)", { exact: true }).fill("48.50");
  await page.getByRole("checkbox", { name: /I paid for other people too/ }).check();
  await expect(page.getByText("Shares differ by 1¢ so they add up to the payment.")).toBeVisible();
  await expect(page.locator("fieldset strong")).toHaveText(["$12.13", "$12.13", "$12.12", "$12.12"]);
  await page.getByLabel("Amount (USD)", { exact: true }).fill("48");
  await expect(page.getByText("Shares differ by 1¢ so they add up to the payment.")).toHaveCount(0);
  await expect(page.locator("fieldset strong")).toHaveText(["$12.00", "$12.00", "$12.00", "$12.00"]);
});

test("compact mobile breadcrumbs retain every parent link and fit one row", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await budget(page);
  const trail = page.getByRole("navigation", { name: "Breadcrumb", exact: true });
  await expect(trail.getByRole("link", { name: "Your workspace" })).toBeVisible();
  await expect(trail.getByRole("link", { name: "My trips" })).toBeVisible();
  const trip = trail.getByRole("link", { name: "Seattle & Bainbridge getaway" });
  await expect(trip).toBeVisible();
  const rows = await trail.locator("li").evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().top)));
  expect(new Set(rows).size).toBe(1);
  expect(await trail.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
  await trip.click();
  await expect(page).toHaveURL(/#\/8$/);
});

test("mobile shared-expense actions stay fully visible as the participant list scrolls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await budget(page);
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  await page.getByLabel("Amount (USD)", { exact: true }).fill("48.50");
  await page.getByRole("checkbox", { name: /I paid for other people too/ }).check();
  const save = page.getByRole("button", { name: "Save expense", exact: true });
  for (const height of [844, 650]) {
    await page.setViewportSize({ width: 390, height });
    await expect(save).toBeInViewport({ ratio: 1 });
    const box = await save.boundingBox();
    const dialog = await page.getByRole("dialog").boundingBox();
    expect(box!.y + box!.height).toBeLessThan(dialog!.y + dialog!.height - 4);
    await page.locator(".modal-body").evaluate(node => { node.scrollTop = node.scrollHeight; });
    const lastParticipant = page.getByRole("checkbox", { name: /Sam Rivera/ });
    await expect(lastParticipant).toBeInViewport({ ratio: 1 });
    const lastBox = await lastParticipant.boundingBox();
    expect(lastBox!.y + lastBox!.height).toBeLessThan((await save.boundingBox())!.y);
    await expect(save).toBeInViewport({ ratio: 1 });
  }
});
