/** Exercise today's real save path with disposable accounts. Never sends email. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { saveAccountTrip, loadAccountTrips, tripFromRow } from '../src/account-trips.ts';
import { TRIP_CLIENT_INFO } from '../src/trip-client-info.ts';
const env = Object.assign({}, ...['.env.local', '.env.server.local'].filter(existsSync).map(file => parseEnv(readFileSync(file, 'utf8'))), process.env);
const options = { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { 'X-Client-Info': TRIP_CLIENT_INFO }, fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }) } };
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, options);
const accounts = [];
const check = response => { if (response.error) throw Error(response.error.message); return response.data; };
const today = new Date().toISOString().slice(0, 10);
const tomorrow = new Date(Date.parse(today) + 86400000).toISOString().slice(0, 10);
let tripId;
let checks = 0;
function verify(label, condition) { assert.ok(condition, label); checks++; console.log(`PASS ${label}`); }
async function load(account) {
  const rows = await loadAccountTrips(account.client);
  const row = rows.find(item => item.tripID === tripId);
  assert.ok(row, 'Saved trip available to authorized account');
  return tripFromRow(row, account);
}
try {
  for (const name of ['Owner', 'Editor', 'Viewer']) {
    const email = `active-trip-${randomUUID()}@example.com`, password = randomUUID();
    const { user } = check(await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: `Active ${name}` } }));
    const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, options);
    const account = { id: user.id, email, name: `Active ${name}`, client };
    accounts.push(account);
    check(await client.auth.signInWithPassword({ email, password }));
  }
  const [owner, editor, viewer] = accounts;
  tripId = randomUUID();
  let trip = { id: tripId, title: 'Active trip regression', destinations: ['London'], destinationTimezones: ['Europe/London'], start: today, end: tomorrow, zone: 'Europe/London', image: '', persistence: 'account', budget: 10000, budgetMode: 'group', members: accounts.map((account, i) => ({ id: account.id, name: account.name, email: account.email, role: ['Owner', 'Editor', 'Viewer'][i], status: 'accepted', days: [] })), events: [], expenses: [], prefs: {}, individual: {}, todos: [], dismissed: [], savedPlaces: [] };
  trip = await saveAccountTrip(owner.client, owner, trip);
  verify('create a trip active today', trip.id === tripId);
  for (const account of [editor, viewer]) check(await admin.from('trip_member').update({ userID: account.id, shared_account: true, status: 'accepted' }).eq('tripID', tripId).eq('planner_id', account.id));
  trip = await load(owner);
  trip.events.push({ id: randomUUID(), name: 'Active day plan', place: 'London', date: today, start: '10:00', end: '11:00', cost: 0, attendees: [owner.id], notes: '', image: '' });
  trip = await saveAccountTrip(owner.client, owner, trip);
  verify('owner itinerary save during the trip', (await load(editor)).events.length === 1);
  trip.budget = 20000;
  trip.individual[owner.id] = 5000;
  trip = await saveAccountTrip(owner.client, owner, trip);
  const budgetRead = await load(viewer);
  verify('group and personal budget save during the trip', budgetRead.budget === 20000 && budgetRead.individual[owner.id] === 5000);
  const shared = await load(editor);
  shared.events[0].start = '10:07'; shared.events[0].end = '11:07';
  await saveAccountTrip(editor.client, editor, shared);
  verify('editor precise-time change persists', (await load(owner)).events[0].start === '10:07');
  const denied = await load(viewer);
  denied.events[0].name = 'Denied edit';
  await assert.rejects(() => saveAccountTrip(viewer.client, viewer, denied));
  verify('viewer event edits remain denied', (await load(owner)).events[0].name === 'Active day plan');
  const expenseTrip = await load(owner);
  expenseTrip.expenses.push({ id: randomUUID(), purpose: 'Regression ticket', amount: 1000, category: 'Activities', payer: owner.id, shares: { [owner.id]: 1000 }, date: today, source: 'Manual', settled: [] });
  await saveAccountTrip(owner.client, owner, expenseTrip);
  verify('expense save and fresh read during the trip', (await load(editor)).expenses[0].amount === 1000);
  const reminderTrip = await load(owner);
  reminderTrip.todos.push({ id: randomUUID(), date: today, text: 'Bring tickets', done: false });
  await saveAccountTrip(owner.client, owner, reminderTrip);
  verify('unrelated reminder saves remain available', (await load(viewer)).todos[0].text === 'Bring tickets');
  console.log(`${checks} live active-trip checks passed.`);
} finally {
  const errors = [];
  for (const account of accounts) {
    try {
      check(await account.client.auth.signOut({ scope: 'global' }));
      check(await admin.from('trip').delete().eq('owner_id', account.id));
      check(await admin.from('user').delete().eq('userID', account.id));
      check(await admin.auth.admin.deleteUser(account.id));
    } catch (error) { errors.push(error.message); }
  }
  if (errors.length) throw Error(`QA cleanup failed: ${errors.join('; ')}`);
  console.log('Disposable active-trip accounts and data removed; no email sent.');
}
