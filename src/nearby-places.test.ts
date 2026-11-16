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
 await searchNearbyPlaces(dietary,{label:'Current location',point:{lat:25.03,lng:121.56}},new AbortController().signal,'demo-only',async(input,init)=>{endpoint=String(input);body=JSON.parse(String(init?.body));return Response.json({places:[place]});});
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

test('selected autocomplete ID resolves through demo Places Details before scoped nearby search',async()=>{
 const calls:{url:string;key:string|null;fields:string|null;body:any}[]=[];
 const results=await searchNearbyPlaces(context,{label:'Shilin Elementary School, Taipei',googlePlaceId:'ChIJschool'},new AbortController().signal,'demo-only',async(input,init)=>{
  const url=String(input),headers=new Headers(init?.headers);calls.push({url,key:headers.get('X-Goog-Api-Key'),fields:headers.get('X-Goog-FieldMask'),body:init?.body?JSON.parse(String(init.body)):null});
  return url.endsWith('/places/ChIJschool')?Response.json({location:{latitude:25.093,longitude:121.523}}):Response.json({places:[place]});
 });
 assert.equal(results.length,1);assert.equal(calls.length,2);
 assert.ok(calls[0].url.endsWith('/places/ChIJschool'));assert.ok(calls[0].fields?.includes('location'));
 assert.ok(calls[1].url.endsWith(':searchNearby'));assert.deepEqual(calls[1].body.locationRestriction.circle.center,{latitude:25.093,longitude:121.523});
 assert.ok(calls.every(call=>call.key==='demo-only'));
});

test('dietary Text Search quota failure falls back within the same nearby circle without a paid key',async()=>{
 const calls:{url:string;key:string|null;body:any}[]=[];
 const results=await searchNearbyPlaces({...context,diet:['Vegan']},{label:'Shilin school',point:{lat:25.093,lng:121.523}},new AbortController().signal,'demo-only',async(input,init)=>{
  const url=String(input);calls.push({url,key:new Headers(init?.headers).get('X-Goog-Api-Key'),body:JSON.parse(String(init?.body))});
  return url.endsWith(':searchText')?new Response('',{status:429}):Response.json({places:[place]});
 });
 assert.equal(results.length,1);assert.equal(calls.length,2);assert.ok(calls[0].url.endsWith(':searchText'));assert.match(calls[0].body.textQuery,/Vegan/);
 assert.ok(calls[1].url.endsWith(':searchNearby'));assert.deepEqual(calls[1].body.locationRestriction.circle.center,{latitude:25.093,longitude:121.523});
 assert.ok(calls.every(call=>call.key==='demo-only'));
 assert.match([...results[0].concerns,results[0].fitNote||''].join(' '),/diet|Vegan|menu/i);
});

test('an aborted filtered search never starts a nearby fallback',async()=>{
 const controller=new AbortController();let calls=0;
 await assert.rejects(searchNearbyPlaces({...context,diet:['Vegan']},{label:'School',point:{lat:25.093,lng:121.523}},controller.signal,'demo-only',async()=>{calls++;controller.abort();throw new DOMException('Canceled','AbortError');}));
 assert.equal(calls,1);
});

test('failed nearby fallback does not retry with another key',async()=>{
 let calls=0;
 await assert.rejects(searchNearbyPlaces({...context,diet:['Vegan']},{label:'School',point:{lat:25.093,lng:121.523}},new AbortController().signal,'demo-only',async(_input,init)=>{calls++;assert.equal(new Headers(init?.headers).get('X-Goog-Api-Key'),'demo-only');return new Response('',{status:429});}));
 assert.equal(calls,2);
});

test('invalid selected-place detail coordinates never start an unrelated location search',async()=>{
 for(const location of [null,{}, {latitude:25.09,longitude:'121.52'}, {latitude:91,longitude:121.52}, {latitude:25.09,longitude:181}, {latitude:null,longitude:121.52}]){
  let calls=0;
  await assert.rejects(searchNearbyPlaces(context,{label:'School',googlePlaceId:'ChIJschool'},new AbortController().signal,'demo-only',async()=>{calls++;return Response.json({location});}));
  assert.equal(calls,1);
 }
});
test('an empty filtered Text Search tries nearby venues while retaining dietary confirmation',async()=>{
 const endpoints:string[]=[];
 const results=await searchNearbyPlaces({...context,diet:['Vegan']},{label:'School',point:{lat:25.093,lng:121.523}},new AbortController().signal,'demo-only',async(input)=>{
  endpoints.push(String(input));return Response.json({places:String(input).endsWith(':searchText')?[]:[place]});
 });
 assert.equal(results.length,1);assert.deepEqual(endpoints.map(url=>url.split(':').at(-1)),['searchText','searchNearby']);
 assert.match(results[0].concerns.join(' '),/diet|Vegan/i);
});

test('missing provider photo metadata skips unsupported demo photo lookups', () => {
 assert.equal(googlePlaceResults({places:[place]},context)[0].hasPhotos,false);
 assert.equal(googlePlaceResults({places:[{...place,photos:[{name:'places/ChIJ_test/photos/reference'}]}]},context)[0].hasPhotos,true);
});
