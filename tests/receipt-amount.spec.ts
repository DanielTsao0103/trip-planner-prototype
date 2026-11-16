import { test, expect, type Route } from "@playwright/test";

test("receipt totals fill USD automatically after currency review, corrections and conversion", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("./");
  await page.getByRole("button", { name: "Explore a sample trip", exact: true }).click();
  await page.goto("./#/12");
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  // A real OCR image with a readable total but no explicit currency reproduces
  // the original dead end without substituting a prefilled form or scan result.
  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 800; canvas.height = 500;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "white"; context.fillRect(0, 0, 800, 500);
    context.fillStyle = "black"; context.font = "30px monospace";
    ["AUTOFILL CAFE", "Latte                      9.00", "Sandwich                  12.00", "Subtotal                  21.00", "Tax                        1.68", "Tip                        3.00", "TOTAL                     25.68"]
      .forEach((line, index) => context.fillText(line, 35, 60 + index * 52));
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Upload receipt image", { exact: true }).setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: Buffer.from(image, "base64") });
  await expect(page.getByLabel("Receipt item 1", { exact: true })).toBeVisible({ timeout: 60_000 });
  const amount = page.getByLabel("Amount (USD)", { exact: true });
  const currency = page.getByLabel("Receipt currency", { exact: true });
  await expect(amount).toHaveValue("");
  await expect(currency).toBeVisible();
  await currency.selectOption("USD");
  await expect(amount).toHaveValue("25.68");
  await page.getByText("Subtotal, tax and tip", { exact: true }).click();
  const total = page.getByLabel("Receipt printed total", { exact: true });
  await total.fill("30.00");
  await expect(amount).toHaveValue("30.00");

  await page.route("https://api.frankfurter.dev/v2/rate/EUR/USD", route => route.fulfill({ json: {
    base: "EUR", quote: "USD", rate: 1.2, date: new Date().toISOString().slice(0, 10),
  } }));
  await currency.selectOption("EUR");
  await expect(amount).toHaveValue("36.00");
  await expect(page.getByText(/Estimated USD amount using/)).toBeVisible();

  await page.route("https://api.frankfurter.dev/v2/rate/GBP/USD", route => route.fulfill({ status: 503, body: "Unavailable" }));
  await currency.selectOption("GBP");
  await expect(amount).toHaveValue("");
  await expect(page.getByText(/Could not convert the receipt total/)).toBeVisible();

  let pendingRate: Route | undefined;
  await page.route("https://api.frankfurter.dev/v2/rate/CAD/USD", route => { pendingRate = route; });
  await currency.selectOption("CAD");
  await expect.poll(() => Boolean(pendingRate)).toBe(true);
  await expect(page.getByRole("button", { name: "Save expense", exact: true })).toBeDisabled();
  await amount.fill("28.00");
  await pendingRate!.fulfill({ json: { base: "CAD", quote: "USD", rate: 0.75, date: new Date().toISOString().slice(0, 10) } });
  await total.fill("40.00");
  await currency.selectOption("USD");
  await expect(amount).toHaveValue("28.00");
  await page.getByRole("button", { name: "Use $40.00 as expense amount", exact: true }).click();
  await total.fill("25.68");
  await expect(amount).toHaveValue("25.68");
  await page.getByLabel("I checked the receipt details and the USD expense amount.", { exact: true }).check();
  await page.screenshot({ path: test.info().outputPath("receipt-amount-filled.png") });
  await page.getByRole("button", { name: "Save expense", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("AUTOFILL CAFE", { exact: true })).toBeVisible();
  await page.locator(".expense-row").filter({ hasText: "AUTOFILL CAFE" }).getByRole("button", { name: "Edit", exact: true }).click();
  await expect(amount).toHaveValue("25.68");
});
