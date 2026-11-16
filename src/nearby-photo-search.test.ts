import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestionPhotoSearch } from "./nearby-photo-search.ts";

test("shrine photo queries never inherit an earlier McDonald's stop", () => {
  const plan = suggestionPhotoSearch({name:"Meiji Shrine",address:"Address needs confirmation from the venue"},["Tokyo, Japan"],"McDonald's · Tokyo, Japan");
  assert.equal(plan.exact,"Meiji Shrine Tokyo, Japan");
  assert.equal(plan.category,"temple shrine Tokyo, Japan");
  assert.equal(plan.area,"Tokyo, Japan city landscape");
  assert.equal(plan.matchesSubject("McDonald's restaurant in Tokyo"),false);
  assert.equal(plan.matchesSubject("Torii gates at a Shinto shrine"),false);
  assert.equal(plan.matchesSubject("Meiji Shrine in Tokyo"),true);
  assert.equal(plan.matchesSubject("Meiji Shrine in Kyoto"),false);
  assert.equal(plan.matchesArea("McDonald's logo above the Tokyo city street"),false);
  assert.equal(plan.matchesArea("Tokyo city skyline at sunset"),true);
  assert.equal(plan.matchesArea("Seattle city skyline at sunset"),false);
});
test("the suggested address takes precedence over another city's planning anchor", () => {
  const plan=suggestionPhotoSearch({name:"Fushimi Inari Shrine",address:"68 Fukakusa, Kyoto, Japan"},["Tokyo, Japan","Kyoto, Japan"],"McDonald's, Tokyo, Japan");
  assert.equal(plan.location,"Kyoto, Japan"); assert.doesNotMatch(plan.exact,/Tokyo|McDonald/);
});
test("guides use geographic imagery and unknown locations never reuse venue anchors", () => {
  const guide=suggestionPhotoSearch({name:"Tokyo gardens guide",address:"Tokyo",kind:"guide"},["Tokyo"],"McDonald's, Tokyo");
  assert.equal(guide.exact,""); assert.equal(guide.category,""); assert.equal(guide.area,"Tokyo city landscape");
  const unknown=suggestionPhotoSearch({name:"Shrine",address:"Address needs confirmation from the venue"},[],"McDonald's");
  assert.equal(unknown.area,""); assert.doesNotMatch(unknown.exact,/McDonald/);
});
