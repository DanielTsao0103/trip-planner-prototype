import { test, expect, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import axe from "axe-core";

const user = { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated", email: "review@example.test", app_metadata: { provider: "email" }, user_metadata: { name: "Returning Traveler" }, created_at: "2026-01-01T00:00:00Z" };
const draft = { id: "33333333-3333-4333-8333-333333333333", title: "Recovery weekend", destinations: ["Seattle"], start: "2027-05-01", end: "2027-05-04", zone: "America/Los_Angeles", destinationTimezones: ["America/Los_Angeles"], image: "", members: [{ id: user.id, name: "Returning Traveler", email: user.email, role: "Owner", status: "accepted", days: [] }], events: [], expenses: [], prefs: {}, budget: null, budgetMode: "group", individual: {}, todos: [], dismissed: [] };

/** All account traffic is mocked: this suite never writes to a real account. */
async function setup(page: Page) {
  // Recovery assertions must not race a real geocoder enriching the saved event.
  await page.route("https://places.googleapis.com/**", route => route.abort());
  await page.route("https://maps.googleapis.com/**", route => route.abort());
  await page.route("https://photon.komoot.io/**", route => route.abort());
  let saveFails = true;
  let savedDraft = structuredClone(draft);
  await page.route("https://*.supabase.co/**", async route => {
    const request = route.request(), endpoint = new URL(request.url()).pathname;
    if (endpoint.endsWith("/token")) {
      if (request.postDataJSON()?.password === "wrong-password") return route.fulfill({ status: 400, json: { code: "invalid_credentials", error_code: "invalid_credentials", message: "Invalid login credentials" } });
      return route.fulfill({ json: { user, access_token: "qa-token", refresh_token: "qa-refresh", expires_in: 3600, token_type: "bearer" } });
    }
    if (endpoint === "/auth/v1/user") return route.fulfill({ json: user });
    const tripRow = () => ({ tripID: savedDraft.id, owner_id: user.id, created_by: user.id, trip_name: savedDraft.title, destinations: savedDraft.destinations, start_date: savedDraft.start, end_date: savedDraft.end, timezone: savedDraft.zone, revision: 1, content_version: 1, content: savedDraft });
    if (endpoint.endsWith("/load_trip_bundles")) return route.fulfill({ json: [tripRow()] });
    if (endpoint.endsWith("/save_account_trip")) {
      if (saveFails) return route.fulfill({ status: 503, json: { message: "Unavailable" } });
      savedDraft = request.postDataJSON().p_data;
      return route.fulfill({ json: tripRow() });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("./");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.getByLabel("Password", { exact: true }).fill("qa-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Account and preferences", exact: true })).toBeVisible();
  return { allowSave: () => { saveFails = false; } };
}

test("reloaded unsaved itinerary keeps the focused event below its sticky recovery notice", async ({page}) => {
  await page.setViewportSize({width:390,height:600});
  const account = await setup(page);
  await page.goto('./#/5');
  await page.getByRole('button',{name:'Open itinerary',exact:true}).click();
  await page.goto('./#/7');
  await page.getByLabel('Event name',{exact:true}).fill('Keep my visible plan');
  await page.getByLabel('Where',{exact:true}).fill('Museum');
  await page.getByRole('button',{name:'Add to itinerary',exact:true}).click();
  const banner=page.locator('.trip-recovery-banner');
  await expect(banner).toContainText('Not saved:');
  await page.reload();
  await expect(banner).toContainText('Not saved:');
  const event=page.getByRole('button',{name:/Keep my visible plan/}).first();
  await expect(event).toBeFocused();
  const clearance=async()=>{const a=await banner.boundingBox(),b=await event.boundingBox();return b!.y-a!.y-a!.height;};
  await expect.poll(clearance).toBeGreaterThanOrEqual(10);
  await banner.locator('summary').click();
  await expect.poll(clearance).toBeGreaterThanOrEqual(10);
  await page.setViewportSize({width:320,height:600});
  await event.focus();
  await event.evaluate(e=>e.scrollIntoView({block:'start'}));
  await expect.poll(clearance).toBeGreaterThanOrEqual(10);
  await page.screenshot({path:test.info().outputPath('focused-recovery-phone.png')});
  account.allowSave();
  await banner.getByRole('button',{name:'Retry save',exact:true}).click();
  await expect(banner).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>document.documentElement.style.getPropertyValue('--trip-recovery-height'))).toBe('');
  await page.reload();
  await expect(page.getByRole('button',{name:/Keep my visible plan/}).first()).toBeVisible();
});

test("desktop recovery leaves itinerary actions usable and canceled discard retains the draft", async ({ page }) => {
  await page.setViewportSize({width:1440,height:900});
  const account=await setup(page);
  await page.goto('./#/5');
  await page.getByRole('button',{name:'Open itinerary',exact:true}).click();
  await page.goto('./#/7');
  await page.getByLabel('Event name',{exact:true}).fill('Keep my desktop plan');
  await page.getByLabel('Where',{exact:true}).fill('Museum');
  await page.getByRole('button',{name:'Add to itinerary',exact:true}).click();
  const banner=page.locator('.trip-recovery-banner');
  await expect(banner).toContainText('Not saved:');
  await page.goto('./#/8?view=list');
  await banner.locator('summary').click();
  const lastAdd=page.getByRole('button',{name:'Add event to this day',exact:true}).last();
  for (const width of [1440,1024,768]) {
    await page.setViewportSize({width,height:900});
    await page.evaluate(()=>document.fonts.ready);
    await lastAdd.scrollIntoViewIfNeeded();
    await expect(lastAdd).toBeInViewport({ratio:1});
    await expect.poll(()=>lastAdd.evaluate(element=>{
      const r=element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
    })).toBe(true);
    const notice=await banner.boundingBox(), sidebar=await page.locator('.sidebar').boundingBox();
    expect(notice!.x).toBeGreaterThanOrEqual(sidebar!.x+sidebar!.width);
    await page.screenshot({path:test.info().outputPath(`recovery-workspace-${width}.png`)});
  }
  const discard=banner.getByRole('button',{name:'Discard edits and reload',exact:true});
  await discard.click();
  const confirmation=page.getByRole('dialog',{name:'Discard unsaved trip changes?',exact:true});
  await expect(confirmation).toContainText('Download your unsaved copy first');
  await page.keyboard.press('Escape');
  await expect(discard).toBeFocused();
  await expect(page.getByRole('button',{name:/Keep my desktop plan/}).first()).toBeVisible();
  await lastAdd.click();
  await expect(page.getByLabel('Event name',{exact:true})).toBeVisible();
  await expect(page).toHaveURL(/date=2027-05-04/);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await discard.click();
  await expect(confirmation).toBeVisible();
  account.allowSave();
  await page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await expect(confirmation).toHaveCount(0);
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button',{name:/Keep my desktop plan/}).first()).toBeVisible();
});

test("keyboard editing keeps fields between expanded recovery and fixed actions", async ({page}) => {
  await page.setViewportSize({width:1440,height:900});
  await setup(page);
  await page.goto('./#/5');
  await page.getByRole('button',{name:'Open itinerary',exact:true}).click();
  await page.goto('./#/7');
  await page.getByLabel('Event name',{exact:true}).fill('Retain my draft');
  await page.getByLabel('Where',{exact:true}).fill('Museum');
  await page.getByRole('button',{name:'Add to itinerary',exact:true}).click();
  const banner=page.locator('.trip-recovery-banner');
  await expect(banner).toContainText('Not saved:');
  await page.goto('./#/7');
  await banner.locator('summary').click();
  await page.getByLabel('Estimated cost (USD)',{exact:true}).focus();
  for(const width of [390,320]) {
    await page.setViewportSize({width,height:600});
    await page.getByLabel('Event name',{exact:true}).focus();
    for(const name of ['Event name','Prioritize locations near','Where','Day']) {
      const control=page.getByLabel(name,{exact:true});
      await expect(control).toBeFocused();
      await expect.poll(async()=>{
        const field=await control.boundingBox(), notice=await banner.boundingBox(), actions=await page.locator('[data-fixed-actions]').boundingBox();
        return field!.y >= notice!.y+notice!.height+8 && field!.y+field!.height <= actions!.y-8;
      }).toBe(true);
      await page.keyboard.press('Tab');
    }
    await page.screenshot({path:test.info().outputPath(`recovery-editing-${width}.png`)});
  }
  await page.setViewportSize({width:1440,height:900});
  const activeName=page.getByLabel('Event name',{exact:true});
  await activeName.focus();
  await page.setViewportSize({width:320,height:600});
  await expect(activeName).toBeFocused();
  await expect.poll(async()=>{
    const field=await activeName.boundingBox(), notice=await banner.boundingBox(), actions=await page.locator('[data-fixed-actions]').boundingBox();
    return field!.y >= notice!.y+notice!.height+8 && field!.y+field!.height <= actions!.y-8;
  }).toBe(true);
});

test("expanded account password fields retain values, labels and comfortable compact spacing", async ({ page }, info) => {
  await setup(page);
  await page.getByRole("button", { name: "Account and preferences", exact: true }).click();
  await page.locator(".account-password-disclosure > summary").click();
  const form = page.getByRole("form", { name: "Change password" });
  await form.getByLabel("Current password", { exact: true }).fill("wrong-password");
  await form.getByLabel("New password", { exact: true }).fill("new-good-password");
  await form.getByLabel("Confirm new password", { exact: true }).fill("new-good-password");
  await form.getByRole("button", { name: "Update password" }).click();
  await expect(form.getByRole("alert")).toContainText("incorrect");
  await expect(form.getByLabel("New password", { exact: true })).toHaveValue("new-good-password");
  const geometry = [];
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 600 : 900 });
    await form.scrollIntoViewIfNeeded();
    const metrics = await form.evaluate(el => ({ height: el.getBoundingClientRect().height, controls: [...el.querySelectorAll("input, button")].map(control => control.getBoundingClientRect().height), gaps: [...el.querySelectorAll(".field")].map(field => getComputedStyle(field).marginBottom) }));
    geometry.push({ width, ...metrics });
    expect(metrics.height).toBeLessThan(430);
    expect(metrics.controls.every(height => height >= 44)).toBe(true);
    expect(metrics.gaps.every(gap => gap === "0px")).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (info.project.name === "desktop" && [390, 1440].includes(width)) await page.screenshot({ path: test.info().outputPath(`account-password-error-${width}.png`) });
  }
  await page.setViewportSize({ width: 390, height: 600 });
  await page.emulateMedia({ colorScheme: "dark" });
  await form.evaluate(el => el.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(250); // Let theme color transitions settle before visual evidence.
  if (info.project.name === "desktop") {
    await page.screenshot({ path: test.info().outputPath("short-dark-password-form.png") });
    await writeFile(test.info().outputPath("password-form-geometry.json"), JSON.stringify(geometry, null, 2));
  }
  await form.getByRole("button", { name: "Show current password" }).click();
  await expect(form.getByLabel("Current password", { exact: true })).toHaveAttribute("type", "text");
  await page.locator(".account-password-disclosure > summary").click();
  await page.locator(".account-password-disclosure > summary").click();
  await expect(form.getByLabel("Current password", { exact: true })).toHaveValue("wrong-password");
});

test("compact failed-save banner keeps retry visible and discloses export and confirmed discard by keyboard", async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.goto("./#/5");
  await page.getByRole("button", { name: "Open itinerary", exact: true }).click();
  await page.goto("./#/7");
  await page.getByLabel("Event name", { exact: true }).fill("Keep my plan");
  await page.getByLabel("Where", { exact: true }).fill("Museum");
  await page.getByRole("button", { name: "Add to itinerary", exact: true }).click();
  const banner = page.locator(".trip-recovery-banner");
  await expect(banner).toContainText("Not saved:");
  await expect(banner).toHaveAttribute("role", "alert");
  await expect(banner.getByRole("button", { name: "Retry save", exact: true })).toBeVisible();
  await expect(banner.getByRole("button", { name: "Download unsaved copy", exact: true })).toBeHidden();
  const phoneHeight = (await banner.boundingBox())!.height;
  expect(phoneHeight).toBeLessThan(150);
  if (info.project.name === "desktop") await page.screenshot({ path: test.info().outputPath("phone-save-error.png") });
  const disclosure = banner.locator("summary");
  await disclosure.focus();
  // A deliberate keyboard pause must not let pending itinerary autofocus steal
  // this control and make Enter open the saved event instead of recovery options.
  await page.waitForTimeout(100);
  await expect(disclosure).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(banner.locator("details")).toHaveAttribute("open", "");
  await expect(banner.getByRole("button", { name: "Download unsaved copy", exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await banner.getByRole("button", { name: "Download unsaved copy", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("unsaved-trip-changes.json");
  if (info.project.name === "desktop") await page.screenshot({ path: test.info().outputPath("phone-recovery-options.png") });
  await banner.getByRole("button", { name: "Discard edits and reload", exact: true }).click();
  await page.getByRole("dialog", {name: "Discard unsaved trip changes?"}).getByRole("button", {name: "Keep changes", exact: true}).click();
  await expect(banner.getByRole("button", {name: "Discard edits and reload", exact: true})).toBeFocused();
  await expect(banner).toBeVisible();
  await disclosure.focus();
  await page.keyboard.press("Space");
  await expect(banner.locator("details")).not.toHaveAttribute("open");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 320, height: 600 });
  await page.waitForTimeout(250); // Capture the settled dark theme, not its transition.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await banner.boundingBox())!.height).toBeLessThan(170);
  if (info.project.name === "desktop") {
    await page.screenshot({ path: test.info().outputPath("phone-320-dark-save-error.png") });
    await writeFile(test.info().outputPath("recovery-banner-geometry.json"), JSON.stringify({ phone390: phoneHeight, phone320: (await banner.boundingBox())!.height }, null, 2));
    await disclosure.click();
    await page.addScriptTag({ content: axe.source });
    const contrast = await page.evaluate(async () => {
      const result = await (window as any).axe.run(".trip-recovery-banner", { runOnly: ["color-contrast"] });
      return { violations: result.violations, incomplete: result.incomplete, controls: [...document.querySelectorAll(".trip-recovery-banner button")].map(el => ({ text: el.textContent, color: getComputedStyle(el).color, background: getComputedStyle(el).backgroundColor })) };
    });
    await writeFile(test.info().outputPath("dark-recovery-contrast.json"), JSON.stringify(contrast, null, 2));
    expect(contrast.violations).toEqual([]);
    const hoverChecks = [];
    for (const button of await banner.getByRole("button").all()) {
      await button.hover();
      await page.waitForTimeout(250);
      const result = await button.evaluate(async (control) => {
        const checks = await (window as any).axe.run(".trip-recovery-banner", { runOnly: ["color-contrast"] });
        const direct = await (window as any).axe.run(control, {runOnly: ['color-contrast']});
        const banner = control.closest<HTMLElement>('.trip-recovery-banner')!;
        const text = banner.querySelector<HTMLElement>(':scope > span')!;
        const rgb = (value: string) => value.match(/[\d.]+/g)!.map(Number);
        const foreground = rgb(getComputedStyle(text).color);
        const background = rgb(getComputedStyle(banner).backgroundColor);
        const luminance = (values: number[]) => values.slice(0,3).map(v => {
          const channel=v/255; return channel<=0.04045 ? channel/12.92 : ((channel+0.055)/1.055)**2.4;
        }).reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0);
        const fg=luminance(foreground),bg=luminance(background);
        const range=document.createRange(); range.selectNodeContents(text);
        const unobscured=[...range.getClientRects()].every(rect =>
          [0.1,0.5,0.9].every(y=>[0.1,0.3,0.5,0.7,0.9].every(x=>
            document.elementFromPoint(rect.x+rect.width*x,rect.y+rect.height*y)===text)));
        // Axe can compare stacks behind an opaque sticky surface. Accept only
        // that exact diagnostic, backed by independent color/visibility checks.
        const knownIncomplete=checks.incomplete.length<=1 && checks.incomplete.every((issue: any)=>
          issue.id==='color-contrast' && issue.nodes.length===1 && issue.nodes.every((node: any)=>
            node.target.length===1 && document.querySelector(node.target[0])===text &&
            node.any.length===1 && node.any[0].data?.messageKey==='elmPartiallyObscuring'));
        return { violations: checks.violations, incomplete: checks.incomplete, knownIncomplete,
          direct:{violations:direct.violations,incomplete:direct.incomplete,passed:direct.passes.some((p:any)=>p.id==='color-contrast'&&p.nodes.length>0)},
          text:{contrast:(Math.max(fg,bg)+0.05)/(Math.min(fg,bg)+0.05),backgroundAlpha:background[3]??1,
            foregroundAlpha:foreground[3]??1,opacity:getComputedStyle(text).opacity,bannerOpacity:getComputedStyle(banner).opacity,unobscured} };
      });
      hoverChecks.push({ button: await button.textContent(), ...result });
      await writeFile(test.info().outputPath("dark-recovery-hover-contrast.json"), JSON.stringify(hoverChecks, null, 2));
      expect(result.violations).toEqual([]);
      expect(result.knownIncomplete).toBe(true);
      expect(result.direct.violations).toEqual([]);
      expect(result.direct.incomplete).toEqual([]);
      expect(result.direct.passed).toBe(true);
      expect(result.text.contrast).toBeGreaterThanOrEqual(4.5);
      expect(result.text.backgroundAlpha).toBe(1);
      expect(result.text.foregroundAlpha).toBe(1);
      expect(result.text.opacity).toBe('1');
      expect(result.text.bannerOpacity).toBe('1');
      expect(result.text.unobscured).toBe(true);
    }
    await writeFile(test.info().outputPath("dark-recovery-hover-contrast.json"), JSON.stringify(hoverChecks, null, 2));
    await disclosure.hover();
    await page.waitForTimeout(250);
    await page.screenshot({ path: test.info().outputPath("phone-320-dark-recovery-options.png") });
    await disclosure.click();
  }
  await banner.getByRole("button", { name: "Retry save", exact: true }).click();
  await expect(banner).toContainText("Not saved:");
});
