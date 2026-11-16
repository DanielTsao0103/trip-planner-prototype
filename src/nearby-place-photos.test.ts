import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadNearbyPlacePhoto } from './nearby-place-photos.ts';

const place = {googlePlaceId:'ChIJExactVenue',name:'Dimsum Kitchen'};
const resource = 'places/ChIJExactVenue/photos/ExactPhoto_123';
const details = {id:place.googlePlaceId,photos:[{name:resource,authorAttributions:[{displayName:'Local photographer',uri:'//maps.google.com/maps/contrib/123'}]}]};
const media = {name:`${resource}/media`,photoUri:'https://lh3.googleusercontent.com/places/exact-photo'};
const json = (value:unknown,status=200) => new Response(JSON.stringify(value),{status});

test('exact place photo uses demo key, fresh resource, and complete safe attribution',async()=>{
  const calls:{url:string;init?:RequestInit}[]=[];
  const result=await loadNearbyPlacePhoto(place,new AbortController().signal,'demo-only',async(url,init)=>{
    calls.push({url:String(url),init});return json(calls.length===1?details:media);
  });
  assert.equal(calls.length,2);
  assert.equal(calls[0].url,`https://places.googleapis.com/v1/places/${place.googlePlaceId}`);
  assert.equal(new Headers(calls[0].init?.headers).get('X-Goog-FieldMask'),'id,photos');
  assert.equal(calls[1].url,`https://places.googleapis.com/v1/${resource}/media?maxWidthPx=720&skipHttpRedirect=true`);
  assert.ok(calls.every(call=>new Headers(call.init?.headers).get('X-Goog-Api-Key')==='demo-only'&&call.init?.cache==='no-store'));
  assert.deepEqual(result,{url:media.photoUri,alt:'Photo shared for Dimsum Kitchen on Google Maps',label:'Google Maps photo',attributions:[{name:'Local photographer',url:'https://maps.google.com/maps/contrib/123'}]});
});

test('invalid identity, missing key, and cancellation never start a provider lookup',async()=>{
  let calls=0;const fetcher:typeof fetch=async()=>{calls++;return json(details);};
  for(const id of [undefined,'../Other','ChIJ?id=other','a'.repeat(301)])assert.equal(await loadNearbyPlacePhoto({...place,googlePlaceId:id},new AbortController().signal,'demo-only',fetcher),undefined);
  assert.equal(await loadNearbyPlacePhoto(place,new AbortController().signal,'',fetcher),undefined);
  const controller=new AbortController();controller.abort();assert.equal(await loadNearbyPlacePhoto(place,controller.signal,'demo-only',fetcher),undefined);
  assert.equal(calls,0);
});

test('wrong-place photos, malformed attributions and missing photo resources never become area substitutes',async()=>{
  const invalid=[{id:'ChIJOther',photos:details.photos},{id:place.googlePlaceId,photos:[]},{...details,photos:[{...details.photos[0],name:'places/ChIJOther/photos/ExactPhoto_123'}]},
    {...details,photos:[{...details.photos[0],name:resource+'/../Other'}]},
    {...details,photos:[{name:resource}]},
    {...details,photos:[{name:resource,authorAttributions:[{displayName:'Author',uri:'javascript:alert(1)'}]}]}];
  for(const data of invalid){let calls=0;assert.equal(await loadNearbyPlacePhoto(place,new AbortController().signal,'demo-only',async()=>{calls++;return json(data);}),undefined);assert.equal(calls,1);}
});

test('quota and corrupt response failures make at most two calls with no provider fallback',async()=>{
  for(const failingStep of [1,2]){let calls=0;assert.equal(await loadNearbyPlacePhoto(place,new AbortController().signal,'demo-only',async()=>++calls===failingStep?json({},429):json(details)),undefined);assert.equal(calls,failingStep);}
  assert.equal(await loadNearbyPlacePhoto(place,new AbortController().signal,'demo-only',async()=>new Response('not json')),undefined);
});

test('media identity and image URLs cannot redirect to unrelated or executable content',async()=>{
  for(const image of [{...media,name:'places/ChIJOther/photos/Other/media'}, {...media,photoUri:'javascript:alert(1)'},{...media,photoUri:'https://googleusercontent.com.evil.example/photo'},{...media,photoUri:'https://user:pass@lh3.googleusercontent.com/photo'}]){
    let calls=0;assert.equal(await loadNearbyPlacePhoto(place,new AbortController().signal,'demo-only',async()=>json(++calls===1?details:image)),undefined);
  }
});

test('aborting an in-flight photo lookup settles even if a fetcher ignores its signal',async()=>{
  const controller=new AbortController();let started!:()=>void;const running=new Promise<void>(resolve=>{started=resolve;});
  const task=loadNearbyPlacePhoto(place,controller.signal,'demo-only',async()=>{started();return new Promise<Response>(()=>{});});
  await running;controller.abort();assert.equal(await task,undefined);
});

test('total photo lookup has a deadline even if the provider never resolves',async context=>{
  context.mock.timers.enable({apis:['setTimeout']});
  let started!:()=>void;const running=new Promise<void>(resolve=>{started=resolve;});
  const task=loadNearbyPlacePhoto(place,new AbortController().signal,'demo-only',async()=>{started();return new Promise<Response>(()=>{});});
  await running;context.mock.timers.tick(3500);assert.equal(await task,undefined);
});

test('later eligible photo can be used without dropping required author credits',async()=>{
  let calls=0;const data={...details,photos:[{name:resource,authorAttributions:[{displayName:''}]},details.photos[0]]};
  const result=await loadNearbyPlacePhoto(place,new AbortController().signal,'demo-only',async()=>json(++calls===1?data:media));assert.equal(result?.attributions.length,1);assert.equal(calls,2);
});
