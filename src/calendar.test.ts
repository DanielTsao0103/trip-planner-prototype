import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addCalendarDays, rescheduleEvent, calendarLanes } from './calendar.ts';
import type { Trip, Event } from './domain.ts';
const event: Event = {id:'event',name:'Museum',place:'Museum',date:'2027-06-01',start:'10:00',end:'11:30',cost:1250,attendees:['owner'],notes:'Tickets',image:''};
const trip = (): Trip => ({id:'trip',title:'Calendar test',destinations:['Seattle'],start:'2027-06-01',end:'2027-06-20',zone:'America/Los_Angeles',image:'',members:[{id:'owner',name:'Owner',email:'owner@example.com',role:'Owner',days:[],status:'accepted'},{id:'viewer',name:'Viewer',email:'viewer@example.com',role:'Viewer',days:[],status:'accepted'},{id:'limited',name:'Limited',email:'limited@example.com',role:'Day Editor',days:['2027-06-01'],status:'accepted'}],events:[structuredClone(event)],prefs:{},expenses:[],budget:null,budgetMode:'group',individual:{},todos:[],dismissed:[]});
test('a calendar move preserves event identity, duration and other details',()=>{
 const t=trip(); const result=rescheduleEvent(t,'owner','event','2027-06-09','13:30');
 assert.equal(result.error,'');assert.deepEqual(result.event,{...event,date:'2027-06-09',start:'13:30',end:'15:00'});assert.equal(t.events[0].date,'2027-06-01');
});
test('moves enforce source and destination permissions',()=>{
 assert.match(rescheduleEvent(trip(),'viewer','event','2027-06-02','10:00').error,/permission/);
 assert.equal(rescheduleEvent(trip(),'limited','event','2027-06-02','10:00').error,'You do not have permission to move events to this day. Choose one of your assigned days.');
 const t=trip();t.events[0].date='2027-06-02';assert.match(rescheduleEvent(t,'limited','event','2027-06-01','10:00').error,/permission/);
});
test('out-of-trip, overlapping and overnight moves are rejected without mutation',()=>{
 const t=trip();t.events.push({...event,id:'other',date:'2027-06-02'});
 assert.match(rescheduleEvent(t,'owner','event','2027-06-02','10:30').error,/overlaps/);
 assert.match(rescheduleEvent(t,'owner','event','2027-06-21','10:30').error,/within/);
 assert.ok(rescheduleEvent(t,'owner','event','2027-06-02','23:00').error);
 assert.ok(rescheduleEvent(t,'owner','event','2027-02-30','10:00').error);
 assert.ok(rescheduleEvent(t,'owner','event','2027-06-02','25:00').error);
 assert.equal(t.events[0].date,'2027-06-01');
 assert.equal(rescheduleEvent(t,'owner','event','2027-06-02','11:30').error,'');
});
test('calendar week navigation crosses month, year and DST boundaries without shifting dates',()=>{
 assert.equal(addCalendarDays('2027-12-28',7),'2028-01-04');
 assert.equal(addCalendarDays('2028-02-28',1),'2028-02-29');
 assert.equal(addCalendarDays('2027-03-13',7),'2027-03-20');
});

test('overlapping and short visual cards remain in separate lanes without mutating times', () => {
 const items = [
  {...event,id:'a',start:'09:00',end:'12:00'},
  {...event,id:'b',start:'09:30',end:'10:00'},
  {...event,id:'c',start:'10:30',end:'11:00'},
  {...event,id:'d',start:'13:00',end:'13:10'},
  {...event,id:'e',start:'13:15',end:'13:30'},
  {...event,id:'f',start:'15:00',end:'16:00'},
 ];
 const before=structuredClone(items), lanes=calendarLanes(items);
 assert.notEqual(lanes.get('a')!.column,lanes.get('b')!.column);
 assert.equal(lanes.get('b')!.column,lanes.get('c')!.column);
 assert.equal(lanes.get('a')!.columns,2);
 assert.notEqual(lanes.get('d')!.column,lanes.get('e')!.column);
 assert.equal(lanes.get('f')!.columns,1);
 assert.deepEqual(items,before);
});
