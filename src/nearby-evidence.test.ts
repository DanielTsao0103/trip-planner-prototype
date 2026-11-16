import { test } from "node:test";
import assert from "node:assert/strict";
import { supportedFacts } from "../supabase/functions/nearby-suggestions/providers.ts";

const source = (title: string, content: string) => ({ url: "https://tourism.example/place", title, content });
const candidate = (name: string, quote: string) => ({ name, address: "", reason: "An option", durationMinutes: 60, pricePerPersonCents: null, currency: null, concerns: [], conflicts: [], facts: [{ topic: "Venue", quote, detail: quote, sourceUrl: "https://tourism.example/place" }] });

test("short Chinese evidence retains a canonical venue name from a bilingual display", () => {
  const evidence = source("美好美快餐", "美好美快餐，供應早餐，鄰近博物館。");
  const [result] = supportedFacts([candidate("Mei Hao Mei (美好美快餐)", "供應早餐")], [evidence]);
  assert.equal(result.name, "美好美快餐");
  assert.equal(result.facts.length, 1);
  assert.equal(result.facts[0].detail, "供應早餐");
});

test("unsupported translated names and fabricated Chinese quotes remain unsupported", () => {
  const evidence = source("美好美快餐", "美好美快餐，供應早餐，鄰近博物館。");
  assert.equal(supportedFacts([candidate("Mei Hao Mei", "供應早餐")], [evidence])[0].facts.length, 0);
  assert.equal(supportedFacts([candidate("美好美快餐", "無麩質早餐")], [evidence])[0].facts.length, 0);
  assert.equal(supportedFacts([candidate("美好美快餐", "早餐")], [evidence])[0].facts.length, 0);
});

test("canonical venue typography can use normalized punctuation and width", () => {
  const evidence = source("Café（台北店）", "Café（台北店）供應精選咖啡。");
  assert.equal(supportedFacts([candidate("Café (台北店)", "供應精選咖啡")], [evidence])[0].facts.length, 1);
});

test("walking activities and verified trail lengths retain exact source evidence", () => {
  const evidence = source("Riverside Park", "Riverside Park has a 2 km walking trail along the river.");
  const quote = "Riverside Park has a 2 km walking trail along the river.";
  assert.equal(supportedFacts([candidate("Riverside Park", quote)], [evidence])[0].facts.length, 1);
});

test("itinerary route claims and unrelated venue facts remain rejected", () => {
  const quote = "Riverside Park is a 10 minute walk from your hotel.";
  const evidence = source("Riverside Park", quote);
  assert.equal(supportedFacts([candidate("Riverside Park", quote)], [evidence])[0].facts.length, 0);
  assert.equal(supportedFacts([candidate("Invented Park", quote)], [evidence])[0].facts.length, 0);
});


test("an address belongs to the cited venue rather than another search result", () => {
  const first = { url: "https://venue.example/one", title: "Museum One", content: "Museum One offers painting exhibits. Visit us at 100 Main Street, Seattle." };
  const second = { url: "https://venue.example/two", title: "Museum Two", content: "Museum Two is located at 900 Other Street, Seattle." };
  const raw = { ...candidate("Museum One", "Museum One offers painting exhibits."), address: "900 Other Street, Seattle", facts: [{ topic: "Venue", quote: "Museum One offers painting exhibits.", sourceUrl: first.url }] };
  const rejected = supportedFacts([raw], [first, second])[0];
  assert.equal(rejected.addressVerified, false); assert.equal(rejected.address, "");
  const correct = supportedFacts([{ ...raw, address: "100 Main Street, Seattle" }], [first, second])[0];
  assert.equal(correct.addressSourced, true); assert.equal(correct.addressVerified, false); assert.equal(correct.address, "100 Main Street, Seattle");
  const list = { ...first, title: "Attractions guide", content: first.content + " A scenic area is nearby. ".repeat(20) + second.content };
  assert.equal(supportedFacts([raw], [list])[0].addressSourced, false);
});

test("generated coordinates and Google identities cannot masquerade as provider metadata", () => {
  const evidence = source("Riverside Park", "Riverside Park has a walking trail along the river.");
  const result = supportedFacts([{ ...candidate("Riverside Park", evidence.content), point: { lat: 0, lng: 0 }, googlePlaceId: "invented", website: "https://invented.example", openingHours: ["Open 24 hours"] }], [evidence])[0];
  assert.equal(result.point, undefined); assert.equal(result.googlePlaceId, undefined);
  assert.equal(result.website, undefined); assert.equal(result.openingHours, undefined);
});


test("Hours evidence must contain actual opening or closing information", () => {
  const evidence = source("Museum One", "Museum One. Free Things to Do in Provo, Utah. Monday - Saturday 10:00 am - 9:00 pm. Closed on Sunday.");
  const facts = ["Museum One.", "Free Things to Do in Provo, Utah.", "Monday - Saturday 10:00 am - 9:00 pm.", "Closed on Sunday."].map(quote => ({topic:"Hours",quote,sourceUrl:evidence.url}));
  const result = supportedFacts([{...candidate("Museum One", evidence.content),facts}], [evidence])[0];
  assert.deepEqual(result.facts.map(fact=>fact.detail), ["Monday - Saturday 10:00 am - 9:00 pm.", "Closed on Sunday."]);
});

test("a quoted third-party address remains unverified until a real Maps selection", () => {
  const evidence = source("City Temple", "City Temple is listed at 1 North University Avenue, Provo, Utah.");
  const result = supportedFacts([{...candidate("City Temple",evidence.content),address:"1 North University Avenue, Provo, Utah",addressVerified:true}], [evidence])[0];
  assert.equal(result.addressSourced,true); assert.equal(result.addressVerified,false);
  assert.equal(result.address,"1 North University Avenue, Provo, Utah");
});
