import { test } from "node:test";
import assert from "node:assert/strict";
import { planningContext, type PlanningTrip } from "../supabase/functions/_shared/nearby.ts";
import { researchWithFreeProviders, researchQueries, supportedFacts, compactResearchContext, ResearchError } from "../supabase/functions/nearby-suggestions/providers.ts";
import { createNearbyHandler, type ResearchGateway } from "../supabase/functions/nearby-suggestions/handler.ts";

const trip: PlanningTrip = { id: "11111111-1111-4111-8111-111111111111", start: "2027-06-01", end: "2027-06-03", zone: "America/Los_Angeles", destinations: ["Seattle"], members: [{ id: "owner", role: "Owner", status: "accepted" }], prefs: {}, events: [], expenses: [], budget: 10000, budgetMode: "group", individual: {} };
const context = () => planningContext(trip, "owner", trip.start, "lunch");
const source = { url: "https://venue.example/menu", title: "Official venue menu", content: "Our lunch menu includes vegetarian dishes. Lunch is served from noon." };
const candidate = { name: "Venue", address: "Seattle", reason: "Lunch option", durationMinutes: 60, pricePerPersonCents: null, currency: null, concerns: [], conflicts: [], facts: [{ topic: "Menu", detail: "Vegetarian dishes on the lunch menu", sourceUrl: source.url, quote: "Our lunch menu includes vegetarian dishes." }] };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

test("free provider flow uses exactly two basic searches then one structured Groq call with bounded input", async () => {
  const calls: { url: string; body: any }[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    const body = JSON.parse(init!.body as string); calls.push({ url: String(url), body });
    return String(url).includes("tavily") ? json({ results: [source] }) : json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ candidates: [candidate] }) } }] });
  };
  const result = await researchWithFreeProviders(context(), { groq: "fixture", tavily: "fixture" }, fetcher);
  assert.equal(calls.length, 3); assert.equal(calls.filter(c => c.url === "https://api.tavily.com/search").length, 2);
  for (const call of calls.slice(0, 2)) { assert.equal(call.body.search_depth, "basic"); assert.equal(call.body.auto_parameters, false); assert.equal(call.body.include_raw_content, false); }
  assert.equal(calls[0].body.include_domains, undefined);
  assert.deepEqual(calls[1].body.include_domains, ["yelp.com"]); assert.equal(calls[1].body.include_domains_mode, "restrict");
  const last = calls[2]; assert.equal(last.url, "https://api.groq.com/openai/v1/chat/completions"); assert.equal(last.body.response_format.json_schema.strict, true);
  assert.ok(new TextEncoder().encode(JSON.stringify({ model: last.body.model, messages: last.body.messages, response_format: last.body.response_format })).length + 1800 + 512 <= 8000);
  assert.equal(result.candidates[0].facts.length, 1);
});
test("Yelp sources are included alongside primary sources and remain restricted to the real Yelp domain", async () => {
  let searches = 0;
  const yelp = { url: "https://www.yelp.com/biz/venue-seattle", title: "Venue - Yelp", content: "Guests mention a vegetarian lunch menu." };
  const result = await researchWithFreeProviders(context(), { groq: "fixture", tavily: "fixture" }, async (url, init) => {
    if (String(url).includes("tavily")) return json({ results: ++searches === 1 ? [source] : [yelp, { ...yelp, url: "https://yelp.com.evil.example/biz/a" }] });
    const prompt = JSON.parse(init!.body as string).messages[1].content;
    assert.ok(prompt.includes(yelp.url)); assert.equal(prompt.includes("evil.example"), false);
    return json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ candidates: [{ ...candidate, facts: [{ ...candidate.facts[0], sourceUrl: yelp.url, quote: yelp.content }] }] }) } }] });
  });
  assert.equal(searches, 2); assert.equal(result.yelpStatus, "found"); assert.equal(result.yelpSourcesUsed, 1); assert.equal(result.candidates[0].facts[0].sourceUrl, yelp.url);
});
test("unavailable supplemental Yelp search preserves primary evidence without extra calls", async () => {
  let calls = 0;
  const result = await researchWithFreeProviders(context(), { groq: "fixture", tavily: "fixture" }, async url => {
    calls++;
    if (String(url).includes("tavily")) return calls === 1 ? json({ results: [source] }) : json({}, 403);
    return json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ candidates: [candidate] }) } }] });
  });
  assert.equal(calls, 3); assert.equal(result.yelpStatus, "unavailable"); assert.equal(result.candidates.length, 1);
});
test("a quota response on supplemental Yelp search pauses research rather than retrying", async () => {
  let calls = 0;
  await assert.rejects(researchWithFreeProviders(context(), { groq: "fixture", tavily: "fixture" }, async () => ++calls === 1 ? json({ results: [source] }) : json({}, 429)), (e: unknown) => e instanceof ResearchError && e.status === 429);
  assert.equal(calls, 2);
});
test("invented URLs and fabricated evidence quotes cannot appear as supported facts", () => {
  const result = supportedFacts([{ ...candidate, facts: [candidate.facts[0], { ...candidate.facts[0], quote: "Peanut free with no cross contact" }, { ...candidate.facts[0], sourceUrl: "https://invented.example" }] }], [source]);
  assert.equal(result[0].facts.length, 1);
  assert.equal(result[0].facts[0].detail, candidate.facts[0].quote);
  const unrelated = { ...source, content: `${source.content} All listings are within a 0.5 mile walk from the conference hotel.` };
  const routing = supportedFacts([{ ...candidate, facts: [{ ...candidate.facts[0], quote: "All listings are within a 0.5 mile walk from the conference hotel." }] }], [unrelated]);
  assert.equal(routing[0].facts.length, 0);
  assert.equal(supportedFacts([{ ...candidate, name: "Invented venue" }], [source])[0].facts.length, 0);
});
test("search rate limits stop the pipeline without retries or model calls", async () => {
  let calls = 0;
  await assert.rejects(researchWithFreeProviders(context(), { groq: "fixture", tavily: "fixture" }, async () => { calls++; return json({}, 429); }), (error: unknown) => error instanceof ResearchError && error.status === 429);
  assert.equal(calls, 1);
});
test("empty search results skip the AI; oversized context uses neither provider", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls++; return json({ results: [] }); };
  assert.deepEqual((await researchWithFreeProviders(context(), { groq: "fixture", tavily: "fixture" }, fetcher)).candidates, []); assert.equal(calls, 2);
  const c = context(); c.area = "x".repeat(20000);
  await assert.rejects(researchWithFreeProviders(c, { groq: "fixture", tavily: "fixture" }, fetcher), (e: unknown) => e instanceof ResearchError && e.status === 422); assert.equal(calls, 2);
});
test("identical group answers compact without losing their vote count or requester distinction", () => {
  const c = context();
  const answers = { diet: ["Vegan"], access: [], walk: 500, interests: ["Art"], food: "Local", spending: "Moderate", dining: "Casual", atmosphere: "Quiet", destinations: "", tickets: "", notes: "", requester: false };
  c.preferences = Array.from({ length: 20 }, (_, i) => ({ ...answers, requester: i === 0 }));
  const groups = compactResearchContext(c).preferences;
  assert.equal(groups.length, 2); assert.equal(groups.reduce((sum, g) => sum + g.count, 0), 20);
});
test("both real search requests retain the venue and its trip destination", async () => {
  const t = structuredClone(trip); t.events = [{ id: "m", name: "Meet", place: "McDonald's", date: t.start, start: "10:00", end: "11:00", cost: 0, attendees: ["owner"] }];
  const c = planningContext(t, "owner", t.start, "activity");
  for (const query of researchQueries(c)) { assert.match(query, /McDonald's/); assert.match(query, /Seattle/); }
});
test("handler distinguishes empty search, empty AI, evidence rejection and no time without exposing source text", async () => {
  const row = { tripID: trip.id, revision: 2, start_date: trip.start, end_date: trip.end, timezone: trip.zone, destinations: trip.destinations, content: trip };
  let reservations = 0;
  const gateway: ResearchGateway = { actor: async () => "owner", trip: async () => row, reserve: async () => { reservations++; return "reservation"; }, finish: async () => {} };
  const request = () => new Request("https://edge.example/nearby", { method: "POST", body: JSON.stringify({ tripId: trip.id, date: trip.start, revision: 2, intent: "lunch" }) });
  const config = { enabled: true, groq: "fixture", tavily: "fixture" };
  for (const [mode, expected] of [["sources", "no_sources"], ["candidates", "no_candidates"], ["evidence", "evidence"], ["budget", "budget"], ["conflicts", "conflicts"]]) {
    const fetcher: typeof fetch = async url => String(url).includes("tavily") ? json({ results: mode === "sources" ? [] : [source] }) : json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ candidates: mode === "candidates" ? [] : [{ ...candidate, ...(mode === "evidence" ? { facts: [] } : mode === "conflicts" ? { conflicts: ["No access"] } : mode === "budget" ? { pricePerPersonCents: 20000, currency: "USD", facts: [{ ...candidate.facts[0], topic: "Price" }] } : {}) }] }) } }] });
    const result = await (await createNearbyHandler(config, () => gateway, fetcher)(request())).json();
    assert.equal(result.emptyReason, expected); assert.deepEqual(result.results, []); assert.ok(result.diagnostics);
    assert.equal(JSON.stringify(result).includes("Our lunch menu"), false);
  }
  const blocked = structuredClone(row); blocked.content.events = [{ id: "busy", name: "Busy", place: "Seattle", date: trip.start, start: "09:00", end: "17:00", cost: 0, attendees: [] }];
  const before = reservations;
  const response = await createNearbyHandler(config, () => ({ ...gateway, trip: async () => blocked }))(request());
  assert.equal((await response.json()).emptyReason, "no_time"); assert.equal(reservations, before);
});

test("handler blocks unauthorized, inaccessible, stale and disabled requests before reserving quota", async () => {
  let reservations = 0, providerCalls = 0;
  const row = { tripID: trip.id, revision: 2, start_date: trip.start, end_date: trip.end, timezone: trip.zone, destinations: trip.destinations, content: trip };
  const gateway: ResearchGateway = { actor: async () => "owner", trip: async () => row, reserve: async () => { reservations++; return "request"; }, finish: async () => {} };
  const request = (revision = 2) => new Request("https://edge.example/nearby", { method: "POST", body: JSON.stringify({ tripId: trip.id, date: trip.start, revision, intent: "lunch", preferences: { diet: [] } }) });
  const enabled = { enabled: true, groq: "fixture", tavily: "fixture" };
  const fetcher: typeof fetch = async () => { providerCalls++; throw Error("Unexpected provider"); };
  assert.equal((await createNearbyHandler(enabled, () => ({ ...gateway, actor: async () => null }), fetcher)(request())).status, 401);
  assert.equal((await createNearbyHandler(enabled, () => ({ ...gateway, trip: async () => null }), fetcher)(request())).status, 403);
  assert.equal((await createNearbyHandler(enabled, () => gateway, fetcher)(request(1))).status, 409);
  assert.equal((await createNearbyHandler({ enabled: false }, () => gateway, fetcher)(request())).status, 503);
  assert.equal(reservations, 0); assert.equal(providerCalls, 0);
});
test("handler enforces server quota before provider calls and records failed attempts", async () => {
  let calls = 0; const outcomes: string[] = [];
  const row = { tripID: trip.id, revision: 2, start_date: trip.start, end_date: trip.end, timezone: trip.zone, destinations: trip.destinations, content: trip };
  const gateway: ResearchGateway = { actor: async () => "owner", trip: async () => row, reserve: async () => "reservation", finish: async (_, outcome) => { outcomes.push(outcome); } };
  const config = { enabled: true, groq: "fixture", tavily: "fixture" };
  const request = () => new Request("https://edge.example/nearby", { method: "POST", body: JSON.stringify({ tripId: trip.id, date: trip.start, revision: 2, intent: "lunch" }) });
  const fetcher: typeof fetch = async () => { calls++; return json({}, 429); };
  const limited = await createNearbyHandler(config, () => ({ ...gateway, reserve: async () => { throw new ResearchError("Daily user limit reached", 429); } }), fetcher)(request());
  assert.equal(limited.status, 429); assert.equal(calls, 0);
  const failed = await createNearbyHandler(config, () => gateway, fetcher)(request());
  assert.equal(failed.status, 429); assert.deepEqual(outcomes, ["failed"]); assert.equal((await failed.json()).attemptUsed, true);
});
