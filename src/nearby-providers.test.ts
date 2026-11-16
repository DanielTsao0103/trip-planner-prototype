import { test } from "node:test";
import assert from "node:assert/strict";
import { planningContext, type PlanningTrip } from "../supabase/functions/_shared/nearby.ts";
import { researchWithFreeProviders, researchQueries, supportedFacts, compactResearchContext, assertContextFits, ResearchError } from "../supabase/functions/nearby-suggestions/providers.ts";
import { createNearbyHandler, type ResearchGateway } from "../supabase/functions/nearby-suggestions/handler.ts";

const trip: PlanningTrip = { id: "11111111-1111-4111-8111-111111111111", start: "2027-06-01", end: "2027-06-03", zone: "America/Los_Angeles", destinations: ["Seattle"], members: [{ id: "owner", role: "Owner", status: "accepted" }], prefs: {}, events: [], expenses: [], budget: 10000, budgetMode: "group", individual: {} };
const context = () => planningContext(trip, "owner", trip.start, "lunch");
const source = { url: "https://venue.example/menu", title: "Official venue menu", content: "Our lunch menu includes vegetarian dumplings. Lunch is served from noon." };
const candidate = { name: "Vegetarian dumplings", address: "Seattle", reason: "Lunch option", recommendationType: "dish", durationMinutes: 60, pricePerPersonCents: null, currency: null, concerns: [], conflicts: [], facts: [{ topic: "Menu", detail: "Vegetarian dumplings are available on the lunch menu", sourceUrl: source.url, quote: "Our lunch menu includes vegetarian dumplings." }] };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const bytesForTest = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

test("free provider flow uses three basic searches and bounded structured Groq passes", async () => {
  const calls: { url: string; body: any }[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    const body = JSON.parse(init!.body as string); calls.push({ url: String(url), body });
    return String(url).includes("tavily") ? json({ results: [source] }) : json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ candidates: [candidate] }) } }] });
  };
  const result = await researchWithFreeProviders(context(), { groq: "fixture", tavily: "fixture" }, fetcher);
  assert.equal(calls.length, 5); assert.equal(calls.filter(c => c.url === "https://api.tavily.com/search").length, 3);
  for (const call of calls.slice(0, 3)) { assert.equal(call.body.search_depth, "basic"); assert.equal(call.body.auto_parameters, false); assert.equal(call.body.include_raw_content, false); }
  assert.equal(calls[0].body.include_domains, undefined);
  assert.equal(calls[1].body.include_domains, undefined);
  assert.match(calls[0].body.query, /specific lunch dishes and foods to try/);
  assert.match(calls[2].body.query, /official tourism food guide/);
  const last = calls[4]; assert.equal(last.url, "https://api.groq.com/openai/v1/chat/completions"); assert.equal(last.body.response_format.json_schema.strict, true);
  assert.ok(new TextEncoder().encode(JSON.stringify({ model: last.body.model, messages: last.body.messages, response_format: last.body.response_format })).length + 1800 + 512 <= 8000);
  assert.equal(result.candidates[0].facts.length, 1);
});
test("activity Yelp sources remain restricted to the real Yelp domain", async () => {
  let searches = 0;
  const yelp = { url: "https://www.yelp.com/biz/venue-seattle", title: "Venue - Yelp", content: "Venue offers a public art tour every Saturday." };
  const activityContext = planningContext(trip, "owner", trip.start, "activity");
  const result = await researchWithFreeProviders(activityContext, { groq: "fixture", tavily: "fixture" }, async (url, init) => {
    if (String(url).includes("tavily")) return json({ results: ++searches === 2 ? [yelp, { ...yelp, url: "https://yelp.com.evil.example/biz/a" }] : [source] });
    const prompt = JSON.parse(init!.body as string).messages[1].content;
    assert.ok(prompt.includes(yelp.url)); assert.equal(prompt.includes("evil.example"), false);
    return json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ candidates: [{ ...candidate, name: "Venue", recommendationType: "activity", facts: [{ ...candidate.facts[0], topic: "Venue", sourceUrl: yelp.url, quote: yelp.content }] }] }) } }] });
  });
  assert.equal(searches, 3); assert.equal(result.yelpStatus, "found"); assert.equal(result.yelpSourcesUsed, 1); assert.equal(result.candidates[0].facts[0].sourceUrl, yelp.url);
});
test("unavailable supplemental Yelp search preserves primary evidence and continues through tourism fallback", async () => {
  let calls = 0;
  const result = await researchWithFreeProviders(planningContext(trip, "owner", trip.start, "activity"), { groq: "fixture", tavily: "fixture" }, async url => {
    calls++;
    if (String(url).includes("tavily")) return calls === 1 || calls === 3 ? json({ results: [source] }) : json({}, 403);
    return json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ candidates: calls === 4 ? [{ ...candidate, recommendationType: "activity" }] : [] }) } }] });
  });
  assert.equal(calls, 5); assert.equal(result.yelpStatus, "unavailable"); assert.equal(result.candidates.length, 1);
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
  assert.deepEqual((await researchWithFreeProviders(context(), { groq: "fixture", tavily: "fixture" }, fetcher)).candidates, []); assert.equal(calls, 3);
  const c = context(); c.area = "x".repeat(20000);
  await assert.rejects(researchWithFreeProviders(c, { groq: "fixture", tavily: "fixture" }, fetcher), (e: unknown) => e instanceof ResearchError && e.status === 422); assert.equal(calls, 3);
});
test("identical group answers compact without losing their vote count or requester distinction", () => {
  const c = context();
  const answers = { diet: ["Vegan"], access: [], walk: 500, interests: ["Art"], food: "Local", spending: "Moderate", dining: "Casual", atmosphere: "Quiet", destinations: "", tickets: "", notes: "", requester: false };
  c.preferences = Array.from({ length: 20 }, (_, i) => ({ ...answers, requester: i === 0 }));
  const groups = compactResearchContext(c).constraints.groupPreferences;
  assert.equal(groups.length, 2); assert.equal(groups.reduce((sum, g) => sum + g.count, 0), 20);
});
test("crowded day and group hard constraints fit in compact context", () => {
  const t = structuredClone(trip);
  t.events = Array.from({ length: 24 }, (_, i) => ({ id: `event-${i}`, name: `Museum visit ${i}`, place: `Venue ${i}, Seattle`, date: t.start, start: `${String(8 + Math.floor(i / 4)).padStart(2, "0")}:${i % 2 ? "00" : "30"}`, end: `${String(8 + Math.floor(i / 4)).padStart(2, "0")}:${i % 2 ? "30" : "59"}`, cost: 0, attendees: ["owner"] }));
  t.prefs.owner = { diet: ["Peanut avoidance"], access: ["Step-free entrance"], walk: 250, interests: ["Art"], food: "Local", spending: "Moderate", dining: "Casual", atmosphere: "Quiet", destinations: "", tickets: "Call ahead for wheelchair access", notes: "Severe peanut allergy; avoid any venue without a clear allergen policy." };
  const c = planningContext(t, "owner", t.start, "activity");
  const payload = assertContextFits(c);
  const compact = compactResearchContext(c);
  assert.ok(bytesForTest(payload) < 8000);
  assert.match(JSON.stringify(compact), /Peanut avoidance/);
  assert.match(JSON.stringify(compact), /Severe peanut allergy/);
  assert.match(JSON.stringify(compact), /Call ahead for wheelchair access/);
  assert.equal(compact.plannedPlaces.length, 24);
  assert.deepEqual(compact.gaps, c.gaps);
});
test("both real search requests retain the venue and its trip destination", async () => {
  const t = structuredClone(trip); t.events = [{ id: "m", name: "Meet", place: "McDonald's", date: t.start, start: "10:00", end: "11:00", cost: 0, attendees: ["owner"] }];
  const c = planningContext(t, "owner", t.start, "activity");
  const queries = researchQueries(c);
  for (const query of queries.slice(0, 2)) { assert.match(query, /McDonald's/); assert.match(query, /Seattle/); }
  assert.match(queries[2], /Seattle/); assert.doesNotMatch(queries[2], /McDonald's/);
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
  const response = await createNearbyHandler(config, () => ({ ...gateway, trip: async () => blocked }), async url => String(url).includes("tavily") ? json({ results: [source] }) : json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ candidates: [candidate] }) } }] }))(request());
  const busyResult = await response.json();
  assert.equal(busyResult.results.length, 1); assert.equal(busyResult.results[0].proposedTime, null); assert.equal(reservations, before + 1);
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
  const oversizedTrip = structuredClone(row);
  oversizedTrip.content.prefs.owner = { diet: [], access: [], walk: 500, interests: [], food: "", spending: "", dining: "", atmosphere: "", destinations: "", tickets: "", notes: "hard constraint ".repeat(3000) };
  const oversized = await createNearbyHandler(enabled, () => ({ ...gateway, trip: async () => oversizedTrip }), fetcher)(request());
  assert.equal(oversized.status, 422);
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


test("recovery replaces rejected candidates with a supported dish matching the selected category", async () => {
  let modelCalls = 0;
  const dishSource = { url: "https://tourism.example/dumplings", title: "Seattle dumplings to try", content: "Seattle-style salmon dumplings are served at the market. Made with local salmon." };
  const dish = { ...candidate, name: "Seattle-style salmon dumplings", recommendationType: "dish", facts: [{ topic: "Menu", detail: dishSource.content, sourceUrl: dishSource.url, quote: "Seattle-style salmon dumplings are served at the market." }] };
  const result = await researchWithFreeProviders(context(), { groq: "fixture", tavily: "fixture" }, async url => {
    if (String(url).includes("tavily")) return json({ results: [dishSource] });
    return json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ candidates: ++modelCalls === 1 ? [candidate, candidate, candidate] : [dish] }) } }] });
  });
  assert.equal(modelCalls, 2); assert.equal(result.recoveryAttempted, true);
  assert.equal(result.candidates.length, 1); assert.equal(result.candidates[0].name, "Seattle-style salmon dumplings");
  assert.equal(result.candidates[0].facts.length, 1);
});
test("broader tourism search stays in the active city and region on multi-city trips", () => {
  const c = context(); c.area = "Small Cafe, Taipei, Taiwan"; c.destinations = ["Seattle, WA", "Taipei, Taiwan"];
  const queries = researchQueries(c);
  assert.equal(queries.length, 3); assert.match(queries[2], /Taipei/); assert.match(queries[2], /Taiwan/);
  assert.doesNotMatch(queries[2], /Small Cafe|Seattle/);
});


test("optional recovery failure preserves already reviewed suggestions", async () => {
  let modelCalls = 0;
  const result = await researchWithFreeProviders(context(), { groq: "fixture", tavily: "fixture" }, async url => {
    if (String(url).includes("tavily")) return json({ results: [source] });
    if (++modelCalls === 2) return json({}, 429);
    return json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ candidates: [candidate] }) } }] });
  });
  assert.equal(result.candidates.length, 1); assert.equal(result.candidates[0].name, candidate.name);
});


test("city tourism evidence reaches the model even when granular searches are full", async () => {
  let searches = 0;
  await researchWithFreeProviders(context(), { groq: "fixture", tavily: "fixture" }, async (url, init) => {
    if (String(url).includes("tavily")) {
      const stage=++searches;
      return json({ results: Array.from({ length: 3 }, (_, i) => ({ url: stage===2 ? "https://www.yelp.com/biz/"+i : "https://tourism.example/"+stage+"/"+i, title: "Venue", content: (stage===3 ? "CITY_WIDE_EVIDENCE " : "Venue details ").repeat(180) })) });
    }
    assert.ok(JSON.parse(init!.body as string).messages[1].content.includes("CITY_WIDE_EVIDENCE"));
    return json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ candidates: [] }) } }] });
  });
});


test("invalid provider JSON uses one reserved repair call and returns a suggestion", async () => {
  let calls = 0;
  const result = await researchWithFreeProviders(context(), { groq: "fixture", tavily: "fixture" }, async url => {
    if (String(url).includes("tavily")) return json({ results: [source] });
    if (++calls === 1) return json({ error: { code: "json_validate_failed" } }, 400);
    return json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ candidates: [candidate] }) } }] });
  });
  assert.equal(calls, 2); assert.equal(result.candidates.length, 1); assert.equal(result.recoveryAttempted, true);
});


test("unsupported categories do not redirect users to a generic city guide", async () => {
  const row = { tripID: trip.id, revision: 2, start_date: trip.start, end_date: trip.end, timezone: trip.zone, destinations: trip.destinations, content: trip };
  const gateway: ResearchGateway = { actor: async () => "owner", trip: async () => row, reserve: async () => "request", finish: async () => {} };
  let searches=0;
  const response=await createNearbyHandler({ enabled:true,groq:"fixture",tavily:"fixture" },()=>gateway,async url => {
    if(String(url).includes("tavily")) return json({results: ++searches===3 ? [{url:"https://tourism.example/city",title:"Seattle city activities",content:"Explore public gardens, local museums and city neighborhoods in Seattle."}] : []});
    return json({choices:[{finish_reason:"stop",message:{content:JSON.stringify({candidates:[]})}}]});
  })(new Request("https://edge.example/nearby",{method:"POST",body:JSON.stringify({tripId:trip.id,revision:2,date:trip.start,intent:"lunch"})}));
  const body=await response.json(); assert.equal(body.results.length,0); assert.equal(body.emptyReason,"no_candidates");
});
