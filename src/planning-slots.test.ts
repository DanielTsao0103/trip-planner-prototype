import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seed } from './data.ts';
import { findAvailableHour } from './planning-slots.ts';

test('new-event defaults skip overnight continuation time and retain exact event identity exclusions',()=>{
 const trip=seed().trips.find(t=>t.id==='seattle')!;
 trip.events=[{...trip.events[0],id:'night',date:'2026-10-15',endDate:'2026-10-16',start:'23:00',end:'11:30'}];
 assert.deepEqual(findAvailableHour(trip,'maya',['2026-10-16']),{date:'2026-10-16',start:'12:00',end:'13:00'});
 assert.deepEqual(findAvailableHour(trip,'maya',['2026-10-16'],'night'),{date:'2026-10-16',start:'09:00',end:'10:00'});
 trip.events[0].endDate='2026-10-17';
 assert.equal(findAvailableHour(trip,'maya',['2026-10-16']),undefined);
});
