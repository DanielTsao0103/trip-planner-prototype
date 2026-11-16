import { test } from 'node:test';
import assert from 'node:assert/strict';
import { googlePlaceResults, hasLocatedPlace, searchNearbyPlaces, suggestionLocationParams } from './nearby-places.ts';
import { planningContext } from '../supabase/functions/_shared/nearby.ts';
const trip = {id:'trip',start:'2027-05-01',end:'2027-05-03',zone:'UTC',destinations:['Seattle'],members:[{id:'a',role:'Owner',status:'accepted'}],prefs:{},events:[],expenses:[],budget:null,budgetMode:'group',individual:{}};
const context = planningContext(trip, 'a', '2027-05-01', 'lunch', undefined, new Date('2026-11-16'));
const place = {id:'ChIJ_test',displayName:{text:'Fixture Cafe'},formattedAddress:'123 Example St, Seattle, WA',location:{latitude:47.6,longitude:-122.3},businessStatus:'OPERATIONAL',regularOpeningHours:{weekdayDescriptions:['Monday: 9 AM–5 PM']},websiteUri:'https://example.com/cafe'};
test('Google places keep exact identity, address and published hours together',()=>{
 const results=googlePlaceResults({places:[place]},context);
 assert.equal(results.length,1); const result=results[0];
 assert.equal(result.name,'Fixture Cafe'); assert.equal(result.address,place.formattedAddress);
 assert.equal(result.googlePlaceId,place.id); assert.deepEqual(result.point,{lat:47.6,lng:-122.3});
 assert.equal(result.addressVerified,true); assert.equal(result.kind,undefined);
 assert.deepEqual(result.openingHours,['Monday: 9 AM–5 PM']);
 assert.ok(result.facts[0].sourceUrl.includes('query_place_id=ChIJ_test')); assert.ok(hasLocatedPlace(result));
 assert.equal(result.pricePerPersonCents,null);
});
test('closed, incomplete and invalid provider locations never become schedulable',()=>{
 assert.deepEqual(googlePlaceResults({places:[{...place,businessStatus:'CLOSED_PERMANENTLY'},{...place,formattedAddress:''},{...place,location:{latitude:Infinity,longitude:0}},{...place,id:'places/x'}]},context),[]);
 assert.equal(hasLocatedPlace({...googlePlaceResults({places:[place]},context)[0],kind:'dish'}),false);
 assert.equal(hasLocatedPlace({...googlePlaceResults({places:[place]},context)[0],point:undefined,googlePlaceId:undefined,addressVerified:false}),false);
});
test('untrusted event URLs cannot inject invalid map coordinates or provider paths',()=>{
 assert.deepEqual(suggestionLocationParams(new URLSearchParams('lat=0&lng=-122.3&googlePlaceId=ChIJ_test')),{point:{lat:0,lng:-122.3},googlePlaceId:'ChIJ_test'});
 for(const value of ['lat=91&lng=0','lat=&lng=0','lat=Infinity&lng=0','lng=0'])assert.equal(suggestionLocationParams(new URLSearchParams(value)).point,null);
 assert.equal(suggestionLocationParams(new URLSearchParams('googlePlaceId=places/x')).googlePlaceId,null);
});
test('one direct request searches the supplied current location without a paid fallback',async()=>{
 const calls:{url:string;body:any;key:string|null}[]=[];
 const results=await searchNearbyPlaces(context,{label:'Current location',point:{lat:25.03,lng:121.56}},new AbortController().signal,'demo-only',async(input,init)=>{
  calls.push({url:String(input),body:JSON.parse(String(init?.body)),key:new Headers(init?.headers).get('X-Goog-Api-Key')}); return Response.json({places:[place]});
 });
 assert.equal(results.length,1);assert.equal(calls.length,1);assert.ok(calls[0].url.endsWith('searchNearby'));
 assert.equal(calls[0].key,'demo-only');assert.deepEqual(calls[0].body.locationRestriction.circle.center,{latitude:25.03,longitude:121.56});
 let failureCalls=0; await assert.rejects(searchNearbyPlaces(context,undefined,new AbortController().signal,'demo-only',async()=>{failureCalls++;return new Response('',{status:429});}));assert.equal(failureCalls,1);
});
test('dietary search terms stay within the requested coordinate region',async()=>{
 const dietary={...context,diet:['Vegan']};let body:any;let endpoint='';
 await searchNearbyPlaces(dietary,{label:'Current location',point:{lat:25.03,lng:121.56}},new AbortController().signal,'demo-only',async(input,init)=>{endpoint=String(input);body=JSON.parse(String(init?.body));return Response.json({places:[]});});
 assert.ok(endpoint.endsWith('searchText'));assert.match(body.textQuery,/Vegan/u);assert.ok(body.locationRestriction.rectangle);assert.equal(body.locationBias,undefined);
 assert.ok(body.locationRestriction.rectangle.low.latitude<25.03);assert.ok(body.locationRestriction.rectangle.high.latitude>25.03);
});
test('malformed individual provider items do not discard valid places',()=>{
 assert.equal(googlePlaceResults({places:[null,12,{},place]},context).length,1);
});

test('malformed provider attributions retain the valid venue and safe attribution',()=>{
 const results=googlePlaceResults({places:[{...place,attributions:[null,12,'bad',{}, {provider:'Venue directory',providerUri:'https://example.com/credit'},{provider:'Unsafe URL',providerUri:'javascript:alert(1)'}]}]},context);
 assert.equal(results.length,1);assert.equal(results[0].googlePlaceId,place.id);assert.ok(hasLocatedPlace(results[0]));
 assert.deepEqual(results[0].attributions,[{displayName:'Venue directory',uri:'https://example.com/credit'},{displayName:'Unsafe URL'}]);
});

const closedSaturday=[{open:{day:0,hour:11},close:{day:0,hour:15}}];
const openSaturday=[{open:{day:6,hour:11},close:{day:6,hour:15}}];
const timedVenue=(index:number,periods:unknown)=>({...place,id:`ChIJtimed${index}`,displayName:{text:`Venue ${index}`},formattedAddress:`${index} Different St, Seattle`,timeZone:{id:'UTC'},regularOpeningHours:{periods}});
test('usable opening hours are considered before the three-result limit',()=>{
 const results=googlePlaceResults({places:[0,1,2,3,4,5].map(index=>timedVenue(index,index<3?closedSaturday:openSaturday))},context);
 assert.deepEqual(results.map(result=>result.name),['Venue 3','Venue 4','Venue 5']);
 assert.ok(results.every(result=>result.proposedTime?.start==='11:00'));
});
test('unknown hours remain useful and all-closed results remain reviewable',()=>{
 const mixed=googlePlaceResults({places:[timedVenue(0,closedSaturday),timedVenue(1,closedSaturday),timedVenue(2,closedSaturday),timedVenue(3,undefined),timedVenue(4,openSaturday)]},context);
 assert.deepEqual(mixed.map(result=>result.name),['Venue 4','Venue 3','Venue 0']);
 assert.equal(mixed[1].openingWindows,undefined);assert.ok(mixed[1].proposedTime);assert.equal(mixed[2].proposedTime,null);
 const closed=googlePlaceResults({places:[0,1,2,3].map(index=>timedVenue(index,closedSaturday))},context);
 assert.equal(closed.length,3);assert.ok(closed.every(result=>result.proposedTime===null&&hasLocatedPlace(result)));
});
