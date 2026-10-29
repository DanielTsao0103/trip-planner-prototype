/** Scoped Lighthouse and responsive evidence for real account-trip persistence.
 * Reuses the existing browser journey; only generated QA accounts are changed.
 * Install Lighthouse separately as documented in audit-field-limits.mjs.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { randomUUID } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { detailJourney, saved } from "./trip-detail-browser-flow.mjs";
const tools = resolve(
  process.env.QA_TOOLS_ROOT || "/tmp/trip-dod-tools",
  "node_modules",
);
const { default: lighthouse, snapshot } = await import(
  pathToFileURL(resolve(tools, "lighthouse/core/index.js"))
);
const { default: puppeteer } = await import(
  pathToFileURL(
    resolve(tools, "puppeteer-core/lib/puppeteer/puppeteer-core.js"),
  )
);
const site =
  process.argv[2] || "https://danieltsao0103.github.io/trip-planner-prototype/";
const output = resolve(process.argv[3] || "/tmp/trip-persistence-dod");
await mkdir(output, { recursive: true });
const env = {
  ...parseEnv(readFileSync(".env.local", "utf8")),
  ...parseEnv(readFileSync(".env.server.local", "utf8")),
  ...process.env,
};
const options = {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) =>
      fetch(input, { ...init, signal: AbortSignal.timeout(20000) }),
  },
};
const admin = createClient(
  env.VITE_SUPABASE_URL,
  env.SUPABASE_SECRET_KEY,
  options,
);
const check = (r) => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};
const version = await fetch(new URL("version.json", site), {
  cache: "no-store",
}).then((r) => r.json());
const evidence = {
  site,
  commit: version.commit,
  checkedAt: new Date().toISOString(),
  lighthouseVersion: "13.6.0",
  results: [],
  widthChecks: [],
  keyboard: [],
  cleanup: false,
};
const accounts = [];
try {
  for (const device of ["desktop", "mobile"]) {
    const email = `persistence-audit-${randomUUID()}@example.com`,
      password = `${randomUUID()}aA1!`;
    const { user } = check(
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name: "QA Traveler" },
      }),
    );
    accounts.push(user.id);
    const browser = await puppeteer.launch({
      executablePath: chromium.executablePath(),
      headless: true,
    });
    try {
      const pptr = (await browser.pages())[0];
      const viewport =
        device === "desktop"
          ? { width: 1365, height: 900 }
          : { width: 390, height: 844 };
      await pptr.setViewport({
        ...viewport,
        isMobile: device === "mobile",
        hasTouch: device === "mobile",
      });
      const pw = await chromium.connectOverCDP(browser.wsEndpoint());
      const page = pw.contexts()[0].pages()[0];
      await page.setViewportSize(viewport);
      const config = {
        extends: "lighthouse:default",
        settings: {
          onlyCategories: ["accessibility"],
          formFactor: device,
          screenEmulation: {
            disabled: false,
            ...viewport,
            deviceScaleFactor: 1,
            mobile: device === "mobile",
          },
          disableStorageReset: true,
        },
      };
      const button = (name) => page.getByRole("button", { name, exact: true });
      const field = (name) => page.getByLabel(name, { exact: true });
      const goto = async (route) => {
        await page.goto(`${site}#/${route}`);
        await saved(page);
      };
      async function audit(name, navigation = false) {
        await page.waitForLoadState("networkidle");
        const session = await pptr.createCDPSession();
        await session.send("Emulation.setDeviceMetricsOverride", {
          ...viewport,
          deviceScaleFactor: 1,
          mobile: device === "mobile",
        });
        await page.evaluate(() => document.fonts.ready);
        const result = navigation
          ? await lighthouse(
              site,
              { logLevel: "error", output: "html" },
              config,
              pptr,
            )
          : await snapshot(pptr, {
              config,
              flags: { logLevel: "error", output: "html" },
            });
        const { lhr } = result;
        const score = Math.round(lhr.categories.accessibility.score * 100);
        const failures = Object.values(lhr.audits)
          .filter((a) => a.score !== null && a.score < 1)
          .map((a) => ({ id: a.id, title: a.title, items: a.details?.items }));
        await session.send("Emulation.setDeviceMetricsOverride", {
          ...viewport,
          deviceScaleFactor: 1,
          mobile: device === "mobile",
        });
        const responsive = await page.evaluate(() => ({
          viewport: innerWidth,
          content: document.documentElement.scrollWidth,
          passes: document.documentElement.scrollWidth <= innerWidth + 1,
        }));
        assert.equal(responsive.viewport, viewport.width);
        const stem = `${device}-${name}`;
        await writeFile(resolve(output, `${stem}.html`), result.report);
        await writeFile(
          resolve(output, `${stem}.json`),
          JSON.stringify(lhr, null, 2),
        );
        await page.screenshot({
          path: resolve(output, `${stem}.png`),
          fullPage: !(await page.getByRole("dialog").count()),
        });
        evidence.results.push({
          device,
          name,
          mode: navigation ? "navigation" : "snapshot",
          score,
          responsive,
          failures,
        });
        await writeFile(
          resolve(output, "summary.json"),
          JSON.stringify(evidence, null, 2),
        );
        await session.detach();
        console.log(
          `${device} ${name}: Lighthouse Accessibility ${score}; responsive ${responsive.passes ? "pass" : "FAIL"}`,
        );
      }
      await page.goto(site);
      await button("Log in").waitFor();
      await audit("login", true);
      await field("Email").fill(email);
      await field("Password").fill(password);
      await button("Log in").click();
      await saved(page);
      await goto("5");
      await audit("empty-trips");
      await detailJourney(page, site);
      const rows = check(
        await admin.from("trip").select("tripID").eq("owner_id", user.id),
      );
      assert.equal(rows.length, 1);
      const events = check(
        await admin
          .from("event")
          .select("eventID")
          .eq("tripID", rows[0].tripID),
      );
      assert.equal(events.length, 1);
      await goto("5");
      await audit("saved-trips");
      await goto("6");
      await audit("create-trip");
      await goto("6?edit=true");
      await audit("edit-trip");
      await goto("8");
      await audit("itinerary");
      await goto("11");
      await audit("day-detail");
      await goto(`7?event=${events[0].eventID}`);
      await audit("event-editor");
      await goto("15");
      await audit("preferences-food");
      await button("Next").click();
      await audit("preferences-access");
      await button("Next").click();
      await audit("preferences-notes");
      await goto("13");
      await audit("group");
      await button("Invite someone").click();
      await audit("traveler-dialog");
      await field("Traveler name").fill("Guest Traveler");
      await field("Traveler email").fill("guest@example.com");
      await button("Save traveler").click();
      await saved(page);
      await button("Manage traveler").click();
      await audit("traveler-status");
      await button("Add as guest traveler").click();
      await saved(page);
      await button("Change permissions for Guest Traveler").click();
      await field("Role").selectOption("Day Editor");
      await audit("permissions-dialog");
      await button("Close dialog").click();
      await goto("10");
      await audit("reminders");
      await goto("12");
      await audit("budget");
      const trigger = button("Budget settings");
      await trigger.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("dialog")).toBeVisible();
      await audit("budget-dialog");
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
      evidence.keyboard.push({
        device,
        openWithEnter: true,
        closeWithEscape: true,
        focusRestored: true,
      });
      await button("Add expense").click();
      await audit("expense-dialog");
      await button("Close dialog").click();
      await button("Reimbursements").click();
      await audit("repayments");
      // Exercise persistent error/recovery UI without changing any other user's data.
      await page.route("**/rest/v1/rpc/save_trip_bundle", (r) =>
        r.abort("failed"),
      );
      await button("Budget settings").click();
      await field("Your individual budget (USD)").fill("601.02");
      await button("Save budget").click();
      await expect(page.getByRole("alert")).toContainText("Not saved:");
      await audit("save-recovery");
      await page.unroute("**/rest/v1/rpc/save_trip_bundle");
      await button("Retry save").click();
      await saved(page);
      if (device === "desktop") {
        for (const width of [320, 390, 768, 1365]) {
          await page.setViewportSize({ width, height: 900 });
          for (const route of [
            "5",
            "6?edit=true",
            "8",
            `7?event=${events[0].eventID}`,
            "10",
            "12",
            "13",
            "15",
          ]) {
            await goto(route);
            const state = await page.evaluate(() => ({
              width: innerWidth,
              content: document.documentElement.scrollWidth,
            }));
            evidence.widthChecks.push({
              route,
              width,
              actualWidth: state.width,
              passes: state.width === width && state.content <= width + 1,
            });
          }
        }
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  const failures = [];
  for (const id of accounts) {
    for (const action of [
      () => admin.from("trip").delete().eq("owner_id", id),
      () => admin.from("user").delete().eq("userID", id),
      () => admin.auth.admin.deleteUser(id),
    ]) {
      try {
        check(await action());
      } catch (e) {
        failures.push(e.message);
      }
    }
  }
  evidence.cleanup = failures.length === 0;
  evidence.completedAt = new Date().toISOString();
  await writeFile(
    resolve(output, "summary.json"),
    JSON.stringify(evidence, null, 2),
  );
  if (failures.length)
    throw new Error(`QA cleanup failed: ${failures.join("; ")}`);
  console.log("Temporary audit accounts and their trip records removed.");
}
const latest = await fetch(new URL("version.json", site), {
  cache: "no-store",
}).then((r) => r.json());
evidence.finalCommit = latest.commit;
await writeFile(
  resolve(output, "summary.json"),
  JSON.stringify(evidence, null, 2),
);
assert.equal(
  latest.commit,
  version.commit,
  "Live revision changed during audit",
);
assert.ok(
  evidence.results.every((r) => r.score >= 90 && r.responsive.passes),
  "Lighthouse or layout threshold failed",
);
assert.ok(
  evidence.widthChecks.every((r) => r.passes),
  "Responsive width check failed",
);
