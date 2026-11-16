import {test} from 'node:test';
import assert from 'node:assert/strict';
import {regularOpeningWindows,relevantOpeningHours} from './nearby-hours.ts';
import {recommendationSlot} from '../supabase/functions/_shared/nearby-content.ts';
import type {NearbyResult} from '../supabase/functions/_shared/nearby.ts';
const saturday={date:'2027-05-01',zone:'Asia/Taipei'};
const night=[{open:{day:6,hour:17,minute:0},close:{day:0,hour:0,minute:0}}];
const idea={durationMinutes:60,proposedTime:{start:'09:00',end:'10:00'}} as NearbyResult;
test('regular evening hours move a proposed activity out of a closed morning',()=>{
 const windows=regularOpeningWindows(night,'Asia/Taipei',saturday);assert.deepEqual(windows,[{start:'17:00',end:'24:00'}]);
 assert.deepEqual(recommendationSlot({...idea,openingWindows:windows},[{start:'09:00',end:'20:00'}]),{start:'17:00',end:'18:00'});
});
test('overnight periods include the following morning and exclude the midnight endpoint',()=>{
 const windows=regularOpeningWindows([{open:{day:5,hour:20},close:{day:6,hour:2}}],'Asia/Taipei',saturday);
 assert.deepEqual(windows,[{start:'00:00',end:'02:00'}]);
 assert.equal(recommendationSlot({...idea,openingWindows:windows},[{start:'02:00',end:'10:00'}]),null);
});
test('venue periods convert to the itinerary time zone without treating local hours as trip hours',()=>{
 const context={date:'2027-05-01',zone:'America/Los_Angeles'};
 assert.deepEqual(regularOpeningWindows(night,'Asia/Taipei',context),[{start:'02:00',end:'09:00'}]);
 assert.equal(recommendationSlot({...idea,openingWindows:regularOpeningWindows(night,'Asia/Taipei',context)},[{start:'09:00',end:'20:00'}]),null);
});
test('all-day openings, split sessions and closed weekdays retain accurate availability',()=>{
 assert.deepEqual(regularOpeningWindows([{open:{day:0,hour:0}}],undefined,saturday),[{start:'00:00',end:'24:00'}]);
 const split=[{open:{day:6,hour:9},close:{day:6,hour:11}},{open:{day:6,hour:13},close:{day:6,hour:17}}];
 assert.deepEqual(regularOpeningWindows(split,'Asia/Taipei',saturday),[{start:'09:00',end:'11:00'},{start:'13:00',end:'17:00'}]);
 assert.equal(recommendationSlot({...idea,openingWindows:regularOpeningWindows(split,'Asia/Taipei',saturday)},[{start:'10:30',end:'12:30'}]),null);
 assert.deepEqual(regularOpeningWindows(night,'Asia/Taipei',{date:'2027-05-03',zone:'Asia/Taipei'}),[]);
});
test('unavailable or malformed hours remain unknown instead of falsely closed or open',()=>{
 for(const periods of [undefined,[],[null],[{open:{day:8,hour:0}}],[{open:{day:6,hour:25},close:{day:6,hour:26}}]])assert.equal(regularOpeningWindows(periods,'Asia/Taipei',saturday),undefined);
 assert.equal(regularOpeningWindows(night,undefined,saturday),undefined);assert.equal(regularOpeningWindows(night,'Invalid/Zone',saturday),undefined);
 assert.deepEqual(recommendationSlot(idea,[{start:'09:00',end:'20:00'}]),{start:'09:00',end:'10:00'});
});
test('the displayed weekday follows the venue date of the proposed visit',()=>{
 const context={date:'2027-05-01',zone:'America/Los_Angeles'};
 assert.equal(relevantOpeningHours(['Saturday: 5 PM–12 AM','Sunday: 5 PM–12 AM'],'Asia/Taipei',context,{start:'18:00'}),'Sunday: 5 PM–12 AM');
});
