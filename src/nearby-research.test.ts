import { test } from "node:test";
import assert from "node:assert/strict";
import { planningContext, parseSearchLocation, reviewCandidates, nearbyListingLinks, isYelpSource, type PlanningTrip, type Candidate } from "../supabase/functions/_shared/nearby.ts";
const trip = (): PlanningTrip => ({
  id: "trip", start: "2027-01-01", end: "2027-01-03", zone: "America/Los_Angeles", destinations: ["Seattle", "Portland"],
  members: [{ id: "a", role: "Owner", status: "accepted" }, { id: "b", accountId: "account", role: "Viewer", status: "accepted" }, { id: "removed", role: "Viewer", status: "removed" }],
  prefs: Object.fromEntries(["a", "b", "removed"].map((id, i) => [id, { diet: i === 1 ? ["Peanut avoidance"] : [], access: i === 0 ? ["Step-free"] : [], walk: i === 0 ? 300 : 1000, interests: ["Art"], food: "Local", spending: "Moderate", dining: "Casual", atmosphere: "Quiet", destinations: "", tickets: "", notes: "" }])),
  events: [{ id: "event", name: "Museum", date: "2027-01-02", start: "10:00", end: "12:00", place: "Museum, Portland", cost: 2000, attendees: ["a", "b"] }],
  expenses: [{ amount: 1000, shares: { a: 500, b: 500 } }], budget: 10000, budgetMode: "group", individual: {},
});
const context = () => planningContext(trip(), "account", "2027-01-02", "lunch", undefined, new Date("2026-12-01T12:00:00Z"));
const candidate = (): Candidate => ({ name: "Real candidate", address: "A published street address", reason: "Near the museum", recommendationType: "dish", durationMinutes: 60, pricePerPersonCents: 2000, currency: "USD", facts: [{ topic: "Menu", detail: "Published menu", sourceUrl: "https://venue.example/menu" }], concerns: [], conflicts: [] });
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
  assert.equal(results[0].kind, "dish");
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
test("Find intent rejects recommendation types that do not match its category", () => {
  const result = reviewCandidates([{ ...candidate(), recommendationType: "activity" }], context(), ["https://venue.example/menu"]);
  assert.deepEqual(result, []);
});
test("external listing links encode venue names, preserve sourced Yelp business URLs and reject spoofed hosts", () => {
  const c = { ...candidate(), recommendationType: undefined, name: "Café & Bakery", address: "100 Main St, Portland, OR" };
  const links = nearbyListingLinks(c, context());
  assert.equal(links.maps, null);
  assert.equal(new URL(links.google).searchParams.get("q"), "Café & Bakery 100 Main St, Portland, OR");
  assert.equal(new URL(links.yelp!).searchParams.get("find_desc"), "Café & Bakery");
  assert.equal(links.yelpIsListing, false);
  const direct = "https://www.yelp.com/biz/cafe-bakery-portland";
  c.facts[0].sourceUrl = direct;
  assert.equal(nearbyListingLinks(c, context()).yelp, direct);
  for (const spoof of ["https://yelp.com.evil.example/biz/a", "https://yelp.com@evil.example/biz/a", "javascript:alert(1)"]) assert.equal(isYelpSource(spoof), false);
  c.facts[0].sourceUrl = "https://yelp.com.evil.example/biz/a";
  assert.equal(nearbyListingLinks(c, context()).yelpIsListing, false);
  const ambiguous = nearbyListingLinks({ ...c, address: "Address needs confirmation from the venue" }, context());
  assert.equal(new URL(ambiguous.yelp!).searchParams.get("find_loc"), "Portland");
  const anchored = nearbyListingLinks({ ...c, name: "Meiji Shrine", address: "Address needs confirmation from the venue" }, { area: "McDonald's · Tokyo", destinations: ["Tokyo"] });
  assert.equal(new URL(anchored.google).searchParams.get("q"), "Meiji Shrine Tokyo");
  const map = "https://www.google.com/maps/place/Meiji+Shrine/";
  assert.equal(nearbyListingLinks({ ...c, facts: [{topic:"Venue",detail:"Shrine",sourceUrl:map}] }, context()).maps, map);
  assert.equal(nearbyListingLinks({ ...c, facts: [{topic:"Venue",detail:"Shrine",sourceUrl:"https://www.google.com.evil.example/maps/place/Shrine"}] }, context()).maps, null);
  const guide = nearbyListingLinks({ ...c, kind: "guide" }, context());
  assert.equal(guide.maps, null); assert.equal(guide.yelp, null);
  assert.equal(new URL(guide.google).searchParams.get("q"), c.name);
  const dish = nearbyListingLinks({ ...c, name: "Café & Bakery", address: "Food idea · choose a local restaurant", kind: "dish" }, context());
  assert.equal(dish.maps, null); assert.equal(dish.yelp, null);
  assert.equal(new URL(dish.google).searchParams.get("q"), "Café & Bakery Portland");
});

test('nearby availability reserves overnight continuations and counts their cost once', () => {
  const value=trip();
  value.events=[{...value.events[0],date:'2027-01-01',endDate:'2027-01-02',start:'22:00',end:'13:00'}];
  const result=planningContext(value,'a','2027-01-02','lunch',undefined,new Date('2026-12-01T12:00:00Z'));
  assert.deepEqual(result.gaps,[{start:'13:30',end:'15:00'}]);
  assert.equal(result.remainingGroupCents,7000);
  assert.equal(result.events[0].start,'00:00');
  value.events[0].end='00:00';
  assert.deepEqual(planningContext(value,'a','2027-01-02','lunch',undefined,new Date('2026-12-01T12:00:00Z')).gaps,[{start:'11:00',end:'15:00'}]);
});

test("explicit location overrides the itinerary anchor and validates coordinates", () => {
  const selected = parseSearchLocation({ label: "Harbor Park, Tokyo", point: { lat: 35.6, lng: 139.7 }, googlePlaceId: "ChI1234567" });
  const result = planningContext(trip(), "account", "2027-01-02", "activity", undefined, new Date("2026-12-01T12:00:00Z"), selected);
  assert.equal(result.area, "Harbor Park, Tokyo"); assert.equal(result.locationNote, ""); assert.deepEqual(result.searchLocation, selected);
  for (const value of [{ label: "" }, { label: "Point", point: { lat: Infinity, lng: 0 } }, { label: "Point", point: { lat: 0, lng: 181 } }, { label: "Point", googlePlaceId: "<script>" }]) assert.throws(() => parseSearchLocation(value));
});

test("restaurant recommendations preserve the associated street address", () => {
  const place = { ...candidate(), name: "Harbor Cafe", recommendationType: "place" as const, address: "100 Main Street, Portland", addressVerified: true };
  const result = reviewCandidates([place], context(), ["https://venue.example/menu"])[0];
  assert.equal(result.kind, undefined); assert.equal(result.address, place.address); assert.equal(result.addressVerified, true);

});


test("explicit current location preserves blocked overnight time and canonical costs", () => {
  const value=trip();
  value.events=[{...value.events[0],date:'2027-01-01',endDate:'2027-01-03',start:'22:00',end:'13:00'}];
  const location=parseSearchLocation({label:'Harbor Park, Tokyo',point:{lat:35.6,lng:139.7}});
  const middle=planningContext(value,'a','2027-01-02','activity',undefined,new Date('2026-12-01T12:00:00Z'),location);
  assert.equal(middle.area,location!.label); assert.deepEqual(middle.searchLocation,location);
  assert.deepEqual(middle.gaps,[]); assert.equal(middle.events[0].start,'00:00'); assert.equal(middle.events[0].end,'24:00');
  assert.equal(middle.remainingGroupCents,7000);
  const final=planningContext(value,'a','2027-01-03','lunch',undefined,new Date('2026-12-01T12:00:00Z'),location);
  assert.deepEqual(final.gaps,[{start:'13:30',end:'15:00'}]); assert.equal(final.remainingGroupCents,7000);
});
