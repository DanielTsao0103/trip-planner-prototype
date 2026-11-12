import test from 'node:test';
import assert from 'node:assert/strict';
import { destinationTimeZone } from './destination-timezones.ts';

// A timeout in the optional coordinate provider must leave the name lookup usable.
test('a hung coordinate lookup falls through without aborting the destination request', async () => {
  const original = globalThis.fetch;
  const parent = new AbortController();
  const requests: string[] = [];
  globalThis.fetch = async input => {
    const url = String(input); requests.push(url);
    if (url.includes('photon.')) return new Promise<Response>(() => {});
    return Response.json({results:[{name:'Testhaven',timezone:'Europe/Paris'}]});
  };
  try {
    assert.equal(await destinationTimeZone('Testhaven, France', parent.signal), 'Europe/Paris');
    assert.equal(parent.signal.aborted, false);
    assert.equal(requests.length, 2);
  } finally { globalThis.fetch = original; }
});

test('an unavailable timezone is not cached as a permanent failure', async () => {
  const original = globalThis.fetch;
  let attempt = 0;
  globalThis.fetch = async () => Response.json({results:++attempt === 1 ? [] : [{name:'Retryhaven',timezone:'Asia/Taipei'}]});
  try {
    assert.equal(await destinationTimeZone('Retryhaven'), null);
    assert.equal(await destinationTimeZone('Retryhaven'), 'Asia/Taipei');
    assert.equal(attempt, 2);
  } finally { globalThis.fetch = original; }
});
