import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({page}) => { await page.route('https://places.googleapis.com/**', route => route.abort()); });

/** Deterministic SDK boundary tests; these do not claim live Google data. */
async function setup(page: Page, outcome: "ready" | "empty" | "error" | "pending" = "ready") {
  await page.route("https://photon.komoot.io/**", route => route.fulfill({ json: { features: [] } }));
  await page.route("https://*.supabase.co/**", route => route.fulfill({ json: [] }));
  await page.addInitScript(({ outcome }) => {
    sessionStorage.setItem("trip-planner-demo-session", "active");
    const initial = { outcome, requests: [] as string[], contexts: [] as string[], pending: [] as (() => void)[] };
    const state: typeof initial = window.parent === window ? initial
      : (window.parent as unknown as { popularTimesTest: typeof initial }).popularTimesTest;
    Object.assign(window, { popularTimesTest: state });
    class PopularTimes extends HTMLElement { rendered = false; }
    class PlaceRequest extends HTMLElement { place = ""; }
    class Details extends HTMLElement {
      connectedCallback() {
        const id = (this.querySelector("gmp-place-details-place-request") as PlaceRequest).place;
        state.requests.push(id);
        const complete = () => {
          // Closing the iframe cancels its pending provider work in real browsers.
          if (!this.isConnected || !this.ownerDocument.defaultView?.frameElement) return;
          if (state.outcome === "error") { this.dispatchEvent(new Event("gmp-error")); return; }
          const chart = this.querySelector("gmp-place-popular-times") as PopularTimes;
          chart.rendered = state.outcome !== "empty";
          if (chart.rendered) {
            const label = document.createElement("p");
            label.textContent = `Google chart fixture: ${id}`;
            this.append(label);
          }
          this.dispatchEvent(new Event("gmp-load"));
        };
        if (state.outcome === "pending") state.pending.push(complete);
        else setTimeout(complete, 0);
      }
    }
    customElements.define("gmp-place-popular-times", PopularTimes);
    customElements.define("gmp-place-details-place-request", PlaceRequest);
    customElements.define("gmp-place-details", Details);
    class Place {
      static async searchByText({ textQuery }: { textQuery: string }) {
        return { places: [{ id: textQuery }] };
      }
    }
    Object.assign(window, { google: { maps: { importLibrary: async () => {
      state.contexts.push(window.parent === window ? "parent" : "frame");
      return { PlaceDetailsElement: Details, PlaceDetailsPlaceRequestElement: PlaceRequest, Place };
    } } } });
  }, { outcome });
  await page.goto("./#/7?event=museum&date=2026-10-16");
}

async function requests(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { popularTimesTest: { requests: string[] } }).popularTimesTest.requests);
}

test("chart loads on expansion, stays inline, and reuses the request through form edits", async ({ page }) => {
  await setup(page);
  const summary = page.locator(".place-popular-times summary");
  expect(await requests(page)).toEqual([]);
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(page.frameLocator("iframe[title=\"Google popular times\"]").locator("gmp-place-details")).toContainText("Google chart fixture:");
  await expect(page.getByText("Typical weekly patterns, not a forecast", { exact: false })).toBeVisible();
  await page.getByLabel("Start time", { exact: true }).fill("10:15");
  await summary.click();
  await summary.click();
  expect(await requests(page)).toHaveLength(1);
  expect(await page.evaluate(() => (window as unknown as { popularTimesTest: { contexts: string[] } }).popularTimesTest.contexts)).toEqual(["frame"]);
  await expect(page.getByRole("link", { name: /Check popular times/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(/#\/8\?date=2026-10-16&event=museum/);
});

test("a place without data has an honest empty state and remains savable", async ({ page }) => {
  await setup(page, "empty");
  await page.locator(".place-popular-times summary").click();
  await expect(page.getByText("Popular times aren’t available for this location.")).toBeVisible();
  await expect(page.locator("iframe[title=\"Google popular times\"]")).toHaveCount(0);
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page).toHaveURL(/#\/8\?date=2026-10-16&event=museum/);
});

test("provider denial shows Retry, which can recover without losing the draft", async ({ page }) => {
  await setup(page, "error");
  await page.getByLabel("Notes (optional)").fill("Keep this plan.");
  await page.locator(".place-popular-times summary").click();
  await expect(page.getByText("Popular times couldn’t load right now. You can still save your event.")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => {
    const retry = document.querySelector(".place-popular-times button")!;
    const actions = document.querySelector("[data-fixed-actions]")!;
    const bottom = ["fixed", "sticky"].includes(getComputedStyle(actions).position) ? Math.min(actions.getBoundingClientRect().top, innerHeight) : innerHeight;
    return retry.getBoundingClientRect().bottom <= bottom;
  })).toBe(true);
  await page.evaluate(() => { (window as unknown as { popularTimesTest: { outcome: string } }).popularTimesTest.outcome = "ready"; });
  await page.getByRole("button", { name: "Retry popular times" }).click();
  await expect(page.frameLocator("iframe[title=\"Google popular times\"]").locator("gmp-place-details")).toContainText("Google chart fixture:");
  await expect(page.getByLabel("Notes (optional)")).toHaveValue("Keep this plan.");
  expect(await requests(page)).toHaveLength(2);
});

test("changing the location drops the old chart and ignores its late completion", async ({ page }) => {
  await setup(page, "pending");
  await page.locator(".place-popular-times summary").click();
  await expect.poll(() => requests(page)).toHaveLength(1);
  await page.getByRole("combobox", { name: "Where", exact: true }).fill("Space Needle, Seattle");
  await page.getByLabel("Start time", { exact: true }).focus();
  await expect(page.locator(".place-popular-times")).not.toHaveAttribute("open", "");
  await page.evaluate(() => {
    const state = (window as unknown as { popularTimesTest: { outcome: string; pending: (() => void)[] } }).popularTimesTest;
    state.outcome = "ready";
    state.pending.forEach(complete => complete());
  });
  await expect(page.locator("iframe[title=\"Google popular times\"]")).toHaveCount(0);
  await page.locator(".place-popular-times summary").click();
  await expect(page.frameLocator("iframe[title=\"Google popular times\"]").locator("gmp-place-details")).toContainText("Space Needle, Seattle");
  expect(await requests(page)).toHaveLength(2);
});

test("a stalled request times out and late responses cannot replace its error", async ({ page }) => {
  await setup(page, "pending");
  await page.clock.install();
  await page.locator(".place-popular-times summary").click();
  await expect.poll(() => requests(page)).toHaveLength(1);
  await page.clock.fastForward(21000);
  await expect(page.getByRole("button", { name: "Retry popular times" })).toBeVisible();
  await page.evaluate(() => {
    const state = (window as unknown as { popularTimesTest: { outcome: string; pending: (() => void)[] } }).popularTimesTest;
    state.outcome = "ready";
    state.pending.forEach(complete => complete());
  });
  await expect(page.locator("iframe[title=\"Google popular times\"]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry popular times" })).toBeVisible();
});

test("the disclosure and recovery fit narrow, tablet, desktop and dark layouts", async ({ page }, testInfo) => {
  await setup(page, "error");
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
      const disclosure = page.locator(".place-popular-times");
      if (await disclosure.getAttribute("open") === null)
        await disclosure.locator("summary").click();
      await expect(page.getByRole("button", { name: "Retry popular times" })).toBeVisible();
      await disclosure.scrollIntoViewIfNeeded();
      const bounds = await disclosure.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await page.screenshot({ path: testInfo.outputPath(`popular-times-${colorScheme}-${width}.png`) });
    }
  }
});
