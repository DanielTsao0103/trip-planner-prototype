import { expect, test, type Page } from "@playwright/test";

test("saving a sample receipt reveals its new row above phone navigation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await budget(page);
  await page.getByText("Sample tools", { exact: true }).click();
  await page.getByRole("button", { name: "Try sample receipt", exact: true }).click();
  await page.getByRole("button", { name: "Use sample receipt", exact: true }).click();
  await expect(page.getByLabel("What was it for?", { exact: true })).toHaveValue("Sample café receipt");
  await page.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Filter expense category", { exact: true })).toHaveValue("All");
  const row = page.locator(".expense-row").filter({ hasText: "Sample café receipt" });
  await expect(row).toBeFocused();
  expect(await row.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const bottom = document.querySelector(".mobile-nav")!.getBoundingClientRect().top;
    return bounds.top >= 0 && bounds.bottom <= bottom;
  })).toBe(true);
  await page.screenshot({ path: test.info().outputPath("receipt-result-visible.png") });
  await page.reload();
  await expect(row).toHaveCount(1);
});

test("saving a different category reveals the expense instead of leaving it filtered out", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await budget(page);
  await page.getByLabel("Filter expense category", { exact: true }).selectOption("Stay");
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("What was it for?", { exact: true }).fill("Train tickets");
  await dialog.getByLabel("Amount (USD)", { exact: true }).fill("12");
  await dialog.getByLabel("Category", { exact: true }).selectOption("Transport");
  await dialog.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel("Filter expense category", { exact: true })).toHaveValue("All");
  await expect(page.locator(".expense-row").filter({ hasText: "Train tickets" })).toBeFocused();
  await expect(page.getByRole('status').filter({hasText:'Expense recorded'})).toBeVisible();
  await page.goto('./#/9');
  await expect(page.getByRole('heading',{name:'Suggestions',exact:true})).toBeVisible();
  await expect(page.locator('.toast').filter({hasText:'Expense recorded'})).toHaveCount(0);
});

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

test('keeping a new sample transaction replaces the previous Undo feedback', async ({ page }) => {
  await budget(page);
  await page.getByText('Sample tools', { exact: true }).click();
  const simulate = page.getByRole('button', { name: 'Simulate transaction', exact: true });
  await simulate.click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.locator('.budget-feedback')).toContainText('Sample transaction removed.');
  await expect(page.locator('.budget-feedback')).toBeFocused();
  expect(await page.locator('.budget-feedback').evaluate(element => {
    const bounds = element.getBoundingClientRect();
    const nav = document.querySelector<HTMLElement>('.mobile-nav');
    const bottom = nav?.getClientRects().length ? nav.getBoundingClientRect().top : innerHeight;
    return bounds.top >= 0 && bounds.bottom <= bottom;
  })).toBe(true);
  await simulate.click();
  await page.getByRole('button', { name: 'Keep expense', exact: true }).click();
  await expect(page.locator('.budget-feedback')).toContainText('Sample transaction added.');
  await expect(page.getByText('Sample transaction removed.', { exact: true })).toHaveCount(0);
  await expect(page.locator('.expense-row').filter({ hasText: 'Sample coffee transaction' })).toHaveCount(1);
  await expect(page.locator('.expense-row').filter({ hasText: 'Sample coffee transaction' })).toBeFocused();
  await page.reload();
  await expect(page.locator('.expense-row').filter({ hasText: 'Sample coffee transaction' })).toHaveCount(1);
});

test('setting the first budget restores focus to its replacement settings action', async ({ page }) => {
  await budget(page);
  await page.evaluate(() => {
    const key = 'trip-planner-demo-v1:demo-maya';
    const state = JSON.parse(localStorage.getItem(key)!);
    state.trips.find((trip: { id: string }) => trip.id === state.tripId).budget = null;
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Set budget', exact: true }).click();
  await page.getByLabel('Group budget (USD)', { exact: true }).fill('2000');
  await page.getByRole('button', { name: 'Save budget', exact: true }).click();
  const settings = page.getByRole('button', { name: 'Budget settings', exact: true });
  await expect(settings).toBeFocused();
  await expect(page.locator('.budget-stats')).toContainText('$2,000.00');
  await settings.press('Enter');
  await expect(page.getByLabel('Group budget (USD)', { exact: true })).toHaveValue('2000');
});

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
  const addedExpense = page
    .locator(".expense-row")
    .filter({ hasText: "Shared lunch UX check" });
  await expect(addedExpense).toContainText("$48.50");
  const feedback = page
    .getByRole("status")
    .filter({ hasText: "Expense recorded" });
  await expect(feedback).toBeVisible();
  const feedbackBox = await feedback.boundingBox();
  const expenseBox = await addedExpense.boundingBox();
  expect(feedbackBox!.y + feedbackBox!.height).toBeLessThan(expenseBox!.y);
  await feedback.getByRole("button", { name: "Dismiss message" }).click();
  await expect(feedback).toHaveCount(0);
  await expect(addedExpense).toBeVisible();
});

test("repayment confirmation identifies the traveler and amount before recording payment", async ({
  page,
}) => {
  await budget(page);
  await page.getByRole("button", { name: /^Repayments/ }).click();
  await page
    .locator(".repayment-group")
    .filter({ hasText: /Eli.*owes.*you/ })
    .locator("summary")
    .click();
  const row = page
    .locator(".repayment-group")
    .filter({ hasText: /Eli.*owes.*you/ })
    .locator(".debt-row")
    .filter({ hasText: "$400.00" })
    .first();
  await row.getByRole("button", { name: "Mark paid" }).click();
  const confirmation = page.getByRole("dialog", { name: "Confirm repayment" });
  await expect(confirmation).toContainText("Eli");
  await expect(confirmation).toContainText("$400.00");
  await expect(confirmation).toContainText("No money is transferred");
  await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(row.getByRole("button", { name: "Mark paid" })).toBeVisible();
  await expect(row.getByText("Completed", { exact: true })).toHaveCount(0);
});

test("repayment subtotals exclude completed payments and relationship filters preserve totals", async ({
  page,
}) => {
  await budget(page);
  const spent = await page.locator(".budget-stats").innerText();
  await page.getByRole("button", { name: /^Repayments/ }).click();
  await expect(page.getByLabel("Show repayments")).toHaveValue("Owed to me");
  await expect(page.locator(".repayment-group")).toHaveCount(3);
  await expect(page.locator(".repayment-overview")).toContainText("$1,290.00");
  const group = page
    .locator(".repayment-group")
    .filter({ hasText: /Eli.*owes.*you/ });
  await expect(group.locator(":scope > summary")).toContainText("$430.00 unpaid");
  await group.locator(":scope > summary").click();
  await group
    .locator(".debt-row")
    .filter({ hasText: "$400.00" })
    .getByRole("button", { name: "Mark paid" })
    .click();
  await page
    .getByRole("dialog", { name: "Confirm repayment" })
    .getByRole("button", { name: "Mark paid", exact: true })
    .click();
  await expect(group.locator(":scope > summary")).toContainText("$30.00 unpaid");
  await expect(group.getByText("Completed", { exact: true })).toHaveCount(1);
  await expect(
    group.getByText("Awaiting repayment", { exact: true }),
  ).toHaveCount(0);
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
  await page.setViewportSize({ width: 390, height: 600 });
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
  const refresh = page.getByRole("button", { name: "Refresh rates", exact: true });
  await expect(refresh).toHaveCount(1);
  await expect(refresh).toHaveText("Refresh");
  const refreshBox = await refresh.boundingBox();
  expect(refreshBox!.height).toBeGreaterThanOrEqual(44);
  expect(refreshBox!.width).toBeGreaterThanOrEqual(44);
  expect(refreshBox!.y + refreshBox!.height).toBeLessThan(600 - 62);
  await expect
    .poll(async () => {
      const box = await page.locator(".currency-result strong").boundingBox();
      return !!box && box.y >= 0 && box.y + box.height < 600 - 72;
    })
    .toBe(true);
  await page.screenshot({ path: test.info().outputPath("short-conversion-result.png") });
});

test("expense count retains its meaning across category filters and repayment tabs", async ({
  page,
}) => {
  await budget(page);
  const totals = await page.locator(".budget-stats").innerText();
  await page.getByLabel("Filter expense category").selectOption("Other");
  await expect(page.getByRole("button", { name: /^Expense log/ })).toHaveText(
    "Expense log 4",
  );
  await expect(page.locator(".ledger-filter-count")).toHaveText("0 of 4 expenses");
  await page.getByRole("button", { name: /^Repayments/ }).click();
  await expect(page.getByRole("button", { name: /^Expense log/ })).toHaveText("Expense log 4");
  await expect(page.locator(".ledger-filter-count")).toHaveCount(0);
  await page.getByRole("button", { name: /^Expense log/ }).click();
  await expect(page.locator(".ledger-filter-count")).toHaveText("0 of 4 expenses");
  await page.getByRole("button", { name: "Show all expenses" }).click();
  await expect(page.getByRole("button", { name: /^Expense log/ })).toHaveText(
    "Expense log 4",
  );
  expect(await page.locator(".budget-stats").innerText()).toBe(totals);
});

test("split preview explains extra cents only when the allocation needs rounding", async ({
  page,
}) => {
  await budget(page);
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  await page.getByLabel("Amount (USD)", { exact: true }).fill("48.50");
  await page
    .getByRole("checkbox", { name: /I paid for other people too/ })
    .check();
  await expect(
    page.getByText("Shares differ by 1¢ so they add up to the payment."),
  ).toBeVisible();
  await expect(page.locator("fieldset strong")).toHaveText([
    "$12.13",
    "$12.13",
    "$12.12",
    "$12.12",
  ]);
  await page.getByLabel("Amount (USD)", { exact: true }).fill("48");
  await expect(
    page.getByText("Shares differ by 1¢ so they add up to the payment."),
  ).toHaveCount(0);
  await expect(page.locator("fieldset strong")).toHaveText([
    "$12.00",
    "$12.00",
    "$12.00",
    "$12.00",
  ]);
});

test("compact mobile breadcrumbs retain every parent link and fit one row", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await budget(page);
  const trail = page.getByRole("navigation", {
    name: "Breadcrumb",
    exact: true,
  });
  await expect(
    trail.getByRole("link", { name: "Home", exact: true }),
  ).toBeVisible();
  await expect(trail.getByRole("link", { name: "My trips" })).toBeVisible();
  const trip = trail.getByRole("link", {
    name: "Seattle & Bainbridge getaway",
  });
  await expect(trip).toBeVisible();
  const rows = await trail
    .locator("li")
    .evaluateAll((nodes) =>
      nodes.map((node) => Math.round(node.getBoundingClientRect().top)),
    );
  expect(new Set(rows).size).toBe(1);
  expect(
    await trail.evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
  ).toBe(true);
  await trip.click();
  await expect(page).toHaveURL(/#\/8$/);
});

test("mobile shared-expense actions stay fully visible as the participant list scrolls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await budget(page);
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  await page.getByLabel("Amount (USD)", { exact: true }).fill("48.50");
  await page
    .getByRole("checkbox", { name: /I paid for other people too/ })
    .check();
  const save = page.getByRole("button", { name: "Save expense", exact: true });
  for (const height of [844, 650, 500]) {
    await page.setViewportSize({ width: 390, height });
    await expect(save).toBeInViewport({ ratio: 1 });
    const box = await save.boundingBox();
    const dialog = await page.getByRole("dialog").boundingBox();
    expect(box!.y + box!.height).toBeLessThan(dialog!.y + dialog!.height - 4);
    await page.locator(".expense-fields").evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
    const lastParticipant = page.getByRole("checkbox", { name: /Sam Rivera/ });
    await expect(lastParticipant).toBeInViewport({ ratio: 1 });
    const lastBox = await lastParticipant.boundingBox();
    expect(lastBox!.y + lastBox!.height).toBeLessThan(
      (await save.boundingBox())!.y,
    );
    await expect(save).toBeInViewport({ ratio: 1 });
    // Focusing a choice must scroll it above the footer, even in a short viewport.
    await lastParticipant.focus();
    const focused = await lastParticipant.boundingBox();
    const fields = await page.locator(".expense-fields").boundingBox();
    expect(focused!.y).toBeGreaterThanOrEqual(fields!.y);
    expect(focused!.y + focused!.height).toBeLessThanOrEqual(
      fields!.y + fields!.height,
    );
  }
});

for (const width of [768, 1024]) {
  test(`tablet ledger at ${width}px keeps the breakdown below it`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await budget(page);
    const ledger = await page.locator(".ledger-card").boundingBox();
    const chart = await page.locator(".chart-card").boundingBox();
    expect(chart!.y).toBeGreaterThanOrEqual(ledger!.y + ledger!.height);
    await expect(
      page.getByRole("button", { name: "Spending breakdown" }),
    ).toHaveAttribute("aria-expanded", "false");
  });
}

for (const [width, height] of [[390, 600], [320, 256]]) test(`expense validation reveals the field and error above actions at ${width}x${height}`, async ({ page }) => {
  await page.setViewportSize({ width, height });
  await budget(page);
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  const purpose = page.getByLabel("What was it for?", { exact: true });
  const amount = page.getByLabel("Amount (USD)", { exact: true });
  const save = page.getByRole("button", { name: "Save expense", exact: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    await save.click();
    await expect(purpose).toBeFocused();
    await expect(purpose).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#expense-purpose-error")).toHaveText("Enter expense description.");
    const field = await purpose.locator("../..").boundingBox();
    const fields = await page.locator(".expense-fields").boundingBox();
    expect(field!.y).toBeGreaterThanOrEqual(fields!.y);
    expect(field!.y + field!.height).toBeLessThanOrEqual(fields!.y + fields!.height);
    await expect(save).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: test.info().outputPath(`expense-validation-${width}-${height}-${attempt}.png`) });
  }
  await purpose.fill("Persistent validation lunch");
  await save.click();
  await expect(amount).toBeFocused();
  await expect(page.locator("#expense-purpose-error")).toHaveCount(0);
  await expect(page.locator("#expense-amount-error")).toHaveText("Enter the amount you paid.");
  await expect(page.getByText("Enter the amount you paid.", { exact: true })).toHaveCount(1);
  await amount.fill("0");
  await save.click();
  await expect(page.locator("#expense-amount-error")).toContainText("$0.01");
  await expect(page.getByRole("dialog")).toBeVisible();
  await amount.fill("-2");
  await save.click();
  await expect(amount).toBeFocused();
  await expect(page.locator("#expense-amount-error")).toContainText("$0.01");
  await expect(purpose).toHaveValue("Persistent validation lunch");
  await amount.fill("12.345");
  await save.click();
  await expect(page.locator("#expense-amount-error")).toContainText("2 decimal places");
  await amount.fill("12.34");
  await save.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".expense-row").filter({ hasText: "Persistent validation lunch" })).toContainText("$12.34");
});

test("phone budget totals identify group and individual scope", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await budget(page);
  await expect(page.locator(".budget-phone-scope")).toHaveText("Whole group · USD");
  await page.getByRole("button", { name: "Budget settings", exact: true }).click();
  await page.getByLabel("How should we track spending?", { exact: true }).selectOption("individual");
  await page.getByRole("button", { name: "Save budget", exact: true }).click();
  await expect(page.locator(".budget-phone-scope")).toHaveText("Your share · USD");
});

test('settled expense details explain the lock before editing and preserve history', async ({ page }) => {
  await budget(page);
  if (page.viewportSize()!.width < 760) await page.setViewportSize({ width: 390, height: 600 });
  const original = await page.evaluate(() => {
    const key = 'trip-planner-demo-v1:demo-maya';
    const state = JSON.parse(localStorage.getItem(key)!);
    const expense = state.trips.find((trip: {id: string}) => trip.id === state.tripId).expenses[0];
    expense.settled = Object.keys(expense.shares).filter(id => id !== expense.payer).slice(0, 1);
    localStorage.setItem(key, JSON.stringify(state));
    return expense;
  });
  await page.reload();
  const row = page.locator('.expense-row').filter({ hasText: original.purpose });
  await expect(row.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await row.getByRole('button', { name: 'Details', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Expense details', exact: true });
  await expect(dialog).toContainText('repayment history and cannot be changed');
  await dialog.locator('.expense-history-splits > summary').click();
  await expect(dialog.getByText('Repayment completed', { exact: true })).toBeVisible();
  await expect(dialog.locator('input, textarea, select')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Save expense', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Done', exact: true }).click();
  await expect.poll(() => page.evaluate(id => {
    const state = JSON.parse(localStorage.getItem('trip-planner-demo-v1:demo-maya')!);
    return state.trips.find((trip: {id: string}) => trip.id === state.tripId).expenses.find((expense: {id: string}) => expense.id === id);
  }, original.id)).toEqual(original);
});

test('budget setup keeps invalid amounts inline and recovers without losing the selected mode', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 600 });
  await budget(page);
  await page.getByRole('button', { name: 'Budget settings', exact: true }).click();
  await page.getByLabel('How should we track spending?', { exact: true }).selectOption('individual');
  const amount = page.getByLabel('Your individual budget (USD)', { exact: true });
  await amount.fill('');
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByRole('button', { name: 'Save budget', exact: true }).click();
    await expect(amount).toBeFocused();
    await expect(amount).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('alert')).toHaveText('Enter your budget.');
    await expect(page.getByRole('alert')).toBeInViewport({ ratio: 1 });
  }
  await page.screenshot({ path: test.info().outputPath('short-budget-validation.png') });
  await amount.fill('1200');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save budget', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Budget settings', exact: true }).click();
  await expect(page.getByLabel('How should we track spending?', { exact: true })).toHaveValue('individual');
  await expect(page.getByLabel('Your individual budget (USD)', { exact: true })).toHaveValue('1200');
});
