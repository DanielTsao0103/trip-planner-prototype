import test from 'node:test';
import assert from 'node:assert/strict';
import {locationQuery,locationSearchKey,resolveSearchFocus,meetingPlacesFromResponse,searchMeetingPlaces} from './event-location-search.ts';

test('meeting instructions are reduced to a worldwide place query',()=>{
 assert.equal(locationQuery(' meet at the Eiffel Tower '),'the Eiffel Tower');
 assert.equal(locationQuery('meet me at Shibuya Station'),'Shibuya Station');
 assert.equal(locationQuery('221B Baker Street'),'221B Baker Street');
 assert.equal(locationQuery('東京駅'),'東京駅');
});
test('landmarks include full addresses and street addresses work without a business name',()=>{
 const found=meetingPlacesFromResponse({features:[{properties:{name:'Eiffel Tower',street:'Avenue Anatole France',housenumber:'5',city:'Paris',country:'France',osm_id:1,osm_type:'W'}},{properties:{street:'Baker Street',housenumber:'221B',city:'London',country:'United Kingdom',osm_id:2,osm_type:'N'}}]});
 assert.equal(found[0].label,'Eiffel Tower, 5 Avenue Anatole France, Paris, France');
 assert.equal(found[1].label,'221B Baker Street, London, United Kingdom');
});
test('unusable, duplicate and over-limit suggestions are excluded without truncating saved labels',()=>{
 assert.equal(meetingPlacesFromResponse({features:[null,{properties:{}},{properties:{name:'x'.repeat(221)}},{properties:{name:'Tokyo',city:'Tokyo',country:'Japan'}},{properties:{name:'Tokyo',city:'Tokyo',country:'Japan'}}]}).length,1);
 assert.throws(()=>meetingPlacesFromResponse({}));
});
test('search includes all place/address layers with no geography restriction and propagates cancellation',async()=>{
 const original=globalThis.fetch,controller=new AbortController();
 try{
  globalThis.fetch=async(input,options)=>{
   const url=new URL(String(input));assert.equal(url.searchParams.get('q'),'Eiffel Tower');assert.equal(url.searchParams.has('layer'),false);assert.equal(url.searchParams.has('countrycode'),false);assert.equal(url.searchParams.has('bbox'),false);assert.equal(options?.signal,controller.signal);
   return new Response(JSON.stringify({features:[]}));
  };
  assert.deepEqual(await searchMeetingPlaces('meet at Eiffel Tower',controller.signal),[]);
  globalThis.fetch=async()=>new Response('',{status:503});await assert.rejects(searchMeetingPlaces('Eiffel Tower',controller.signal));
 }finally{globalThis.fetch=original;}
});


test('destination bias changes ranking without excluding worldwide results',async()=>{
 const original=globalThis.fetch,signal=new AbortController().signal;
 const focus={latitude:33.427,longitude:-117.612,zoom:12,approximate:false};
 try{
  globalThis.fetch=async(input)=>{
   const url=new URL(String(input));
   assert.equal(url.searchParams.get('lat'),'33.427');assert.equal(url.searchParams.get('lon'),'-117.612');
   assert.equal(url.searchParams.has('bbox'),false);assert.equal(url.searchParams.has('countrycode'),false);
   return new Response(JSON.stringify({features:[
    {properties:{name:'T Street Beach',city:'Other city',country:'Mexico',osm_id:11},geometry:{coordinates:[-99,19]}},
    {properties:{name:'T Street Beach',city:'San Clemente',state:'California',country:'United States',osm_id:12},geometry:{coordinates:[-117.617,33.416]}}
   ]}));
  };
  const results=await searchMeetingPlaces('T Street',signal,focus);
  assert.match(results[0].label,/San Clemente/);assert.ok(results.some(result=>result.label.includes('Mexico')));
 }finally{globalThis.fetch=original;}
});
test('trip destinations resolve to geographic focus points and are cached',async()=>{
 const original=globalThis.fetch,signal=new AbortController().signal;let calls=0;
 try{
  globalThis.fetch=async(input)=>{calls++;const url=new URL(String(input));assert.equal(url.searchParams.get('q'),'San Clemente, California, US (test)');return new Response(JSON.stringify({features:[{properties:{name:'San Clemente',type:'city'},geometry:{coordinates:[-117.612,33.427]}}]}));};
  const focus=await resolveSearchFocus('San Clemente, California, US (test)',signal);
  assert.equal(focus?.latitude,33.427);assert.equal(focus?.longitude,-117.612);
  await resolveSearchFocus('San Clemente, California, US (test)',signal);assert.equal(calls,1);
 }finally{globalThis.fetch=original;}
});
test('informal directional regions use an approximate parent region focus',async()=>{
 const original=globalThis.fetch,signal=new AbortController().signal;
 try{
  globalThis.fetch=async(input)=>{const q=new URL(String(input)).searchParams.get('q');return new Response(JSON.stringify({features:q==='Southern California (test)'?[]:[{properties:{name:'California (test)',type:'state',extent:[-125,42,-114,32]},geometry:{coordinates:[-119,37]}}]}));};
  const focus=await resolveSearchFocus('Southern California (test)',signal);
  assert.equal(focus?.approximate,true);assert.equal(focus?.latitude,34.5);assert.equal(focus?.zoom,7);
 }finally{globalThis.fetch=original;}
});
test('cache keys isolate destinations and preserve meaningful address punctuation',()=>{
 assert.notEqual(locationSearchKey('T Street','Paris'),locationSearchKey('T Street','San Clemente'));
 assert.notEqual(locationSearchKey('12/3 Main Street','Paris'),locationSearchKey('123 Main Street','Paris'));
 assert.equal(locationSearchKey(' T Street ','PARIS'),locationSearchKey('t street','paris'));
});

test('exact building points keep longitude and latitude in the right order and ambiguous addresses require a choice', async () => {
  const { exactAddressPoint } = await import('./event-location-search.ts');
  const building = { properties: {name:'Museum', housenumber:'221B', street:'Baker Street',city:'London',country:'United Kingdom'}, geometry:{coordinates:[-0.15847,51.52376]} };
  const matches = meetingPlacesFromResponse({features:[building]});
  assert.deepEqual(exactAddressPoint('221B Baker Street, London', matches), {lat:51.52376,lng:-0.15847});
  assert.equal(exactAddressPoint('221 Baker Street, London', matches),null);
  assert.equal(exactAddressPoint('221B Baker Street, Seattle', matches),null);
  assert.equal(exactAddressPoint('221B Baker Street, London', [...matches,...matches]),null);
  assert.equal(meetingPlacesFromResponse({features:[{...building,geometry:{coordinates:[51,200]}}]})[0].point,null);
});
