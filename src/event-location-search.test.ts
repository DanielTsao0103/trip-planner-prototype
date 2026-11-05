import test from 'node:test';
import assert from 'node:assert/strict';
import {locationQuery,meetingPlacesFromResponse,searchMeetingPlaces} from './event-location-search.ts';

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
