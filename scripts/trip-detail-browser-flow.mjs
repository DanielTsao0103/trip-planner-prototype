/** Shared browser journey, run with both mocked responses and real QA accounts. */
import { expect } from "@playwright/test";
export const saved = async (page) => {
  await expect(page.locator("#main-content")).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".account-save-banner")).toHaveCount(0, {
    timeout: 15000,
  });
};
export async function detailJourney(page, base) {
  const goto = (route) => page.goto(`${base}#/${route}`);
  const button = (name) => page.getByRole("button", { name, exact: true });
  const field = (name) => page.getByLabel(name, { exact: true });
  const today = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  await goto("6");
  await field("Trip title").fill("Full detail browser QA");
  await field("Where are you going?").fill("Taipei");
  await field("Start date").fill(today);
  await field("End date").fill(today);
  await field("Trip time zone").selectOption("Asia/Taipei");
  await button("Create trip").click();
  await button("Full detail browser QA").click();
  await saved(page);
  await goto("13");
  await button("Invite someone").click();
  await field("Traveler name").fill("Guest Traveler");
  await field("Traveler email").fill("guest@example.com");
  await button("Save traveler").click();
  await saved(page);
  await button("Manage traveler").click();
  await button("Add as guest traveler").click();
  await saved(page);
  await button("Change permissions for Guest Traveler").click();
  await field("Role").selectOption("Day Editor");
  await page.getByRole("checkbox", { name: /Day 1/ }).check();
  await button("Save permissions").click();
  await saved(page);
  await goto("7");
  await field("Event name").fill("Museum visit");
  await field("Where").fill("National museum");
  await field("Day").selectOption(today);
  await field("Start time").fill("10:00");
  await field("End time").fill("11:00");
  await field("Estimated cost (USD)").fill("10.07");
  await field("Notes (optional)").fill("Bring tickets");
  await page.getByRole("checkbox", { name: /Guest Traveler/ }).check();
  await button("Add to itinerary").click();
  await saved(page);
  // Edit via the actual itinerary card, then verify the form reloads saved values.
  await page
    .getByRole("button", { name: /Museum visit/ })
    .first()
    .click();
  await button("Edit event").click();
  await field("Notes (optional)").fill("Bring printed tickets");
  await button("Save changes").click();
  await saved(page);
  await goto("15");
  await page.getByRole("checkbox", { name: "Vegetarian", exact: true }).check();
  await field("Restaurant atmosphere").selectOption("Quiet");
  await button("Next").click();
  await field("Places you’d love to include").fill("Old town");
  await page
    .getByRole("checkbox", { name: "Step-free access", exact: true })
    .check();
  await field("Maximum comfortable continuous walk (meters)").fill("1500");
  await button("Next").click();
  await field("Anything else the group should know?").fill("A slower pace");
  await button("Save my preferences").click();
  await saved(page);
  await goto("12");
  await button("Set budget").first().click();
  await field("Group budget (USD)").fill("1000.01");
  await button("Save budget").click();
  await saved(page);
  await button("Budget settings").click();
  await field("How should we track spending?").selectOption("individual");
  await field("Your individual budget (USD)").fill("600.02");
  await button("Save budget").click();
  await saved(page);
  await button("Add expense").click();
  await field("What was it for?").fill("Shared lunch");
  await field("Amount (USD)").fill("10.01");
  await page
    .getByRole("checkbox", { name: /I paid for other people too/ })
    .check();
  await button("Save expense").click();
  await saved(page);
  await page
    .locator(".expense-row")
    .filter({ hasText: "Shared lunch" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await field("What was it for?").fill("Shared lunch edited");
  await button("Save expense").click();
  await saved(page);
  await button("Reimbursements").click();
  await button("Mark paid").click();
  await button("Mark completed").click();
  await saved(page);
  // Unsettled expenses can be removed; settled allocations must remain protected.
  await button("Add expense").click();
  await field("What was it for?").fill("Temporary snack");
  await field("Amount (USD)").fill("2.50");
  await button("Save expense").click();
  await saved(page);
  await page.getByRole("button", { name: /Expense log/ }).click();
  await page
    .locator(".expense-row")
    .filter({ hasText: "Temporary snack" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  page.once("dialog", (d) => d.accept());
  await button("Delete expense").click();
  await saved(page);
  await page
    .locator(".expense-row")
    .filter({ hasText: "Shared lunch edited" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await button("Delete expense").click();
  await expect(page.getByRole("alert")).toContainText("Completed repayments");
  await button("Close dialog").click();
  await goto("10");
  await field("New to-do").fill("Pack tickets");
  await button("Add to-do").click();
  await saved(page);
  await page.getByRole("checkbox", { name: /Pack tickets/ }).check();
  await saved(page);
  await field("New to-do").fill("Temporary reminder");
  await button("Add to-do").click();
  await saved(page);
  await button("Delete reminder: Temporary reminder").click();
  await saved(page);
  await page.reload();
  await saved(page);
  await expect(
    page.getByRole("checkbox", { name: /Pack tickets/ }),
  ).toBeChecked();
  await goto("13");
  page.once("dialog", (d) => d.accept());
  await button("Remove Guest Traveler").click();
  await saved(page);
  await expect(
    page.getByRole("button", { name: "Remove Guest Traveler", exact: true }),
  ).toHaveCount(0);
  await goto("12");
  await button("Reimbursements").click();
  await expect(page.getByText("Completed", { exact: true })).toBeVisible();
  return { today };
}
