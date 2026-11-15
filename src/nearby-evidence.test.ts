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
