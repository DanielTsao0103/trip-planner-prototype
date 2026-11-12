import test from 'node:test';
import assert from 'node:assert/strict';
import {inferLocationContext} from './event-location-context.ts';
import type {Event} from './domain.ts';
const event=(id:string,date:string,start:string,extra:Partial<Event>={}):Event=>({id,name:id,date,start,end:start,cost:0,attendees:[],image:'',notes:'',place:`${id}, Taiwan`,point:{lat:25,lng:121},...extra});
const trip=['Taiwan','Japan'];
test('the latest earlier event wins without averaging cities or depending on array order',()=>{
 const events=[event('Tokyo','2027-05-02','10:00'),event('Taipei dinner','2027-05-01','18:00'),event('Taipei museum','2027-05-01','09:00')];
 assert.equal(inferLocationContext(trip,{events,date:'2027-05-01',start:'14:00'}).label,'Taipei museum');
 assert.equal(inferLocationContext(trip,{events:[...events].reverse(),date:'2027-05-02',start:'14:00'}).label,'Tokyo');
});
test('the next event today beats yesterday; yesterday beats only the trip fallback',()=>{
 const events=[event('Taipei','2027-05-01','18:00'),event('Tokyo','2027-05-02','10:00')];
 assert.equal(inferLocationContext(trip,{events,date:'2027-05-02',start:'08:00'}).label,'Tokyo');
 assert.equal(inferLocationContext(trip,{events,date:'2027-05-03',start:'08:00'}).label,'Tokyo');
 assert.equal(inferLocationContext(trip,{events,date:'2027-05-04',start:'08:00'}).label,'Taiwan');
});
test('editing retains the existing location even when changing the time',()=>{
 const events=[event('Taipei','2027-05-01','18:00'),event('Tokyo','2027-05-02','10:00')];
 assert.equal(inferLocationContext(trip,{events,date:'2027-05-03',start:'08:00',editingId:'Taipei'}).label,'Taipei');
});
test('vague meeting instructions and invalid coordinates cannot become an anchor',()=>{
 const events=[event('Hotel lobby','2027-05-01','09:00',{place:'Meet in the lobby',point:{lat:999,lng:0}})];
 assert.equal(inferLocationContext(trip,{events,date:'2027-05-01',start:'14:00'}).kind,'destination');
 events[0].googlePlaceId='known-place';
 assert.equal(inferLocationContext(trip,{events,date:'2027-05-01',start:'14:00'}).googlePlaceId,'known-place');
});
test('structured addresses can guide older events without stored coordinates',()=>{
 const events=[event('Museum','2027-05-01','09:00',{point:null,place:'National Palace Museum, Taipei, Taiwan'})];
 assert.equal(inferLocationContext(trip,{events,date:'2027-05-01',start:''}).query,'National Palace Museum, Taipei, Taiwan');
 assert.equal(inferLocationContext([]).query,'');
});
