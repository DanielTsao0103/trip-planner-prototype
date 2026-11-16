import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planningWindows } from './planning-availability.ts';
const date = '2027-01-01';
const event = (id: string, start: string, end: string, day = date) => ({id,date:day,start,end});
test('availability merges overlaps, nested plans and adjacent boundaries', () => {
  assert.deepEqual(planningWindows([event('a','08:00','10:00'),event('b','09:30','11:00'),event('c','10:00','10:30'),event('d','11:00','12:00'),event('e','17:00','20:00')],date), [{start:'12:00',end:'17:00'}]);
});
test('availability excludes the edited event, other days and out-of-window plans', () => {
  assert.deepEqual(planningWindows([event('edit','09:00','18:00'),event('other','10:00','11:00','2027-01-02'),event('early','06:00','08:00'),event('late','18:00','20:00')],date,'edit'), [{start:'09:00',end:'18:00'}]);
});
test('availability keeps exact minutes and handles a fully booked day', () => {
  assert.deepEqual(planningWindows([event('a','09:00','10:07'),event('b','10:41','18:00')],date),[{start:'10:07',end:'10:41'}]);
  assert.deepEqual(planningWindows([event('a','08:00','19:00')],date),[]);
});

test('continuing plans occupy later days and exclude exact midnight endpoints',()=>{
  const overnight={...event('night','23:00','10:30'),endDate:'2027-01-02'};
  assert.deepEqual(planningWindows([overnight],'2027-01-02'),[{start:'10:30',end:'18:00'}]);
  assert.deepEqual(planningWindows([{...overnight,endDate:'2027-01-03'}],'2027-01-02'),[]);
  assert.deepEqual(planningWindows([{...overnight,end:'00:00'}],'2027-01-02'),[{start:'09:00',end:'18:00'}]);
  assert.deepEqual(planningWindows([overnight],'2027-01-02','night'),[{start:'09:00',end:'18:00'}]);
});
