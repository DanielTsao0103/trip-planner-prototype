/** Lighthouse + responsive evidence for the field-limit task; only uses the local demo.
 * Install audit tools separately: npm install --prefix /tmp/trip-dod-tools --no-save --ignore-scripts lighthouse@13.6.0
 * Run: node scripts/audit-field-limits.mjs [site URL] [output directory]
 * Optional QA_TOOLS_ROOT overrides /tmp/trip-dod-tools. Requires Node >=22.19.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
const tools = resolve(process.env.QA_TOOLS_ROOT || '/tmp/trip-dod-tools', 'node_modules');
const { default: lighthouse, snapshot } = await import(pathToFileURL(resolve(tools, 'lighthouse/core/index.js')));
const { default: puppeteer } = await import(pathToFileURL(resolve(tools, 'puppeteer-core/lib/puppeteer/puppeteer-core.js')));
const site = process.argv[2] || 'https://danieltsao0103.github.io/trip-planner-prototype/';
const output = resolve(process.argv[3] || '/tmp/trip-field-limits-dod');
await mkdir(output, { recursive: true });
const version = await fetch(new URL('version.json', site), { cache: 'no-store' }).then(r => r.json());
const evidence = { site, commit: version.commit, checkedAt: new Date().toISOString(), lighthouseVersion: '13.6.0', results: [] };
for (const device of ['desktop', 'mobile']) {
  const browser = await puppeteer.launch({ executablePath: chromium.executablePath(), headless: true });
  try {
    const pptr = (await browser.pages())[0];
    await pptr.setViewport(device === 'desktop' ? { width: 1365, height: 900 } : { width: 390, height: 844, isMobile: true, hasTouch: true });
    const pw = await chromium.connectOverCDP(browser.wsEndpoint());
    const page = pw.contexts()[0].pages()[0];
    const viewport = device === 'desktop' ? { width: 1365, height: 900 } : { width: 390, height: 844 };
    await page.setViewportSize(viewport);
    const config = { extends: 'lighthouse:default', settings: { onlyCategories: ['accessibility'], formFactor: device, screenEmulation: { disabled: false, width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: device === 'mobile' }, disableStorageReset: true } };
    const button = name => page.getByRole('button', { name, exact: true });
    async function audit(name, navigation = false) {
      await page.setViewportSize(viewport);
      // Snapshot mode audits the existing viewport; explicitly set it before gathering.
      const session = await pptr.createCDPSession();
      await session.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: device === 'mobile' });
      const auditViewport = await page.evaluate(() => innerWidth);
      if (auditViewport !== viewport.width) throw new Error(`Unexpected audit viewport: ${auditViewport}`);
      await page.evaluate(() => document.fonts.ready);
      const result = navigation ? await lighthouse(site, { logLevel: 'error', output: 'html' }, config, pptr) : await snapshot(pptr, { config, flags: { logLevel: 'error', output: 'html' } });
      const { lhr } = result;
      const score = Math.round(lhr.categories.accessibility.score * 100);
      const failures = Object.values(lhr.audits).filter(a => a.score !== null && a.score < 1).map(a => ({ id: a.id, title: a.title, items: a.details?.items }));
      await session.send('Emulation.setDeviceMetricsOverride', { ...viewport, deviceScaleFactor: 1, mobile: device === 'mobile' });
      const responsive = await page.evaluate(() => ({ viewport: innerWidth, content: document.documentElement.scrollWidth, passes: document.documentElement.scrollWidth <= innerWidth + 1 }));
      if (responsive.viewport !== viewport.width) throw new Error(`Audit viewport drifted: expected ${viewport.width}, got ${responsive.viewport}`);
      const stem = `${device}-${name}`;
      await writeFile(resolve(output, `${stem}.html`), result.report);
      await writeFile(resolve(output, `${stem}.json`), JSON.stringify(lhr, null, 2));
      await page.screenshot({ path: resolve(output, `${stem}.png`), fullPage: !(await page.getByRole('dialog').count()) });
      await session.detach();
      evidence.results.push({ device, name, mode: navigation ? 'navigation' : 'snapshot', score, auditViewport, responsive, failures });
      await writeFile(resolve(output, 'summary.json'), JSON.stringify(evidence, null, 2));
      console.log(`${device} ${name}: Lighthouse Accessibility ${score}/100; responsive ${responsive.passes ? 'pass' : 'FAIL'}`);
    }
    await page.goto(site);
    await button('Try demo as Maya').waitFor();
    await audit('login', true);
    await button('New here? Create an account').click();
    await audit('signup');
    await button('Try demo as Maya').click();
    await page.getByRole('heading', { name: 'Seattle & Bainbridge getaway', exact: true }).waitFor();
    await page.goto(`${site}#/6`);
    await page.getByLabel('Trip title', { exact: true }).fill('A trip with room to explore');
    await audit('trip-form');
    await page.goto(`${site}#/7`);
    await audit('event-form');
    await page.goto(`${site}#/15`);
    await button('Next').click();
    await audit('preference-places');
    await button('Next').click();
    await audit('preference-notes');
    await page.goto(`${site}#/13`);
    await button('Invite someone').click();
    await audit('invite-dialog');
    await button('Close dialog').click();
    await page.goto(`${site}#/12`);
    await button('Budget settings').click();
    await audit('budget-dialog');
    await button('Close dialog').click();
    await button('Add expense').click();
    await audit('expense-dialog');
    await page.getByLabel('What was it for?', { exact: true }).fill('Lunch');
    await page.getByLabel('Amount (USD)', { exact: true }).fill('1e3');
    await button('Save expense').click();
    await page.getByRole('alert').waitFor();
    await audit('expense-validation');
    await button('Close dialog').click();
    await page.goto(`${site}#/8`);
    await button('Demo controls & screen index').click();
    await button('During').click();
    await button('Apply & preview landing').click();
    await page.getByLabel('New to-do', { exact: true }).waitFor();
    await audit('reminders');
  } finally { await browser.close(); }
}
const latest = await fetch(new URL('version.json', site), { cache: 'no-store' }).then(r => r.json());
evidence.completedAt = new Date().toISOString();
evidence.finalCommit = latest.commit;
await writeFile(resolve(output, 'summary.json'), JSON.stringify(evidence, null, 2));
if (latest.commit !== version.commit) throw new Error('The live version changed during the audit; rerun against one revision.');
if (evidence.results.some(r => r.score < 90 || !r.responsive.passes)) process.exitCode = 1;
