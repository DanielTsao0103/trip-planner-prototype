// Run: npm exec --yes --package=@electric-sql/pglite -- node scripts/test-okr3-expense.mjs
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const entry = process.env.PATH.split(path.delimiter)
  .map(dir => path.resolve(dir, "../@electric-sql/pglite/dist/index.js"))
  .find(existsSync);
if (!entry) throw new Error("Run using the npm exec command in the header.");
const { PGlite } = await import(pathToFileURL(entry).href);
const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const metrics = async () => (await db.query("select public.get_budget_cadence_metrics(14) as value")).rows[0].value;
try {
  await db.exec(`
    create schema auth; create schema private;
    create role anon; create role authenticated;
    create table auth.users(id uuid primary key);
    insert into auth.users values ('${id(1)}'), ('${id(2)}');
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('qa.actor', true), '')::uuid $$;
    create function private.is_admin() returns boolean language sql stable
      as $$ select current_setting('qa.admin', true) = 'yes' $$;
    create table public.trip("tripID" uuid primary key, owner_id uuid, start_date date, end_date date);
    create table public.trip_member("tripID" uuid, "userID" uuid, shared_account boolean, status text);
    create table public.trip_expense(trip_id uuid, id text, primary key(trip_id,id));
    create table private.budget_cadence_day(
      user_id uuid references auth.users(id), trip_id uuid references public.trip("tripID"),
      activity_date date, accessed boolean default false, budget_changed boolean default false,
      primary key(user_id,trip_id,activity_date)
    );
    insert into public.trip values ('${id(3)}','${id(1)}',current_date - 4,current_date + 1);
    insert into public.trip_member values ('${id(3)}','${id(2)}',true,'accepted');
    set qa.actor = '${id(1)}'; set qa.admin = 'yes';
  `);
  await db.exec(readFileSync(new URL("../supabase/migrations/20261117010000_expense_logging_okr.sql", import.meta.url), "utf8"));
  await db.exec("update private.expense_okr_tracking_start set started_on = current_date - 4");

  let result = await metrics();
  assert.equal(result.targetPercent, 60);
  assert.equal(result.observedDays, 4);
  assert.equal(result.eligibleUsers, 2);
  assert.equal(result.consistentUsers, 0);
  assert.equal(result.percent, 0);

  // Budget edits and unchanged expense IDs must not create an expense signal.
  await db.exec(`select private.record_budget_cadence_change('${id(3)}','{"budget":100,"expenses":[]}'::jsonb)`);
  assert.equal((await db.query("select count(*)::int as n from private.budget_cadence_day")).rows[0].n, 0);
  await db.exec(`select private.record_budget_cadence_change('${id(3)}','{"expenses":[{"id":"first"}]}'::jsonb)`);
  assert.equal((await db.query("select expense_logged from private.budget_cadence_day")).rows[0].expense_logged, true);
  await db.exec(`insert into public.trip_expense values ('${id(3)}','first')`);
  await db.exec(`set qa.actor = '${id(2)}'; select private.record_budget_cadence_change('${id(3)}','{"expenses":[{"id":"first","amount":999}]}'::jsonb)`);
  assert.equal((await db.query("select count(*)::int as n from private.budget_cadence_day")).rows[0].n, 1);

  // Earlier completed days: the owner logs every other day; the member misses a window.
  await db.exec(`
    insert into private.budget_cadence_day(user_id,trip_id,activity_date,expense_logged) values
      ('${id(1)}','${id(3)}',current_date - 4,true),
      ('${id(1)}','${id(3)}',current_date - 2,true),
      ('${id(2)}','${id(3)}',current_date - 4,true);
  `);
  result = await metrics();
  assert.equal(result.eligibleUsers, 2);
  assert.equal(result.consistentUsers, 1);
  assert.equal(result.percent, 50);
  assert.deepEqual(result.daily.map(day => day.percent), [100, 50, 50]);
  await db.exec("set qa.admin = 'no'");
  await assert.rejects(metrics(), /Admin access required/);
  console.log("Seth expense logging OKR migration checks passed.");
} finally {
  await db.close();
}
