import { expect, test, type Page } from "@playwright/test";

async function enterDemo(page: Page): Promise<void> {
  await page.goto("./");
  await page.getByRole("button", { name: "Try demo as Maya", exact: true }).click();
}

test("long trip-picker lists keep search visible while retaining the current task", async ({ page, isMobile }) => {
  await page.setViewportSize(isMobile ? { width: 320, height: 600 } : { width: 1440, height: 900 });
  await enterDemo(page);
  await page.goto('./#/12');
  await page.evaluate(() => {
    const key = 'trip-planner-demo-v1:demo-maya';
    const state = JSON.parse(localStorage.getItem(key)!);
    const original = state.trips.find((trip: { id: string }) => trip.id === state.tripId);
    for (let index = 1; index <= 12; index++) state.trips.push({ ...structuredClone(original),
      id: `picker-${index}`, title: `Autumn adventure ${index} with friends through the Pacific Northwest` });
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await page.locator(isMobile ? '.mobile-trip-context' : '.trip-switch').click();
  const dialog = page.getByRole('dialog', { name: 'Choose a trip', exact: true });
  const search = dialog.getByLabel('Find a trip', { exact: true });
  await dialog.locator('.trip-picker > button').last().focus();
  await expect(search).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: test.info().outputPath('picker-scrolled-search.png') });
  await search.fill('Autumn adventure 12');
  await expect(dialog.locator('.trip-picker > button')).toHaveCount(1);
  await dialog.locator('.trip-picker > button').click();
  await expect(page).toHaveURL(/#\/12$/);
  await expect(page.getByRole('heading', { name: 'Budget', exact: true })).toBeVisible();
});

test("prototype sections are directly reachable on desktop tablet and short phone", async ({ page }) => {
  await enterDemo(page);
  for (const width of [1440, 768, 320]) {
    await page.setViewportSize({ width, height: width === 320 ? 600 : 900 });
    await page.goto('./#/12');
    const opener = page.getByRole('button', { name: 'Prototype', exact: true }).filter({ visible: true });
    if (!await opener.count()) await page.getByRole('button', { name: 'Open navigation menu', exact: true }).click();
    await opener.click();
    const dialog = page.getByRole('dialog', { name: 'Prototype controls', exact: true });
    await dialog.getByRole('button', { name: 'Screens', exact: true }).click();
    await expect(dialog.locator('.screen-index > button').first()).toBeInViewport({ ratio: 1 });
    await expect(dialog.getByLabel('Demo date', { exact: true })).toBeHidden();
    await dialog.getByRole('button', { name: 'Date & time', exact: true }).click();
    await dialog.getByRole('button', { name: 'During', exact: true }).click();
    await dialog.getByLabel('Demo time', { exact: true }).fill('09:30');
    const apply = dialog.getByRole('button', { name: 'Apply & open Today', exact: true }).filter({ visible: true });
    await expect(apply).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: test.info().outputPath(`prototype-time-${width}.png`) });
    await apply.click();
    await expect(page).toHaveURL(/#\/10$/);
  }
});

test("navigation opens the existing template collection and focuses its heading", async ({ page }) => {
  await enterDemo(page);
  await page.goto("./#/12");
  await page.setViewportSize({ width: 390, height: 844 });
  const menu = page.getByRole("button", { name: "Open navigation menu", exact: true });
  // Desktop uses the same responsive menu once the sidebar collapses.
  if (!await menu.isVisible()) await page.setViewportSize({ width: 768, height: 900 });
  await menu.click();
  const dialog = page.getByRole("dialog", { name: "Your next stop" });
  const menuTitle = dialog.getByRole("heading", { name: "Your next stop", exact: true });
  const titleFont = await menuTitle.evaluate((heading) => {
    const probe = document.createElement("span");
    probe.style.fontFamily = "var(--font-heading)";
    heading.append(probe);
    const selected = getComputedStyle(probe).fontFamily;
    const actual = getComputedStyle(heading).fontFamily;
    probe.remove();
    return { selected, actual };
  });
  expect(titleFont.actual).toBe(titleFont.selected);
  const tripSection = dialog.getByRole("heading", { name: "Your trip - Seattle & Bainbridge getaway", exact: true });
  await expect(tripSection).toBeVisible();
  const tripSectionStyle = await tripSection.evaluate((heading) => ({
    fontSize: Number.parseFloat(getComputedStyle(heading).fontSize),
    divider: getComputedStyle(heading).borderBottomStyle,
  }));
  const menuItemFontSize = await dialog.getByRole("button", { name: "Map", exact: true }).evaluate((button) => Number.parseFloat(getComputedStyle(button).fontSize));
  expect(tripSectionStyle.fontSize).toBeGreaterThanOrEqual(menuItemFontSize * 1.45);
  expect(tripSectionStyle.divider).toBe("solid");
  await dialog.getByRole("button", { name: "Pre-planned trips", exact: true }).click();
  await expect(page).toHaveURL(/#\/4\?section=templates$/);
  const heading = page.getByRole("heading", { name: "Pre-planned trips", exact: true });
  await expect(heading).toBeFocused();
  await expect(heading).toBeInViewport();
  await expect(page.getByRole("region", { name: "Pre-planned trip carousel" })).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("template-destination.png") });
});

test("expense dialog keeps dynamic controls in the tab cycle and restores focus on Escape", async ({ page }) => {
  await enterDemo(page);
  await page.goto("./#/12");
  const opener = page.getByRole("button", { name: "Add expense", exact: true });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Add an expense", exact: true });
  const close = dialog.getByRole("button", { name: "Close dialog", exact: true });
  const save = dialog.getByRole("button", { name: "Save expense", exact: true });
  await expect(close).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(save).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await dialog.getByLabel("I paid for other people too", { exact: false }).check();
  const participant = dialog.locator("fieldset input").last();
  await participant.focus();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(save).toBeFocused();
  await expect(save).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath("expense-keyboard-save.png") });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(page.locator(".app-shell")).not.toHaveAttribute("inert", "");
});

test("modal skips unavailable controls and recovers when its focused control disappears", async ({ page }) => {
  await enterDemo(page);
  await page.goto("./#/12");
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add an expense", exact: true });
  const close = dialog.getByRole("button", { name: "Close dialog", exact: true });
  // Exercise runtime changes independently of network timing: async forms can hide/disable actions.
  await dialog.evaluate(element => {
    const unavailable = document.createElement("div");
    unavailable.innerHTML = '<button hidden>Hidden action</button><button disabled>Busy action</button><button tabindex="-1">Programmatic action</button>';
    element.append(unavailable);
  });
  await close.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Save expense", exact: true })).toBeFocused();
  await dialog.getByLabel("What was it for?", { exact: true }).focus();
  await dialog.getByLabel("What was it for?", { exact: true }).evaluate(input => input.setAttribute("disabled", ""));
  await expect(close).toBeFocused();
  // A dialog with no available controls still owns focus until actions return.
  await dialog.evaluate(element => {
    element.querySelectorAll("button,input,select,textarea").forEach(control => control.setAttribute("disabled", ""));
  });
  await expect(dialog).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("modal preserves pre-existing inert content and leaves destination focus on navigation", async ({ page }) => {
  await enterDemo(page);
  await page.goto("./#/4");
  await page.evaluate(() => {
    const region = document.createElement("section");
    region.id = "already-inert-region";
    region.inert = true;
    document.body.append(region);
  });
  const template = page.locator('.planned-trip-card[tabindex="0"]').first();
  await template.click();
  const dialog = page.getByRole("dialog");
  await expect(page.locator(".app-shell")).toHaveAttribute("inert", "");
  await dialog.getByRole("button", { name: "Add this trip", exact: true }).click();
  await expect(page).toHaveURL(/#\/6\?template=/);
  await expect(page.locator("#main-content")).toBeFocused();
  await expect(page.locator("#already-inert-region")).toHaveAttribute("inert", "");
  await expect(page.locator(".app-shell")).not.toHaveAttribute("inert", "");
});
