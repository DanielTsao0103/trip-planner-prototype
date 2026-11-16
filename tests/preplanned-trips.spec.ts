import { expect, test } from "@playwright/test";

test("the full pre-planned catalog is searchable and opens editable trip templates", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Explore a sample trip", exact: true }).click();
  await page.goto("./#/26");
  await expect(page.getByRole("heading", { name: "Pre-planned trips", exact: true })).toBeFocused();
  await expect(page.getByRole("status")).toContainText("76 trips");
  const search = page.getByLabel("Search trips", { exact: true });
  await search.fill("Honolulu");
  await expect(page.getByRole("status")).toContainText("1 trips");
  await page.getByRole("button", { name: "View itinerary", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Oahu beach & island days" })).toContainText("shared by two");
  await expect(page.getByRole("link", { name: "GSA FY2027 CONUS lodging and meals rates" })).toBeVisible();
});
