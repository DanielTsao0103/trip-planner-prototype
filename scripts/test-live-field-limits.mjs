/** Verify the field-limit task through live UI, Supabase API, and database reads.
 * Uses one temporary account, then revokes its sessions and removes its own data.
 * Requires ignored .env.local/.env.server.local. Never prints credentials.
 */
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { chromium, expect } from '@playwright/test';
const env = { ...parseEnv(readFileSync('.env.local', 'utf8')), ...parseEnv(readFileSync('.env.server.local', 'utf8')), ...process.env };
const site = env.TRIP_QA_URL || 'https://danieltsao0103.github.io/trip-planner-prototype/';
const directory = env.TRIP_QA_OUTPUT || '/tmp/trip-field-limits-dod';
mkdirSync(directory, { recursive: true });
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, opts);
const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, opts);
const email = `field-limit-qa-${randomUUID()}@example.com`;
const password = `${randomUUID()}Aa1!`;
let account, browser;
const results = [];
function check(result) { if (result.error) throw new Error(result.error.message); return result.data; }
try {
  account = check(await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: 'Limit QA' } })).user;
  check(await client.auth.signInWithPassword({ email, password }));
  browser = await chromium.launch();
  async function login() {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto(site);
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();
    return { context, page };
  }
  const first = await login();
  await first.page.goto(`${site}#/6`);
  const title = 'T'.repeat(100), destination = 'D'.repeat(220);
  await first.page.getByLabel('Trip title', { exact: true }).fill(title + 'X');
  await expect(first.page.getByLabel('Trip title', { exact: true })).toHaveValue(title);
  await first.page.getByLabel('Where are you going?', { exact: true }).fill(destination + 'X');
  await expect(first.page.getByLabel('Where are you going?', { exact: true })).toHaveValue(destination);
  await first.page.getByLabel('Start date', { exact: true }).fill('2027-06-01');
  await first.page.getByLabel('End date', { exact: true }).fill('2027-06-04');
  await first.page.getByRole('button', { name: 'Create trip', exact: true }).click();
  await first.page.getByRole('button', { name: title, exact: true }).waitFor();
  const row = check(await admin.from('trip').select('*').eq('owner_id', account.id).single());
  assert.equal(row.trip_name, title);
  assert.deepEqual(row.destinations, [destination]);
  assert.equal(check(await admin.from('trip_member').select('userID').eq('tripID', row.tripID)).length, 1);
  results.push('Live mobile UI caps pasted 101/221 characters; 100/220 characters persist in PostgreSQL with owner membership.');
  for (const change of [{ trip_name: 'T'.repeat(101) }, { destinations: ['D'.repeat(221)] }, { destinations: Array(21).fill('Paris') }]) {
    const invalid = await client.from('trip').update(change).eq('tripID', row.tripID);
    assert.equal(invalid.error?.code, '23514');
  }
  const unchanged = check(await admin.from('trip').select('trip_name,destinations,revision').eq('tripID', row.tripID).single());
  assert.equal(unchanged.revision, row.revision);
  assert.equal(unchanged.trip_name, title);
  results.push('Bypassing the form cannot save a 101-character title, 221-character destination, or 21 destinations; rejected writes leave the record unchanged.');
  await first.context.close();
  const fresh = await login();
  await fresh.page.goto(`${site}#/5`);
  await fresh.page.getByRole('button', { name: title, exact: true }).click();
  await fresh.page.getByRole('button', { name: 'Edit trip', exact: true }).click();
  await expect(fresh.page.getByLabel('Trip title', { exact: true })).toHaveValue(title);
  const updated = 'U'.repeat(100);
  await fresh.page.getByLabel('Trip title', { exact: true }).fill(updated);
  await fresh.page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await fresh.page.getByRole('heading', { name: updated, exact: true }).waitFor();
  assert.equal(check(await admin.from('trip').select('trip_name').eq('tripID', row.tripID).single()).trip_name, updated);
  await fresh.page.reload();
  await fresh.page.getByRole('heading', { name: updated, exact: true }).waitFor();
  assert.ok(await fresh.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await fresh.page.screenshot({ path: `${directory}/live-database-limits-mobile.png`, fullPage: true });
  results.push('Fresh-browser login restores maximum-length details; editing and reloading persist the new title without mobile overflow.');
} finally {
  await browser?.close();
  if (account) {
    check(await client.auth.signOut({ scope: 'global' }));
    check(await admin.from('trip').delete().eq('owner_id', account.id));
    check(await admin.from('user').delete().eq('userID', account.id));
    check(await admin.auth.admin.deleteUser(account.id));
    for (const [table, column] of [['trip','owner_id'], ['trip_member','userID'], ['user','userID']])
      assert.equal(check(await admin.from(table).select(column).eq(column, account.id)).length, 0);
    results.push('Temporary account sessions revoked; test Auth account, profile, trip, and membership removed.');
    console.log(results.join('\n'));
  }
}
writeFileSync(`${directory}/live-field-limits.json`, JSON.stringify({ site, checkedAt: new Date().toISOString(), results }, null, 2));
