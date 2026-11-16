// Run from the project root: npm exec --yes --package=@electric-sql/pglite -- node scripts/test-okr4-budget.mjs
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
const metrics = async () => (await db.query("select * from public.okr4_trip_budget_stats()")).rows[0];

try {
  await db.exec(`
    create schema private;
    create role anon;
    create role authenticated;
    grant usage on schema private to authenticated;
    create function private.is_admin() returns boolean language sql stable
      as $$ select current_setting('qa.admin', true) = 'yes' is true $$;
    create table public.trip (
      "tripID" uuid primary key, owner_id uuid, start_date date, end_date date,
      timezone text default 'UTC', budget_mode text default 'group', budget_cents bigint
    );
    create table public.trip_expense (trip_id uuid references public.trip, amount_cents bigint);
    insert into public.trip values
      ('${id(1)}', '${id(99)}', current_date + 3, current_date + 5, 'UTC', 'group', 10000),
      ('${id(2)}', '${id(99)}', current_date - 3, current_date - 1, 'UTC', 'group', 10000);
  `);
  await db.exec(readFileSync(new URL("../supabase/migrations/20261115223000_okr4_trip_budget_stats.sql", import.meta.url), "utf8"));
  await db.exec("set qa.admin = 'yes'");
  assert.equal((await metrics()).eligible_trips, 0, "upcoming and historical trips are initially excluded");

  await db.exec(`
    insert into public.trip values
      ('${id(3)}', '${id(99)}', current_date + 3, current_date + 5, 'UTC', 'group', 10000),
      ('${id(4)}', '${id(99)}', current_date + 3, current_date + 5, 'UTC', 'group', 10000),
      ('${id(5)}', '${id(99)}', current_date + 3, current_date + 5, 'UTC', 'individual', 10000),
      ('${id(6)}', '${id(99)}', current_date + 3, current_date + 5, 'UTC', 'group', null);
    update public.trip set budget_cents = 12000 where "tripID" = '${id(1)}';
    update public.trip set start_date = current_date - 3, end_date = current_date - 1;
    update public.trip set budget_cents = 20000;
    update public.trip set start_date = current_date + 1 where "tripID" in ('${id(3)}', '${id(6)}');
    update public.trip set budget_cents = 99999 where "tripID" in ('${id(3)}', '${id(6)}');
    update public.trip set start_date = current_date - 3 where "tripID" in ('${id(3)}', '${id(6)}');
    insert into public.trip_expense values ('${id(1)}', 7000), ('${id(1)}', 5000), ('${id(3)}', 11000);
  `);
  assert.deepEqual(await metrics(), { eligible_trips: 3, within_budget_trips: 1, trips_without_expenses: 1 });
  await db.exec("set role authenticated; set qa.admin = 'no'");
  await assert.rejects(metrics(), /Admin access required/);
  await assert.rejects(db.query("select * from private.trip_departure_budget"), /permission denied/);
  await db.exec("reset role; set role anon");
  await assert.rejects(metrics(), /permission denied/);
  console.log("OKR #4 budget migration checks passed.");
} finally {
  await db.close();
}
