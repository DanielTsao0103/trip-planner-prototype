import test from 'node:test';
import assert from 'node:assert/strict';
import { searchRequest } from './search-request.ts';

test('a hung optional provider times out without cancelling the next provider', async () => {
  const parent = new AbortController();
  let child: AbortSignal | undefined;
  await assert.rejects(searchRequest(signal => { child=signal; return new Promise(()=>{}); },parent.signal,10), {name:'TimeoutError'});
  assert.equal(child?.aborted,true);
  assert.equal(parent.signal.aborted,false);
  assert.equal(await searchRequest(async()=> 'fallback results',parent.signal,100),'fallback results');
});

test('changing the query cancels a request even when the SDK ignores its signal', async () => {
  const parent = new AbortController();
  const pending = searchRequest(()=>new Promise(()=>{}),parent.signal,1000);
  parent.abort();
  await assert.rejects(pending,{name:'AbortError'});
});

test('an already cancelled query never starts another provider request', async () => {
  const parent = new AbortController();parent.abort();let called=false;
  await assert.rejects(searchRequest(async()=>{called=true;return [];},parent.signal,100));
  assert.equal(called,false);
});
