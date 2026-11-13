// Run with: npm exec --yes --package=@electric-sql/pglite -- node scripts/test-nearby-ledger.mjs
// Isolated in-memory PostgreSQL; never connects to Supabase or reads credentials.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
const entry = (process.env.PATH || process.env.Path || "").split(path.delimiter)
  .map(dir => path.resolve(dir, "..", "@electric-sql/pglite/dist/index.js"))
  .find(file => fs.existsSync(file));
if (!entry) throw Error("Run this script using the npm exec command in its header.");
const { PGlite } = await import(pathToFileURL(entry).href);
const db = new PGlite();
try {
  await db.exec(`create schema private; create schema auth;
    create role anon; create role authenticated; create role service_role;
    create table auth.users(id uuid primary key);
    create function private.trip_bundle(uuid) returns jsonb language sql as 'select null::jsonb';
    grant usage on schema public to anon,authenticated,service_role;
    insert into auth.users values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');`);
  await db.exec(fs.readFileSync(new URL("../supabase/migrations/20261112234000_nearby_research.sql", import.meta.url), "utf8"));
  await db.exec(fs.readFileSync(new URL("../supabase/migrations/20261113182000_nearby_quota_retention.sql", import.meta.url), "utf8"));
  const actor = "11111111-1111-4111-8111-111111111111";
  const reserve = () => db.query("select public.reserve_nearby_generation($1::uuid) as id", [actor]);
  const first = await reserve(); assert.ok(first.rows[0].id);
  await assert.rejects(reserve(), /wait one minute/);
  await db.exec("update private.nearby_research_usage set created_at=now()-interval '2 minutes'");
  const concurrent = await Promise.allSettled([reserve(), reserve()]);
  assert.equal(concurrent.filter(r => r.status === "fulfilled").length, 1);
  await db.exec("truncate private.nearby_research_usage");
  await db.query(`insert into private.nearby_research_usage(actor,created_at) select $1::uuid,now()-interval '2 minutes' from generate_series(1,5)`, [actor]);
  await assert.rejects(reserve(), /Daily user limit/);
  await db.exec("truncate private.nearby_research_usage");
  await db.exec(`insert into private.nearby_research_usage(actor,created_at) select '22222222-2222-4222-8222-222222222222',now()-interval '2 minutes' from generate_series(1,24)`);
  await assert.rejects(reserve(), /shared daily/);
  await db.exec("truncate private.nearby_research_usage");
  await db.exec(`insert into private.nearby_research_usage(actor,created_at) select '22222222-2222-4222-8222-222222222222',date_trunc('month',now() at time zone 'UTC') at time zone 'UTC' from generate_series(1,500)`);
  await assert.rejects(reserve(), /monthly free/);
  await db.exec("truncate private.nearby_research_usage");
  await db.exec("set role authenticated");
  await assert.rejects(reserve(), /permission denied/);
  await db.exec("reset role; set role service_role");
  const permitted = await reserve();
  await db.query("select public.finish_nearby_generation($1::uuid,'failed')", [permitted.rows[0].id]);
  await db.exec("reset role");
  const ledger = await db.query("select outcome,search_credits,model_tokens from private.nearby_research_usage");
  assert.deepEqual(ledger.rows[0], { outcome: "failed", search_credits: 2, model_tokens: 8000 });
  await db.query("delete from auth.users where id=$1::uuid", [actor]);
  const retained = await db.query("select actor,search_credits from private.nearby_research_usage");
  assert.equal(retained.rows.length, 1); assert.equal(retained.rows[0].actor, null); assert.equal(retained.rows[0].search_credits, 2);
  console.log("PASS: migration applies; minute/concurrent/user/day/month limits; role permissions; failure reservations.");
} finally { await db.close(); }
