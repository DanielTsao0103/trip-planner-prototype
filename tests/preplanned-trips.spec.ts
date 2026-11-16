import { expect, test } from "@playwright/test";

test("the full pre-planned catalog is searchable and opens editable trip templates", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Explore a sample trip", exact: true }).click();
  await page.goto("./#/26");
  await expect(page.getByRole("heading", { name: "Pre-planned trips", exact: true })).toBeFocused();
  await expect(page.getByRole("status")).toContainText("76 trips");
  const search = page.getByLabel("Search trips", { exact: true });
  await search.fill("Honolulu");
  await expect(page.getByRole("status")).toContainText("1 trip");
  await page.getByRole("button", { name: "View itinerary", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Oahu beach & island days" })).toContainText("shared by two");
  await expect(page.getByRole("link", { name: "GSA FY2027 CONUS lodging and meals rates" })).toBeVisible();
});


test("catalog search recovers from no matches", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", {name: "Explore a sample trip", exact:true}).click();
  await page.goto("./#/26");
  await page.getByLabel("Search trips", {exact:true}).fill("zzzxxy");
  await expect(page.getByRole("heading", {name:"No trips match your filters"})).toBeVisible();
  await page.getByRole("button", {name:"Clear filters",exact:true}).click();
  await expect(page.getByRole("status")).toHaveText("76 trips");
  await expect(page.getByLabel("Search trips", {exact:true})).toBeFocused();
});


test("catalog combines budget and duration filters and retains choices after preview", async ({page}) => {
  await page.goto("./");
  await page.getByRole("button", {name:"Explore a sample trip",exact:true}).click();
  await page.goto("./#/26");
  await page.getByLabel("Search trips", {exact:true}).fill("Chicago");
  await page.getByLabel("Trip length", {exact:true}).selectOption("3");
  await page.getByLabel("Estimated budget per person", {exact:true}).selectOption("750");
  await expect(page.getByRole("status")).toHaveText("1 trip");
  await page.getByRole("button", {name:"View itinerary",exact:true}).click();
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Trip length", {exact:true})).toHaveValue("3");
  await expect(page.getByLabel("Estimated budget per person", {exact:true})).toHaveValue("750");
  await page.getByLabel("Trip length", {exact:true}).selectOption("4");
  await expect(page.getByRole("heading", {name:"No trips match your filters"})).toBeVisible();
  await page.getByRole("button", {name:"Clear filters",exact:true}).click();
  await expect(page.getByRole("status")).toHaveText("76 trips");
});


test("catalog filters survive route changes and reload under the current person scope", async ({page}) => {
  await page.goto("./");
  await page.getByRole("button", {name:"Explore a sample trip",exact:true}).click();
  await page.goto("./#/26");
  await page.getByLabel("Search trips", {exact:true}).fill("Chicago");
  await page.getByLabel("Trip length", {exact:true}).selectOption("3");
  await page.getByLabel("Estimated budget per person", {exact:true}).selectOption("750");
  await page.goto("./#/4");
  await page.goto("./#/26");
  await expect(page.getByLabel("Search trips", {exact:true})).toHaveValue("Chicago");
  await page.reload();
  await expect(page.getByLabel("Trip length", {exact:true})).toHaveValue("3");
  await expect(page.getByLabel("Estimated budget per person", {exact:true})).toHaveValue("750");
  const keys = await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith("trip-planner-catalog-filters:")));
  expect(keys).toEqual(["trip-planner-catalog-filters:sample:maya"]);
});

test('catalog shows manageable batches while searching the entire collection', async ({page}) => {
  await page.goto('./');
  await page.getByRole('button', {name:'Explore a sample trip',exact:true}).click();
  await page.goto('./#/26');
  await expect(page.locator('.preplanned-result')).toHaveCount(12);
  await expect(page.getByText('Showing 12 of 76 trips', {exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Show more trips',exact:true}).click();
  await expect(page.locator('.preplanned-result')).toHaveCount(24);
  await page.getByLabel('Search trips',{exact:true}).fill('Honolulu');
  await expect(page.locator('.preplanned-result')).toHaveCount(1);
  await expect(page.getByRole('button',{name:'Show more trips',exact:true})).toHaveCount(0);
  await page.getByLabel('Search trips',{exact:true}).fill('');
  await expect(page.locator('.preplanned-result')).toHaveCount(12);
});

test('untouched starter can be cancelled directly while personal edits require confirmation', async ({page}) => {
  await page.goto('./');
  await page.getByRole('button',{name:'Explore a sample trip',exact:true}).click();
  await page.goto('./#/6?template=seattle&returnTo=26');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page).toHaveURL(/#\/26$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.goto('./#/6?template=seattle&returnTo=26');
  await page.getByLabel('Trip title',{exact:true}).fill('My Seattle trip');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Discard trip changes?'})).toBeVisible();
  await page.getByRole('button',{name:'Keep editing',exact:true}).click();
  await expect(page.getByLabel('Trip title',{exact:true})).toHaveValue('My Seattle trip');
});
