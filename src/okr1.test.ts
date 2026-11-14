import assert from 'node:assert/strict';
import test from 'node:test';
import { formatOkrPercent, parseOkr1Metrics, type Okr1Metrics } from './okr1.ts';
import { canTrackTripPlan } from './trip-plan-tracking.ts';

const metrics: Okr1Metrics = {
 trackingStartedAt:'2026-10-01T12:00:00Z',windowStart:'2026-11-01',windowEnd:'2026-11-14',observedDays:14,windowDays:14,targetPercent:85,
 registeredUsers:120,planners:100,currentPlanners:98,savedTrips:150,sharedTrips:62,sharingOwners:48,acceptedCollaborators:50,
 eligiblePlanners:100,consistentPlanners:85,eligibleUsers:120,consistentUsers:85,retentionPercent:85,allUserRetentionPercent:70.833333,
 activeToday:42,activeYesterday:46,activeInWindow:92,newPlanners:0,lastActivityAt:'2026-11-15T10:00:00Z',daily:[{date:'2026-11-14',activeUsers:46}],trend:[{date:'2026-11-14',percent:85,allUserPercent:70.8}],
};

test('KPI preserves a genuine zero separately from an unobserved rate',()=>{
 assert.equal(formatOkrPercent(null),'—');assert.equal(formatOkrPercent(0),'0%');
 assert.equal(parseOkr1Metrics({...metrics,retentionPercent:null}).retentionPercent,null);
 assert.equal(parseOkr1Metrics({...metrics,consistentPlanners:0,retentionPercent:0}).retentionPercent,0);
});
test('KPI rejects impossible counts, rates and incomplete responses',()=>{
 for(const invalid of [{}, {...metrics,eligiblePlanners:-1},{...metrics,consistentPlanners:101},{...metrics,retentionPercent:NaN},{...metrics,daily:[{date:'bad',activeUsers:4}]},{...metrics,trend:[{date:'2026-11-14',percent:101,allUserPercent:null}]}]) {
  assert.throws(()=>parseOkr1Metrics(invalid));
 }
});
test('only genuine saved plans count, never sample, local, auth or admin pages',()=>{
 for(const page of [8,10,11,17]) assert.equal(canTrackTripPlan(true,'account',false,page),true);
 for(const page of [1,4,5,6,7,12,19,20,21]) assert.equal(canTrackTripPlan(true,'account',false,page),false);
 assert.equal(canTrackTripPlan(false,'account',false,8),false);
 assert.equal(canTrackTripPlan(true,'account',true,8),false);
 assert.equal(canTrackTripPlan(true,undefined,false,8),false);
});
