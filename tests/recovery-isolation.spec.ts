import { test, expect, type Page } from "@playwright/test";
import { seed } from "../src/data";
import type { TripRow } from "../src/account-trips";

const owner = {
  id: "55555555-5555-4555-8555-555555555555",
  email: "recovery-owner@example.test",
  aud: "authenticated",
  role: "authenticated",
  user_metadata: { name: "Recovery Tester" },
  app_metadata: { provider: "email" },
  created_at: "2026-01-01T00:00:00Z",
};

/** Separate fixtures let the second tab save without creating a revision conflict. */
function tripRow(id: string, title: string): TripRow {
  const trip = structuredClone(seed().trips[0]);
  return {
    tripID: id,
    owner_id: owner.id,
    created_by: owner.id,
    trip_name: title,
    destinations: ["Seattle"],
    destination: "Seattle",
    start_date: "2027-05-01",
    end_date: "2027-05-04",
    timezone: "America/Los_Angeles",
    revision: 1,
    content_version: 1,
    content: {
      ...trip,
      destinationTimezones: ["America/Los_Angeles"],
      members: [
        {
          id: owner.id,
          name: "Recovery Tester",
          email: owner.email,
          role: "Owner",
          status: "accepted",
          days: [],
        },
      ],
      events: [],
      expenses: [],
      todos: [],
      prefs: {},
      individual: {},
      dismissed: [],
      budget: null,
    },
  };
}

async function addEvent(page: Page, name: string): Promise<void> {
  await page.goto("./#/7");
  await page.getByLabel("Event name", { exact: true }).fill(name);
  await page.getByLabel("Where", { exact: true }).fill("Museum");
  await page
    .getByRole("button", { name: "Add to itinerary", exact: true })
    .click();
}

for (const secondTabFails of [false, true]) {
  test(
    secondTabFails
      ? "two tabs retain independent interrupted drafts through reload"
      : "saving in another tab preserves an interrupted itinerary draft through reload",
    async ({ page, context }) => {
      const firstId = "66666666-6666-4666-8666-666666666666";
      const secondId = "77777777-7777-4777-8777-777777777777";
      const rows = [
        tripRow(firstId, "Interrupted trip"),
        tripRow(secondId, "Other trip"),
      ];
      let failFirstTab = true;
      let failOtherTab = secondTabFails;
      await context.route("https://*.supabase.co/**", async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (path.endsWith("/token"))
          return route.fulfill({
            json: {
              user: owner,
              access_token: "qa-token",
              refresh_token: "qa-refresh",
              token_type: "bearer",
              expires_in: 3600,
            },
          });
        if (path.endsWith("/user")) return route.fulfill({ json: owner });
        if (path.endsWith("/load_trip_bundles"))
          return route.fulfill({ json: rows });
        if (
          path.endsWith("/save_trip_bundle_with_timezones") ||
          path.endsWith("/save_trip_bundle")
        ) {
          if (request.frame().page() === page ? failFirstTab : failOtherTab)
            return route.abort("failed");
          const { p_data: draft, p_expected_revision: revision } =
            request.postDataJSON();
          const index = rows.findIndex((row) => row.tripID === draft.id);
          if (rows[index].revision !== revision)
            return route.fulfill({
              status: 409,
              json: {
                code: "PT409",
                message: "This trip changed in another tab.",
              },
            });
          rows[index] = {
            ...rows[index],
            content: draft,
            revision: revision + 1,
          };
          return route.fulfill({ json: rows[index] });
        }
        if (
          [
            "/rest/v1/forwarded_booking",
            "/rest/v1/user_style",
            "/rest/v1/trip_photo_credit",
            "/rest/v1/rpc/trip_companion_pictures",
          ].includes(path)
        )
          return route.fulfill({ json: [] });
        if (path.endsWith("/set_google_picture"))
          return route.fulfill({ status: 204 });
        return route.fulfill({
          status: 404,
          json: { message: `Unexpected mock request: ${path}` },
        });
      });
      await page.goto("./");
      await page.getByLabel("Email", { exact: true }).fill(owner.email);
      await page.getByLabel("Password", { exact: true }).fill("qa-password");
      await page.getByRole("button", { name: "Log in", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Home", exact: true }),
      ).toBeVisible();

      // Both tabs must load before either has a recovery draft to restore.
      const other = await context.newPage();
      await other.goto("./#/5");
      await other
        .getByRole("button", { name: "Other trip", exact: true })
        .click();
      await page.goto("./#/5");
      await page
        .getByRole("button", { name: "Interrupted trip", exact: true })
        .click();
      await addEvent(page, "Keep my interrupted plan");
      await expect(page.locator(".account-save-banner")).toContainText(
        "Not saved:",
      );
      // Freeze retry timers so a later retry cannot accidentally repair the damaged journal.
      await page.clock.install();
      await page.clock.pauseAt(new Date());
      expect(rows[0].content!.events).toEqual([]);

      await addEvent(other, "Successfully saved in tab two");
      if (secondTabFails) {
        await expect(other.locator(".account-save-banner")).toContainText(
          "Not saved:",
        );
        await other.clock.install();
        await other.clock.pauseAt(new Date());
        expect(rows[1].content!.events).toEqual([]);
      } else {
        await expect(other.locator(".account-save-banner")).toHaveCount(0);
        expect(rows[1].content!.events[0].name).toBe(
          "Successfully saved in tab two",
        );
      }
      failFirstTab = false;
      failOtherTab = false;
      await page.reload();
      await expect(page.locator("#main-content")).toBeVisible();
      await expect(page.locator(".account-save-banner")).toHaveCount(0);
      await expect
        .poll(() => rows[0].content!.events.map((event) => event.name))
        .toContain("Keep my interrupted plan");
      if (secondTabFails) {
        await other.reload();
        await expect(other.locator("#main-content")).toBeVisible();
        await expect
          .poll(() => rows[1].content!.events.map((event) => event.name))
          .toContain("Successfully saved in tab two");
      }
    },
  );
}
