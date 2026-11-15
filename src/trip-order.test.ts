import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareTrips, tripPhase } from './trip-order.ts';
import type { Trip } from './domain.ts';
const trip = (title: string, start: string, end = start, zone = 'America/Los_Angeles') => ({title,start,end,zone,persistence:'account'}) as Trip;
test('trips sort active, nearest upcoming, then recent past, using each trip timezone', () => {
  const now = new Date('2027-01-02T01:00:00Z');
  const trips = [trip('far','2027-04-01'),trip('old','2026-01-01'),trip('near','2027-01-03'),trip('recent','2026-12-30'),trip('active','2027-01-01')];
  assert.deepEqual(trips.sort((a,b)=>compareTrips(a,b,'2000-01-01',now)).map(t=>t.title),['active','near','far','recent','old']);
  assert.equal(tripPhase(trip('Tokyo','2027-01-01',undefined,'Asia/Tokyo'),'2000-01-01',now),'Past');
});
test('demo trips retain the simulated date', () => {
  const demo = {...trip('demo','2026-10-16'),persistence:undefined};
  assert.equal(tripPhase(demo,'2026-10-16',new Date('2027-01-01')),'Active');
});
