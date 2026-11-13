import { test } from "node:test";
import assert from "node:assert/strict";
import { planningContext, reviewCandidates, nearbyListingLinks, isYelpSource, type PlanningTrip, type Candidate } from "../supabase/functions/_shared/nearby.ts";
const trip = (): PlanningTrip => ({
  id: "trip", start: "2027-01-01", end: "2027-01-03", zone: "America/Los_Angeles", destinations: ["Seattle", "Portland"],
  members: [{ id: "a", role: "Owner", status: "accepted" }, { id: "b", accountId: "account", role: "Viewer", status: "accepted" }, { id: "removed", role: "Viewer", status: "removed" }],
  prefs: Object.fromEntries(["a", "b", "removed"].map((id, i) => [id, { diet: i === 1 ? ["Peanut avoidance"] : [], access: i === 0 ? ["Step-free"] : [], walk: i === 0 ? 300 : 1000, interests: ["Art"], food: "Local", spending: "Moderate", dining: "Casual", atmosphere: "Quiet", destinations: "", tickets: "", notes: "" }])),
  events: [{ id: "event", name: "Museum", date: "2027-01-02", start: "10:00", end: "12:00", place: "Museum, Portland", cost: 2000, attendees: ["a", "b"] }],
  expenses: [{ amount: 1000, shares: { a: 500, b: 500 } }], budget: 10000, budgetMode: "group", individual: {},
});
const context = () => planningContext(trip(), "account", "2027-01-02", "lunch", undefined, new Date("2026-12-01T12:00:00Z"));
const candidate = (): Candidate => ({ name: "Real candidate", address: "A published street address", reason: "Near the museum", durationMinutes: 60, pricePerPersonCents: 2000, currency: "USD", facts: [{ topic: "Menu", detail: "Published menu", sourceUrl: "https://venue.example/menu" }], concerns: [], conflicts: [] });
test("nearby context uses active group, personal responses, day area and conservative budgets without identities", () => {
  const c = context();
  assert.equal(c.area, "Museum, Portland"); assert.equal(c.travelers, 2); assert.equal(c.preferences.filter(p => p.requester).length, 1);
  assert.deepEqual(c.diet, ["Peanut avoidance"]); assert.equal(c.walkMeters, 300); assert.equal(c.remainingGroupCents, 7000);
  assert.deepEqual(c.gaps, [{ start: "12:30", end: "15:00" }]); assert.equal(JSON.stringify(c).includes('"account"'), false);
});
test("unretrieved source URLs, explicit conflicts, overspending, duplicates and invalid durations cannot become recommendations", () => {
  const c = context(), sources = ["https://venue.example/menu"];
  assert.deepEqual(reviewCandidates([candidate()], c, []), []);
  assert.deepEqual(reviewCandidates([{ ...candidate(), conflicts: ["No step-free access"] }], c, sources), []);
  assert.deepEqual(reviewCandidates([{ ...candidate(), pricePerPersonCents: 4000 }], c, sources), []);
  assert.deepEqual(reviewCandidates([{ ...candidate(), durationMinutes: -1 }], c, sources), []);
  assert.deepEqual(reviewCandidates([{ ...candidate(), address: "Museum, Portland" }], c, sources), []);
});
test("sourced candidates remain review-only and proposed time respects deterministic gap", () => {
  const results = reviewCandidates([candidate(), candidate(), { ...candidate(), name: "Two" }, { ...candidate(), name: "Three" }, { ...candidate(), name: "Four" }], context(), ["https://venue.example/menu"]);
  assert.ok(results.length <= 3); assert.equal(results[0].status, "review"); assert.deepEqual(results[0].proposedTime, { start: "12:30", end: "13:30" });
  assert.ok(results[0].concerns.some(c => c.includes("cross-contact")));
  const unsafe = reviewCandidates([{ ...candidate(), reason: "Guaranteed allergy safe and accessible within your walking limit" }], context(), ["https://venue.example/menu"]);
  assert.equal(unsafe[0].reason.includes("Guaranteed"), false);
});
test("individual budget checks the least remaining allowance; foreign prices stay uncertain", () => {
  const t = trip(); t.budgetMode = "individual"; t.individual = { a: 2000, b: 10000 };
  const c = planningContext(t, "account", "2027-01-02", "lunch");
  assert.deepEqual(c.individualRemaining, [500, 8500]);
  assert.equal(reviewCandidates([candidate()], c, ["https://venue.example/menu"]).length, 0);
  const results = reviewCandidates([{ ...candidate(), currency: "EUR" }], c, ["https://venue.example/menu"]);
  assert.ok(results[0].concerns.some(c => c.includes("budget fit is unknown")));
});
test("invalid trip days fail and past days never get a proposed gap", () => {
  assert.throws(() => planningContext(trip(), "account", "2028-01-01", "lunch"));
  assert.deepEqual(planningContext(trip(), "account", "2027-01-02", "lunch", undefined, new Date("2028-01-01T00:00:00Z")).gaps, []);
});
test("venue-only search uses the relevant trip city, while complete saved addresses remain intact", () => {
  const t = trip(); t.events[0].place = "McDonald's";
  let c = planningContext(t, "account", "2027-01-02", "activity");
  assert.equal(c.area, "McDonald's · Seattle"); assert.match(c.locationNote, /no saved address/);
  t.events[0].place = "McDonald's, 100 Main Street";
  assert.equal(planningContext(t, "account", "2027-01-02", "activity").area, "McDonald's, 100 Main Street · Seattle");
  t.events[0].place = "McDonald's";
  t.events.push({ ...t.events[0], id: "other", start: "09:00", end: "10:00", place: "Museum, Portland" });
  c = planningContext(t, "account", "2027-01-02", "activity", "event");
  assert.equal(c.area, "McDonald's · Portland"); assert.equal(c.area.includes("Seattle"), false);
  t.events[0].place = "McDonald's, 100 Main St, Portland, OR";
  c = planningContext(t, "account", "2027-01-02", "activity", "event");
  assert.equal(c.area, t.events[0].place); assert.equal(c.locationNote, "");
  t.events[0].place = "Gallery, Kyoto";
  assert.equal(planningContext(t, "account", "2027-01-02", "activity", "event").area, "Gallery, Kyoto");
});
test("candidate filtering records distinct rejection reasons", () => {
  const rejected = {};
  reviewCandidates([{ ...candidate(), facts: [] }, { ...candidate(), conflicts: ["Incompatible"] }, { ...candidate(), pricePerPersonCents: 4000 }], context(), ["https://venue.example/menu"], rejected);
  assert.deepEqual(rejected, { evidence: 1, conflicts: 1, budget: 1 });
});
test("external listing links encode venue names, preserve sourced Yelp business URLs and reject spoofed hosts", () => {
  const c = { ...candidate(), name: "Café & Bakery", address: "100 Main St, Portland, OR" };
  const links = nearbyListingLinks(c, context());
  assert.equal(new URL(links.maps).searchParams.get("api"), "1");
  assert.equal(new URL(links.maps).searchParams.get("query"), "Café & Bakery 100 Main St, Portland, OR");
  assert.equal(new URL(links.yelp).searchParams.get("find_desc"), "Café & Bakery");
  assert.equal(links.yelpIsListing, false);
  const direct = "https://www.yelp.com/biz/cafe-bakery-portland";
  c.facts[0].sourceUrl = direct;
  assert.equal(nearbyListingLinks(c, context()).yelp, direct);
  for (const spoof of ["https://yelp.com.evil.example/biz/a", "https://yelp.com@evil.example/biz/a", "javascript:alert(1)"]) assert.equal(isYelpSource(spoof), false);
  c.facts[0].sourceUrl = "https://yelp.com.evil.example/biz/a";
  assert.equal(nearbyListingLinks(c, context()).yelpIsListing, false);
  const ambiguous = nearbyListingLinks({ ...c, address: "Address needs confirmation from the venue" }, context());
  assert.equal(new URL(ambiguous.yelp).searchParams.get("find_loc"), "Portland");
});
