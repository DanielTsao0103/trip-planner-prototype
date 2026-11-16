import { test } from "node:test";
import assert from "node:assert/strict";
import { distinctRecommendationThoughts, recommendationNotes, recommendationSlot, recommendationGroupCost, recommendationTitle, sentenceExcerpt } from "../supabase/functions/_shared/nearby-content.ts";
import type { NearbyResult } from "../supabase/functions/_shared/nearby.ts";
const context = {area:"McDonald's · Taipei, Taiwan",destinations:["Taipei, Taiwan"]};
const idea = (extra: Partial<NearbyResult> = {}): NearbyResult => ({name:"Museum",address:"Taipei",durationMinutes:60,reason:"Research",fitNote:"Same generic note.",pricePerPersonCents:null,currency:null,facts:[{topic:"Venue",detail:"The museum has local art collections.",sourceUrl:"https://example.com/museum"}],concerns:[],conflicts:[],status:"review",proposedTime:{start:"12:00",end:"13:00"},...extra});
test("guide excerpts stop at complete English and Chinese sentences",()=>{
  assert.equal(sentenceExcerpt("A complete sentence. Then a clipped frag"),"A complete sentence.");
  assert.equal(sentenceExcerpt("這是一個完整句子。後面是不完整的"),"這是一個完整句子。");
  const long="This is "+"a long descriptive phrase ".repeat(18)+"ending here.";
  assert.equal(sentenceExcerpt(long,100),long);
  assert.equal(sentenceExcerpt("An unfinished fragment with no ending"),"");
  assert.equal(sentenceExcerpt("A complete sentence. Then a clipped fragment..."),"A complete sentence.");
});
test("guide itinerary titles use the destination while notes retain the specific source",()=>{
  const guide=idea({kind:"guide",name:"Taipei gardens visitor guide",address:context.area,facts:[{topic:"Guide excerpt",detail:"The park has lakeside gardens. A clipped frag",sourceUrl:"https://example.com/gardens"}]});
  assert.equal(recommendationTitle(guide,context),"Taipei, Taiwan");
  const notes=recommendationNotes(guide,context);
  assert.ok(notes.includes("Taipei gardens visitor guide")); assert.ok(notes.includes("https://example.com/gardens"));
  assert.ok(notes.includes("The park has lakeside gardens.")); assert.equal(notes.includes("clipped frag"),false); assert.equal(notes.includes("McDonald's"),false);
});
test("repeated thoughts are replaced with option-specific evidence and note links are deduplicated",()=>{
  const [museum,garden]=distinctRecommendationThoughts([idea(),idea({name:"Garden",facts:[{topic:"Venue",detail:"The garden features water lilies.",sourceUrl:"https://example.com/garden"}]})]);
  assert.notEqual(museum.fitNote,garden.fitNote); assert.ok(garden.fitNote?.includes("water lilies"));
  const notes=recommendationNotes({...garden,facts:[...garden.facts,...garden.facts]},context);
  assert.equal(notes.split("https://example.com/garden").length-1,1);
});
test("adding multiple recommendations replaces stale proposed times with a free slot",()=>{
  assert.deepEqual(recommendationSlot(idea(),[{start:"13:30",end:"15:00"}]),{start:"13:30",end:"14:30"});
  assert.equal(recommendationSlot(idea(),[{start:"13:30",end:"14:00"}]),null);
});

test("direct itinerary costs reserve the whole group's supported estimate",()=>{
  assert.equal(recommendationGroupCost({currency:"USD",pricePerPersonCents:2000},4),8000);
  assert.equal(recommendationGroupCost({currency:"EUR",pricePerPersonCents:2000},4),0);
  assert.equal(recommendationGroupCost({currency:"USD",pricePerPersonCents:null},4),0);
});
