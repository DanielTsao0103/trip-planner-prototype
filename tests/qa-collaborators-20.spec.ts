import { expect, test } from "@playwright/test";
import { seed } from "../src/data.ts";

const dietChoices = [
  "Vegetarian",
  "Vegan",
  "Gluten avoidance",
  "Peanut avoidance",
  "Dairy avoidance",
  "Halal",
  "Kosher",
];
const foodChoices = ["Local favorites", "Familiar favorites", "A little of both"];
const diningChoices = ["Casual & simple", "A little extravagant", "A mix of both"];
const atmosphereChoices = ["Relaxed", "Quiet", "Lively", "Fine dining"];
const accessChoices = [
  "Step-free access",
  "Wheelchair access",
  "Places to sit",
  "Accessible restrooms",
  "Low-sensory spaces",
];
const interestChoices = [
  "Modern architecture",
  "History",
  "Culture",
  "Art",
  "Nature",
  "Shopping",
  "Food experiences",
  "Rest & downtime",
];
const ticketChoices = [
  "Happy to book ahead",
  "Prefer flexible / walk-in plans",
  "Need help with advance tickets",
  "Prefer free activities",
];

test("20-person preference coverage stays readable on desktop and mobile", async ({ page }) => {
  const store = seed();
  const trip = store.trips.find((item) => item.id === "seattle")!;
  trip.members = Array.from({ length: 20 }, (_, index) => ({
    id: index === 0 ? "maya" : `qa-traveler-${String(index + 1).padStart(2, "0")}`,
    name: index === 0 ? "Maya Chen" : `Traveler ${String(index + 1).padStart(2, "0")}`,
    email: index === 0 ? "maya@example.com" : `traveler${index + 1}@example.test`,
    role: index === 0 ? "Owner" as const : "Viewer" as const,
    days: [],
    status: "accepted" as const,
  }));
  trip.prefs = Object.fromEntries(trip.members.map((member, index) => {
    const diet = index === 0
      ? ["No restrictions"]
      : [dietChoices[(index - 1) % dietChoices.length], ...(index % 3 === 0 ? [dietChoices[index % dietChoices.length]] : [])];
    return [member.id, {
      diet,
      food: index < 12 ? foodChoices[0] : foodChoices[index % foodChoices.length],
      spending: ["Budget-conscious", "Moderate", "Room to splurge"][index % 3],
      dining: index < 12 ? diningChoices[0] : diningChoices[index % diningChoices.length],
      atmosphere: index < 12 ? atmosphereChoices[0] : atmosphereChoices[index % atmosphereChoices.length],
      access: accessChoices.filter((_, choiceIndex) => (index + choiceIndex) % 4 === 0),
      walk: [250, 400, 600, 800, 1000, 1200, 1500, 2000][index % 8],
      interests: [interestChoices[index % 8], interestChoices[(index + 3) % 8]],
      destinations: [
        "Pike Place Market",
        "Seattle Public Library",
        "Bainbridge ferry terminal",
        "Volunteer Park",
        "Local ceramics market",
      ][index % 5],
      tickets: index < 12 ? ticketChoices[0] : ticketChoices[index % ticketChoices.length],
      notes: [
        "Needs a slow morning",
        "Please leave time to rest",
        "Flexible timing works best",
        "Celebration dinner for the group",
      ][index < 12 ? 0 : index % 4],
    }];
  }));
  store.tripId = trip.id;
  store.userId = "maya";
  await page.addInitScript((value) => {
    sessionStorage.setItem("trip-planner-demo-session", "active");
    localStorage.setItem("trip-planner-demo-v1:demo-maya", JSON.stringify(value));
  }, store);
  await page.goto("./#/13");

  await expect(page.getByText("20 of 20 travelers responded", { exact: true })).toBeVisible();
  await expect(page.getByText("20 of 20 travelers have shared preferences.", { exact: true })).toBeVisible();
  await expect(page.locator(".dietary-no-restrictions")).toContainText("No restrictions");
  for (const label of [...dietChoices, ...foodChoices, ...diningChoices, ...atmosphereChoices,
    "Budget-conscious", "Moderate", "Room to splurge", ...accessChoices, ...interestChoices,
    ...ticketChoices, "Pike Place Market", "Seattle Public Library", "Bainbridge ferry terminal",
    "Volunteer Park", "Local ceramics market", "Needs a slow morning", "Please leave time to rest",
    "Flexible timing works best", "Celebration dinner for the group"]) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
  await expect(page.locator(".collaborator-row")).toHaveCount(20);
  await expect(page.locator(".preference-dot-overflow").first()).toContainText("+");
  await expect(page.locator(".spending-marker")).toHaveCount(20);
  await expect(page.locator(".mobility-radius-option")).toHaveCount(8);
  await expect(page.locator(".mobility-access-option")).toHaveCount(5);
  await expect(page.locator(".dining-preference-option").filter({ hasText: "Fine dining" })).toBeVisible();
  await expect(page.locator(".tickets-notes-note-option")).toHaveCount(4);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
  await page.screenshot({ path: test.info().outputPath(`collaborators-20-${test.info().project.name}.png`), fullPage: true });
  await page.locator(".preference-grid").screenshot({ path: test.info().outputPath(`collaborator-tiles-20-${test.info().project.name}.png`) });
});
