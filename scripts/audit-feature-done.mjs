/** Opt-in live audit. Requires a disposable QA_ACCOUNT_FILE ({url,key,email,password,userId}).
 * Restores account name/password/photo and deletes only its generated trip in finally.
 * Install Lighthouse and puppeteer-core separately in QA_TOOLS_ROOT (default /tmp/trip-dod-tools).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
const root = resolve(
  process.env.QA_TOOLS_ROOT || "/tmp/trip-dod-tools",
  "node_modules",
);
const { snapshot } = await import(
  pathToFileURL(resolve(root, "lighthouse/core/index.js"))
);
const { default: puppeteer } = await import(
  pathToFileURL(resolve(root, "puppeteer-core/lib/puppeteer/puppeteer-core.js"))
);
const a = JSON.parse(readFileSync(process.env.QA_ACCOUNT_FILE, "utf8"));
const site =
  process.argv[2] || "https://danieltsao0103.github.io/trip-planner-prototype/";
const out = resolve(process.argv[3] || "/tmp/feature-done-audit");
await mkdir(out, { recursive: true });
const c = createClient(a.url, a.key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const check = (r) => {
  if (r.error) throw Error(r.error.message);
  return r.data;
};
const signed = check(
  await c.auth.signInWithPassword({ email: a.email, password: a.password }),
);
const originalName = signed.user.user_metadata.name;
const originalPhoto = check(
  await c
    .from("user")
    .select("profile_picture_path")
    .eq("userID", a.userId)
    .single(),
);
assert.equal(
  originalPhoto.profile_picture_path,
  null,
  "Use a QA account without an existing uploaded picture",
);
const id = randomUUID(),
  eventId = randomUUID();
const trip = {
  id,
  title: "Definition of done QA",
  destinations: ["Paris, France"],
  start: "2027-06-01",
  end: "2027-06-03",
  zone: "Europe/Paris",
  image: "",
  members: [
    {
      id: a.userId,
      name: originalName,
      email: a.email,
      role: "Owner",
      days: [],
      status: "accepted",
    },
  ],
  events: [
    {
      id: eventId,
      name: "Tower visit",
      place: "Eiffel Tower, Paris, France",
      point: { lat: 48.8584, lng: 2.2945 },
      date: "2027-06-01",
      start: "10:00",
      end: "11:00",
      cost: 0,
      attendees: [a.userId],
      notes: "Audit only",
      image: "",
    },
  ],
  prefs: {},
  expenses: [],
  budget: null,
  budgetMode: "group",
  individual: {},
  todos: [],
  dismissed: [],
};
const sprint = process.env.AUDIT_SPRINT === "1";
const roleDialog = process.env.AUDIT_ROLE_DIALOG === "1";
const photosBudget = process.env.AUDIT_PHOTOS_BUDGET === "1";
if (sprint) {
  trip.title = "Sprint seven-feature QA";
  trip.members.push(
    ...Array.from({ length: 19 }, (_, i) => ({
      id: randomUUID(),
      name: `QA Traveler ${i + 2}`,
      email: `sprint-${i + 2}@example.invalid`,
      role: "Viewer",
      days: [],
      status: "accepted",
    })),
  );
  trip.prefs = Object.fromEntries(
    trip.members.map((m, i) => [
      m.id,
      {
        diet: i % 3 === 0 ? ["Vegetarian"] : ["No restrictions"],
        food: ["Local favorites", "Familiar favorites", "A little of both"][
          i % 3
        ],
        spending: ["Budget-conscious", "Moderate", "Room to splurge"][i % 3],
        dining: "A mix of both",
        atmosphere: i % 2 ? "Quiet" : "Lively",
        access: i % 2 ? ["Step-free access"] : [],
        walk: 500 + i * 50,
        interests: i % 2 ? ["Art", "History"] : ["Nature"],
        destinations: "Paris museums",
        tickets: "Happy to book ahead",
        notes: i % 2 ? "Slow mornings" : "Flexible timing",
      },
    ]),
  );
  trip.events.push({
    ...trip.events[0],
    id: randomUUID(),
    name: "Louvre visit",
    place: "Louvre Museum, Paris, France",
    point: { lat: 48.8606, lng: 2.3376 },
    date: "2027-06-02",
  });
}
if (roleDialog) {
  trip.title = "Role dialog QA";
  trip.members.push({
    id: randomUUID(),
    name: "Role QA Traveler",
    email: "role-qa@example.invalid",
    role: "Viewer",
    days: [],
    status: "accepted",
  });
}
const priorTrips = check(await c.rpc("load_trip_bundles"));
let passwordChanged = false;
const nextPassword = randomUUID() + "aA1!";
const evidence = {
  site,
  version: await (
    await fetch(new URL("version.json", site), { cache: "no-store" })
  ).json(),
  checkedAt: new Date().toISOString(),
  lighthouse: [],
  checks: [],
  cleanup: false,
};
const record = (x) => {
  evidence.checks.push(x);
  console.log(x);
};
let browser;
try {
  const fixtureRequest = {
    p_trip_id: id,
    p_expected_revision: null,
    p_request_id: randomUUID(),
    p_data: trip,
  };
  const destinationTimezones = trip.destinations.map(() => trip.zone);
  let fixture = await c.rpc("save_trip_bundle_with_timezones", {
    ...fixtureRequest,
    p_destination_timezones: destinationTimezones,
    p_data: { ...trip, destinationTimezones },
  });
  if (fixture.error?.code === "PGRST202")
    fixture = await c.rpc("save_trip_bundle", fixtureRequest);
  check(fixture);
  if (sprint) {
    const row = check(await c.rpc("read_invited_trip", { p_trip: id }));
    assert.equal(row.content.members.length, 20);
    assert.equal(Object.keys(row.content.prefs).length, 20);
    assert.deepEqual(
      row.content.events.map((e) => ({ date: e.date, point: e.point })),
      trip.events.map((e) => ({ date: e.date, point: e.point })),
    );
    const anonymous = createClient(a.url, a.key, {
      auth: { persistSession: false },
    });
    assert.ok((await anonymous.rpc("read_invited_trip", { p_trip: id })).error);
    const invalid = structuredClone(trip);
    invalid.events[0].point.lat = 91;
    assert.ok(
      (
        await c.rpc("save_trip_bundle", {
          p_trip_id: id,
          p_expected_revision: row.revision,
          p_request_id: randomUUID(),
          p_data: invalid,
        })
      ).error,
    );
    const unchanged = check(await c.rpc("read_invited_trip", { p_trip: id }));
    assert.equal(unchanged.revision, row.revision);
    assert.deepEqual(unchanged.content.events, row.content.events);
    record(
      "Live 20-person preferences and two dated map points round-trip; anonymous access denied; invalid coordinate write rolled back without changing revision or events",
    );
  }
  for (const device of ["desktop", "mobile"]) {
    browser = await puppeteer.launch({
      executablePath: chromium.executablePath(),
      headless: true,
    });
    const pptr = (await browser.pages())[0];
    const view =
      device === "desktop"
        ? { width: 1365, height: 900 }
        : { width: 390, height: 844 };
    await pptr.setViewport({
      ...view,
      isMobile: device === "mobile",
      hasTouch: device === "mobile",
    });
    const pw = await chromium.connectOverCDP(browser.wsEndpoint());
    const page = pw.contexts()[0].pages()[0];
    await page.setViewportSize(view);
    page.on("response", async (response) => {
      if (response.status() >= 400 && response.url().includes("/rest/v1/")) {
        const body = await response.json().catch(() => ({}));
        (evidence.networkErrors ??= []).push({
          path: new URL(response.url()).pathname,
          status: response.status(),
          code: body.code,
          message: body.message,
        });
      }
    });
    const button = (n) => page.getByRole("button", { name: n, exact: true });
    const field = (n) => page.getByLabel(n, { exact: true });
    async function audit(name) {
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(500);
      const metrics = await pptr.createCDPSession();
      await metrics.send("Emulation.setDeviceMetricsOverride", {
        ...view,
        deviceScaleFactor: 1,
        mobile: device === "mobile",
      });
      assert.equal(
        await page.evaluate(() => document.documentElement.clientWidth),
        view.width,
      );
      const config = {
        extends: "lighthouse:default",
        settings: {
          onlyCategories: ["accessibility"],
          formFactor: device,
          screenEmulation: {
            disabled: false,
            ...view,
            deviceScaleFactor: 1,
            mobile: device === "mobile",
          },
          disableStorageReset: true,
        },
      };
      const result = process.env.AUDIT_CAPTURE_ONLY
        ? {
            lhr: { categories: { accessibility: { score: null } }, audits: {} },
            report: "",
          }
        : await snapshot(pptr, {
            config,
            flags: { logLevel: "error", output: "html" },
          });
      const score =
        result.lhr.categories.accessibility.score === null
          ? null
          : Math.round(result.lhr.categories.accessibility.score * 100);
      await metrics.send("Emulation.setDeviceMetricsOverride", {
        ...view,
        deviceScaleFactor: 1,
        mobile: device === "mobile",
      });
      const responsive = await page.evaluate(
        (requested) => ({
          viewport: document.documentElement.clientWidth,
          innerWidth,
          requested,
          content: document.documentElement.scrollWidth,
          pass: document.documentElement.scrollWidth <= requested + 1,
        }),
        view.width,
      );
      assert.equal(responsive.viewport, view.width);
      const failures = Object.values(result.lhr.audits)
        .filter((x) => x.score !== null && x.score < 1)
        .map((x) => ({ id: x.id, title: x.title, items: x.details?.items }));
      evidence.lighthouse.push({ device, name, score, responsive, failures });
      await writeFile(resolve(out, `${device}-${name}.html`), result.report);
      await page.waitForTimeout(500);
      const screenshot = await page.screenshot({
        path: resolve(out, `${device}-${name}.png`),
        fullPage: !(await page.getByRole("dialog").count()),
      });
      evidence.lighthouse.at(-1).screenshotWidth = screenshot.readUInt32BE(16);
      if (sprint && name === "group-20-travelers")
        await page.locator(".preference-grid").screenshot({
          path: resolve(out, `${device}-group-preference-charts.png`),
        });
      await metrics.detach();
      await writeFile(
        resolve(out, "summary.json"),
        JSON.stringify(evidence, null, 2),
      );
      console.log(
        `${device} ${name}: Accessibility ${score}, responsive ${responsive.pass}`,
      );
    }
    await page.goto(site);
    await field("Email").waitFor();
    await audit("login");
    await button("New here? Create an account").click();
    await audit("signup");
    await button("Already have an account? Log in").click();
    await field("Email").fill(a.email);
    await field("Password").fill(a.password);
    await button("Log in").click();
    await button("Account and preferences").waitFor();
    if (roleDialog) {
      await page.goto(site + "#/5");
      await page.getByRole("button", { name: trip.title, exact: true }).click();
      await page.goto(site + "#/13");
      await button("Change permissions for Role QA Traveler").click();
      await field("Role").selectOption("Day Editor");
      await page.getByRole("checkbox", { name: /Day 2/ }).check();
      await audit("day-editor-permissions-dialog");
      await button("Save permissions").click();
      await expect
        .poll(
          async () =>
            check(
              await c.rpc("read_invited_trip", { p_trip: id }),
            ).content.members.find((m) => m.name === "Role QA Traveler").role,
        )
        .toBe("Day Editor");
      await page.reload();
      await button("Change permissions for Role QA Traveler").click();
      await expect(field("Role")).toHaveValue("Day Editor");
      await expect(page.getByRole("checkbox", { name: /Day 2/ })).toBeChecked();
      record(
        `${device}: owner role/day dialog saved and reloaded through live database`,
      );
      await browser.close();
      browser = null;
      continue;
    }
    if (photosBudget) {
      await page.goto(site + "#/5");
      await page.getByText(trip.title, { exact: true }).first().waitFor();
      await button("Open itinerary").click();
      await page.goto(site + `#/7?event=${eventId}`);
      await field("Event name").waitFor();
      await audit("event-photo-editor");
      if (device === "desktop") {
        await button("Find with Unsplash").click();
        await expect(button("Find with Unsplash")).toBeEnabled({
          timeout: 25000,
        });
        const options = page.locator(
          ".event-photo-picker .trip-photo-options button",
        );
        if (await options.count()) {
          await options.first().click();
          await audit("event-photo-unsplash-selected");
          await button("Save changes").click();
          await expect
            .poll(
              async () =>
                check(await c.rpc("read_invited_trip", { p_trip: id })).content
                  .events[0].image,
            )
            .toMatch(/^https:\/\/images\.unsplash\.com\//);
          record(
            "Live Unsplash search, pointer selection and saved event image URL passed",
          );
          await page.goto(site + `#/7?event=${eventId}`);
          await field("Event name").waitFor();
        } else
          record(
            "Unsplash search returned no selectable results; custom-upload path checked separately",
          );
      }
      const image = await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 96;
        canvas.height = 64;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#24745c";
        ctx.fillRect(0, 0, 96, 64);
        return canvas.toDataURL("image/png").split(",")[1];
      });
      await field("Upload your own event photo").setInputFiles({
        name: `qa-${device}.png`,
        mimeType: "image/png",
        buffer: Buffer.from(image, "base64"),
      });
      await expect(
        page.getByRole("img", {
          name: "Your event photo preview",
          exact: true,
        }),
      ).toBeVisible();
      const uploadedUrl = await page
        .getByRole("img", { name: "Your event photo preview", exact: true })
        .getAttribute("src");
      await audit("event-photo-upload-preview");
      await button("Save changes").click();
      await expect
        .poll(
          async () =>
            check(await c.rpc("read_invited_trip", { p_trip: id })).content
              .events[0].image,
        )
        .toBe(uploadedUrl);
      let row = check(await c.rpc("read_invited_trip", { p_trip: id }));
      const imageUrl = row.content.events[0].image;
      assert.equal(
        check(
          await c
            .from("event")
            .select("image_url")
            .eq("eventID", eventId)
            .single(),
        ).image_url,
        imageUrl,
      );
      assert.equal((await fetch(imageUrl)).status, 200);
      await page.goto(site + "#/11?date=2027-06-01");
      await page.reload();
      await expect(
        page
          .getByRole("article", { name: "Tower visit", exact: true })
          .locator("img"),
      ).toHaveAttribute("src", imageUrl);
      await audit("itinerary-saved-photo");
      record(
        `${device}: custom itinerary photo UI upload/save, event.image_url readback, public Storage fetch and itinerary reload passed`,
      );
      await page.goto(site + "#/12");
      await page
        .getByRole("button", { name: /^(Set budget|Budget settings)$/ })
        .first()
        .click();
      await field("How should we track spending?").selectOption("group");
      await field("Group budget (USD)").fill("1000.01");
      await audit("group-budget-dialog");
      await button("Save budget").click();
      await expect
        .poll(async () =>
          check(
            await c
              .from("trip")
              .select("budget_cents,budget_mode")
              .eq("tripID", id)
              .single(),
          ),
        )
        .toMatchObject({ budget_cents: 100001, budget_mode: "group" });
      await button("Budget settings").click();
      await field("How should we track spending?").selectOption("individual");
      await field("Your individual budget (USD)").fill("600.02");
      await audit("individual-budget-dialog");
      await button("Save budget").click();
      await expect
        .poll(
          async () =>
            check(
              await c
                .from("trip_person_budget")
                .select("amount_cents")
                .eq("trip_id", id)
                .eq("participant_id", a.userId)
                .maybeSingle(),
            )?.amount_cents,
        )
        .toBe(60002);
      await button("Add expense").click();
      await field("What was it for?").fill(`Audit lunch ${device}`);
      await field("Amount (USD)").fill("12.34");
      await audit("expense-dialog");
      await button("Save expense").click();
      await expect
        .poll(
          async () =>
            check(
              await c.rpc("read_invited_trip", { p_trip: id }),
            ).content.expenses.find(
              (e) => e.purpose === `Audit lunch ${device}`,
            )?.amount,
        )
        .toBe(1234);
      await page.reload();
      await expect(
        page
          .locator(".expense-row")
          .filter({ hasText: `Audit lunch ${device}` }),
      ).toBeVisible();
      await audit("budget-saved");
      row = check(await c.rpc("read_invited_trip", { p_trip: id }));
      assert.equal(row.content.budget, 100001);
      assert.equal(row.content.individual[a.userId], 60002);
      assert.equal(row.content.budgetMode, "individual");
      const invalid = structuredClone(trip);
      Object.assign(invalid, row.content);
      invalid.budget = -1;
      assert.ok(
        (
          await c.rpc("save_trip_bundle", {
            p_trip_id: id,
            p_expected_revision: row.revision,
            p_request_id: randomUUID(),
            p_data: invalid,
          })
        ).error,
      );
      const after = check(await c.rpc("read_invited_trip", { p_trip: id }));
      assert.equal(after.revision, row.revision);
      assert.deepEqual(after.content, row.content);
      record(
        `${device}: group and individual budgets and expense cents saved/read back/reloaded; invalid negative budget rejected with unchanged revision/content`,
      );
      await browser.close();
      browser = null;
      continue;
    }
    await page.goto(site + "#/19");
    await field("Name").waitFor();
    await audit("account");
    if (device === "desktop" && !process.env.AUDIT_READONLY) {
      await field("Name").fill("Definition Done QA");
      await button("Save name").click();
      await expect(
        page.getByText("Name saved.", { exact: true }),
      ).toBeVisible();
      assert.equal(
        check(await c.auth.getUser()).user.user_metadata.name,
        "Definition Done QA",
      );
      await page.reload();
      await expect(field("Name")).toHaveValue("Definition Done QA");
      record("Account name: UI save, independent Auth read and reload passed");
      if (sprint) {
        await field("Current password").fill(a.password);
        await field("New password").fill(nextPassword);
        await field("Confirm new password").fill(nextPassword);
        await button("Update password").click();
        await expect(
          page.getByText("Password updated.", { exact: true }),
        ).toBeVisible();
        passwordChanged = true;
        const fresh = createClient(a.url, a.key, {
          auth: { persistSession: false },
        });
        check(
          await fresh.auth.signInWithPassword({
            email: a.email,
            password: nextPassword,
          }),
        );
        check(await fresh.auth.updateUser({ password: a.password }));
        passwordChanged = false;
        check(await fresh.auth.signOut());
        const restored = createClient(a.url, a.key, {
          auth: { persistSession: false },
        });
        check(
          await restored.auth.signInWithPassword({
            email: a.email,
            password: a.password,
          }),
        );
        check(await restored.auth.signOut());
        record(
          "Live account password changed through UI; fresh sign-in verified; original password restored and reverified",
        );
      }
      const image = await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 32;
        canvas.getContext("2d").fillRect(0, 0, 32, 32);
        return canvas.toDataURL("image/png").split(",")[1];
      });
      await page
        .locator('input[type=file][aria-label="Choose a profile picture"]')
        .setInputFiles({
          name: "qa.png",
          mimeType: "image/png",
          buffer: Buffer.from(image, "base64"),
        });
      await button("Remove").waitFor();
      const row = check(
        await c
          .from("user")
          .select("profile_picture_path")
          .eq("userID", a.userId)
          .single(),
      );
      assert.ok(row.profile_picture_path?.startsWith(a.userId + "/"));
      check(
        await c.storage
          .from("profile-pictures")
          .download(row.profile_picture_path),
      );
      await page.reload();
      await button("Remove").waitFor();
      await button("Remove").click();
      await button("Upload photo").waitFor();
      assert.equal(
        check(
          await c
            .from("user")
            .select("profile_picture_path")
            .eq("userID", a.userId)
            .single(),
        ).profile_picture_path,
        null,
      );
      record(
        "Profile picture: UI upload, Storage read, reload and removal passed",
      );
    }
    await page.goto(site + "#/5");
    await page.getByText(trip.title, { exact: true }).first().waitFor();
    await page
      .getByRole("button", { name: "Open itinerary", exact: true })
      .click();
    await page.goto(site + "#/13");
    await button("Invite someone").waitFor();
    if (sprint)
      await expect(
        page.getByText("20 of 20 travelers responded", { exact: true }),
      ).toBeVisible();
    await audit(sprint ? "group-20-travelers" : "group");
    await button("Invite someone").click();
    await page.getByRole("dialog").waitFor();
    await audit("invite-dialog");
    await button("Close dialog").click();
    await page.goto(site + "#/15");
    await audit("preferences");
    await page.goto(site + "#/17");
    await page.waitForTimeout(2500);
    await audit("map");
    await page.goto(site + "#/7");
    await audit("event-editor");
    for (const [route, name] of sprint
      ? [
          ["11?date=2027-06-01", "day-one"],
          ["11?date=2027-06-02", "day-two"],
        ]
      : [
          ["4", "home"],
          ["5", "trips"],
          ["6", "trip-form"],
          ["8", "itinerary"],
          ["8?view=calendar", "calendar"],
          ["9", "suggestions"],
          ["10", "today"],
          ["11?date=2027-06-01", "day-detail"],
          ["12", "budget"],
          ["18", "style"],
        ]) {
      await page.goto(site + "#/" + route);
      await audit(name);
      if (sprint && name.startsWith("day-")) {
        const expected = name === "day-one" ? "Tower visit" : "Louvre visit",
          other = name === "day-one" ? "Louvre visit" : "Tower visit";
        await expect(
          page.getByRole("article", { name: expected, exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("article", { name: other, exact: true }),
        ).toHaveCount(0);
        await page
          .getByRole("article", { name: expected, exact: true })
          .getByRole("button", {
            name: trip.events.find((e) => e.name === expected).place,
            exact: true,
          })
          .click();
        await expect(page).toHaveURL(/#\/17\?event=/);
        await page
          .getByRole("link", { name: "View itinerary item", exact: true })
          .click();
        await expect(
          page.getByRole("article", { name: expected, exact: true }),
        ).toBeFocused();
        record(
          `${device} ${name}: exact day's event and map-to-itinerary return confirmed`,
        );
      }
    }
    await browser.close();
    browser = null;
  }
} catch (failure) {
  if (browser) {
    const last = (await browser.pages())[0];
    await last.screenshot({
      path: resolve(out, "failure.png"),
      fullPage: true,
    });
    await writeFile(
      resolve(out, "failure.txt"),
      await last.evaluate(() => document.body.innerText),
    );
  }
  throw failure;
} finally {
  if (browser) await browser.close();
  if (passwordChanged) check(await c.auth.updateUser({ password: a.password }));
  check(await c.rpc("set_account_name", { p_name: originalName }));
  const photo = check(
    await c
      .from("user")
      .select("profile_picture_path")
      .eq("userID", a.userId)
      .single(),
  );
  if (photo.profile_picture_path) {
    check(await c.rpc("set_profile_picture", { p_path: null }));
    check(
      await c.storage
        .from("profile-pictures")
        .remove([photo.profile_picture_path]),
    );
  }
  if (photosBudget) {
    const folder = `${a.userId}/${id}`;
    const files = check(await c.storage.from("trip-photos").list(folder));
    if (files.length)
      check(
        await c.storage
          .from("trip-photos")
          .remove(files.map((f) => `${folder}/${f.name}`)),
      );
    assert.equal(
      check(await c.storage.from("trip-photos").list(folder)).length,
      0,
    );
  }
  check(
    await c.from("trip").delete().eq("tripID", id).eq("owner_id", a.userId),
  );
  const afterTrips = check(await c.rpc("load_trip_bundles"));
  const stable = (rows) =>
    JSON.stringify([...rows].sort((x, y) => x.tripID.localeCompare(y.tripID)));
  assert.equal(
    stable(afterTrips),
    stable(priorTrips),
    "Pre-existing QA-visible trip bundles must remain unchanged",
  );
  record(
    "Cleanup: original account state restored; generated trip removed; pre-existing QA-visible trips unchanged",
  );
  check(await c.auth.signOut());
  evidence.cleanup = true;
  await writeFile(
    resolve(out, "summary.json"),
    JSON.stringify(evidence, null, 2),
  );
}
