import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildIndex, searchIndex, mergePlaces, normalize, searchWorldwide } from './destination-search.ts';
import { destinationTimeZone } from './destination-timezones.ts';
const index = buildIndex(JSON.parse(readFileSync(new URL('../public/data/destinations.json', import.meta.url), 'utf8')));

test('a state query suggests its cities with complete, unambiguous labels', () => {
  const {places, regionMatch} = searchIndex(index, 'Florida');
  assert.equal(regionMatch, true);
  assert.ok(places.some(p=>p.label === 'Tampa, Florida, United States'));
  assert.ok(places.filter(p=>p.kind === 'City').every(p=>p.region === 'US.FL'));
});
test('country and region searches cover different continents', () => {
  for (const [query, city] of [['Japan','Tokyo'],['Kenya','Nairobi'],['Queensland','Brisbane'],['Maharashtra','Mumbai'],['Brazil','Sao Paulo']]) {
    assert.ok(searchIndex(index,query).places.some(p=>p.name===city), `${query} should include ${city}`);
  }
});
test('accents, aliases, local scripts and partially typed names are searchable', () => {
  assert.equal(normalize('São Paulo'),'sao paulo');
  assert.ok(searchIndex(index,'São Paulo').places.some(p=>p.name === 'Sao Paulo'));
  assert.ok(searchIndex(index,'台北').places.some(p=>p.name === 'Taipei'));
  assert.ok(searchIndex(index,'Tamp').places.some(p=>p.name === 'Tampa'));
  assert.ok(searchIndex(index,'Tampa Florida').places.some(p=>p.name === 'Tampa'));
});
test('merged results do not repeat identical full locations', () => {
  const place = searchIndex(index, 'Tampa').places[0];
  assert.equal(mergePlaces([place],[place]).length,1);
});
test('live search sends only a bounded place query and handles failures', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get('q'),'Hallstatt');
      assert.equal(url.searchParams.get('limit'),'8');
      assert.ok(init?.signal);
      return new Response(JSON.stringify({features:[{properties:{name:'Hallstatt',state:'Upper Austria',country:'Austria',type:'city'}}]}));
    };
    const result = await searchWorldwide('Hallstatt',new AbortController().signal);
    assert.equal(result[0].label,'Hallstatt, Upper Austria, Austria');
    globalThis.fetch = async () => new Response('',{status:503});
    await assert.rejects(searchWorldwide('Hallstatt',new AbortController().signal));
  } finally { globalThis.fetch = original; }
});
test('a state uses the selected state coordinates instead of a same-named town', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async input => {
      const url = new URL(String(input));
      if (url.hostname === 'photon.komoot.io')
        return new Response(JSON.stringify({features:[
          {properties:{name:'Michigan', state:'North Dakota', country:'United States', type:'city'},geometry:{coordinates:[-98.1,48.0]}},
          {properties:{name:'Michigan', country:'United States', type:'state'},geometry:{coordinates:[-84.68,43.62]}},
        ]}));
      assert.equal(url.hostname, 'api.open-meteo.com');
      assert.equal(url.searchParams.get('longitude'), '-84.68');
      return new Response(JSON.stringify({timezone:'America/Detroit'}));
    };
    assert.equal(await destinationTimeZone('Michigan, United States'), 'America/Detroit');
  } finally { globalThis.fetch = original; }
});
