import test from 'node:test';
import assert from 'node:assert/strict';
import { googleLocationResults } from './google-location-results.ts';

function place(address:string,types:string[],partial=false,components:google.maps.GeocoderAddressComponent[]=[]) {
  return {place_id:'stable-place',formatted_address:address,types,partial_match:partial,address_components:components} as google.maps.GeocoderResult;
}
const city={long_name:'Seattle',short_name:'Seattle',types:['locality','political']};
test('a business query cannot fall back to a city or a similarly spelled town',()=>{
  assert.deepEqual(googleLocationResults([place('Seattle, WA',['locality'],true,[city])],'Starbucks Seattle'),[]);
  assert.deepEqual(googleLocationResults([place('Effie, LA',['locality'],false,[{...city,long_name:'Effie',short_name:'Effie'}])],'Eiffe'),[]);
  assert.equal(googleLocationResults([place('Seattle, WA',['locality'],false,[city])],'Seattle').length,1);
});
test('exact address fallback retains a stable place ID without persisting provider coordinates',()=>{
  const result=googleLocationResults([place('221B Baker St, London',['street_address'])],'221B Baker Street London');
  assert.equal(result[0].googlePlaceId,'stable-place');assert.equal(result[0].point,null);
  assert.equal(result[0].label,'221B Baker St, London');
  assert.deepEqual(googleLocationResults([place('Baker St, London',['route'])],'221B Baker Street London'),[]);
});
test('landmark and non-Latin results stay selectable without an invented business name',()=>{
  const result=googleLocationResults([place('Tokyo Station, Tokyo, Japan',['establishment','train_station'])],'東京駅');
  assert.equal(result[0].name,'Tokyo Station, Tokyo, Japan');
  assert.deepEqual(googleLocationResults([{types:['street_address']} as google.maps.GeocoderResult],'address'),[]);
});
