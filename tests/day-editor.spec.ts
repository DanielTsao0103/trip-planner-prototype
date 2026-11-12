import { expect, test } from "@playwright/test";

test("an owner can assign a day and that traveler can move only that day's events", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("trip-planner-demo-session", "active"));
  await page.goto("./#/13");
  await page.getByRole("button", { name: "Change permissions for Nora Patel" }).click();
  const permissions = page.getByRole("dialog", { name: "Permissions", exact: true });
  await permissions.getByLabel("Role", { exact: true }).selectOption("Day Editor");
  await permissions.getByRole("checkbox", { name: /Day 2/ }).check();
  await permissions.getByRole("button", { name: "Save permissions" }).click();
  await expect(permissions).toHaveCount(0);

  if (!await page.getByRole("button", { name: "Prototype", exact: true }).isVisible()) await page.getByRole("button", { name: "Open navigation menu", exact: true }).click();
  await page.getByRole("button", { name: "Prototype", exact: true }).click();
  const controls = page.getByRole("dialog", { name: "Prototype controls" });
  await controls.getByLabel("View as a fictional participant").selectOption("nora");
  await controls.getByRole("button", { name: "Close dialog" }).click();
  await page.goto("./#/8?view=calendar");

  // The same traveler cannot move an unassigned event, or drag an assigned event outside its day.
  await expect(page.getByRole("button", { name: "Move Across the sound", exact: true })).toHaveCount(0);
  // Direct navigation still enforces permissions when a hidden action is bypassed.
  await page.goto("./#/7?event=ferry&date=2026-10-15");
  await expect(page.getByText("You do not have permission to edit this event.", { exact: true })).toBeVisible();
  await page.goto("./#/8?view=calendar");
  await page.getByRole("button", { name: "Move A morning of art", exact: true }).click();
  const move = page.getByRole("dialog", { name: "Move event" });
  await move.getByLabel("New event date").fill("2026-10-17");
  await move.getByRole("button", { name: "Move event" }).click();
  await expect(move).toContainText("You do not have permission to move events to this day. Choose one of your assigned days.");
  await move.getByLabel("New event date").fill("2026-10-16");
  await move.getByLabel("New start time").fill("09:00");
  await move.getByRole("button", { name: "Move event" }).click();
  await expect(move).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-calendar-date="2026-10-16"] [data-event-id="museum"]')).toHaveAttribute("aria-label", "A morning of art, 9:00 AM to 11:00 AM");
});
