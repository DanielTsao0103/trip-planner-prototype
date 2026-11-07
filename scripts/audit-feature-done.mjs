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
  check(
    await c.rpc("save_trip_bundle", {
      p_trip_id: id,
      p_expected_revision: null,
      p_request_id: randomUUID(),
      p_data: trip,
    }),
  );
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
      assert.equal(await page.evaluate(() => innerWidth), view.width);
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
      const responsive = await page.evaluate(() => ({
        viewport: innerWidth,
        content: document.documentElement.scrollWidth,
        pass: document.documentElement.scrollWidth <= innerWidth + 1,
      }));
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
      assert.equal(
        screenshot.readUInt32BE(16),
        view.width,
        "Screenshot width must match the audited viewport",
      );
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
    await audit("group");
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
    for (const [route, name] of [
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
    }
    await browser.close();
    browser = null;
  }
} finally {
  if (browser) await browser.close();
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
  check(
    await c.from("trip").delete().eq("tripID", id).eq("owner_id", a.userId),
  );
  check(await c.auth.signOut());
  evidence.cleanup = true;
  await writeFile(
    resolve(out, "summary.json"),
    JSON.stringify(evidence, null, 2),
  );
}
