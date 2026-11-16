import { expect, test, type Page } from '@playwright/test';
import { seed } from '../src/data.ts';
import { installGoogleMapFixture } from './google-map-fixture';
import type { Okr1Metrics } from '../src/okr1.ts';
import axe from 'axe-core';

const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'metrics@example.test',app_metadata:{provider:'google'},user_metadata:{name:'Metrics QA'},created_at:'2026-01-01T00:00:00Z'};
const tripId='22222222-2222-4222-8222-222222222222';
const fixture:Okr1Metrics={trackingStartedAt:'2026-10-01T12:00:00Z',windowStart:'2026-11-01',windowEnd:'2026-11-14',observedDays:14,windowDays:14,targetPercent:85,registeredUsers:120,planners:100,currentPlanners:98,savedTrips:150,sharedTrips:62,sharingOwners:48,acceptedCollaborators:50,eligiblePlanners:100,consistentPlanners:85,eligibleUsers:120,consistentUsers:85,retentionPercent:85,allUserRetentionPercent:70.833333,activeToday:42,activeYesterday:46,activeInWindow:92,newPlanners:0,lastActivityAt:'2026-11-15T10:00:00Z',daily:Array.from({length:14},(_,i)=>({date:`2026-11-${String(i+1).padStart(2,'0')}`,activeUsers:30+i})),trend:Array.from({length:14},(_,i)=>({date:`2026-11-${String(i+1).padStart(2,'0')}`,percent:59+i*2,allUserPercent:49+i*1.5}))};

async function api(page:Page,{admin=true,savedTrip=false}={}){
 const state={metrics:structuredClone(fixture),fail:false,receiptStats:{eligible_travelers:4,repeat_travelers:2},receiptCalls:0,metricCalls:0,accessCalls:[] as unknown[],days:[] as number[]};
 const trip=seed().trips[0];
 const content={...trip,sample:false,members:[{id:user.id,name:'Metrics QA',email:user.email,role:'Owner',days:[],status:'accepted'}],events:[],expenses:[],prefs:{}};
 const row={tripID:tripId,owner_id:user.id,created_by:user.id,trip_name:'Tracked trip',destination:trip.destinations[0],destinations:trip.destinations,start_date:trip.start,end_date:trip.end,timezone:trip.zone,revision:1,content_version:1,content};
 await installGoogleMapFixture(page);
 await page.route('https://*.supabase.co/**',async route=>{
  const request=route.request();const path=new URL(request.url()).pathname;
  if(path.endsWith('/is_admin'))return route.fulfill({json:admin});
  if(path.endsWith('/okr4_receipt_stats')){state.receiptCalls++;return route.fulfill({json:state.receiptStats});}
  if(path.endsWith('/get_daniel_okr_metrics')){state.metricCalls++;const days=request.postDataJSON().p_days;state.days.push(days);return state.fail?route.fulfill({status:403,json:{message:'Admin access removed'}}):route.fulfill({json:{...state.metrics,windowDays:days,observedDays:Math.min(state.metrics.observedDays,days)}});}
  if(path.endsWith('/record_trip_plan_access')){state.accessCalls.push(request.postDataJSON());return route.fulfill({json:null});}
  if(path.endsWith('/token'))return route.fulfill({json:{access_token:'qa-token',refresh_token:'qa-refresh',token_type:'bearer',expires_in:3600,user}});
  if(path==='/auth/v1/user')return route.fulfill({json:user});
  if(path.endsWith('/settings'))return route.fulfill({json:{external:{}}});
  if(path.endsWith('/load_trip_bundles'))return route.fulfill({json:savedTrip?[row]:[]});
  if(path.endsWith('/read_invited_trip'))return route.fulfill({json:row});
  return route.fulfill({json:[]});
 });return state;
}
async function login(page:Page){await page.goto('./');await page.getByLabel('Email',{exact:true}).fill(user.email);await page.getByLabel('Password',{exact:true}).fill('qa-password');await page.getByRole('button',{name:'Log in',exact:true}).click();await expect(page.getByRole('heading',{name:'Home',exact:true})).toBeVisible();}

test('admin sees real metrics, denominator definitions and responsive chart table',async({page},info)=>{
 await api(page);await login(page);await page.goto('./#/21');
 await expect(page.getByTestId('okr1-percent')).toHaveText('85%');
 await expect(page.getByText('Target met',{exact:true})).toBeVisible();
 await expect(page.getByText('85 of 100',{exact:true})).toBeVisible();
 await expect(page.getByText('85% of users',{exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Planner adoption'})).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Trips shared',exact:true})).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Trip-plan activity'})).toHaveCount(0);
 await expect(page.getByRole('combobox')).toHaveCount(0);
 await expect(page.getByTestId('okr1-trend-line')).toBeVisible();
 await page.getByText('View return-rate percentages',{exact:true}).click();
 await expect(page.getByRole('table')).toContainText('Nov 14');
 await page.getByText('View return-rate percentages',{exact:true}).click();
 await page.getByText('How this is measured',{exact:true}).click();
 await expect(page.getByText('Users who have saved a trip',{exact:false})).toBeVisible();
 await page.getByText('How this is measured',{exact:true}).click();
 for(const width of info.project.name==='mobile'?[390,320]:[1440,1024,768]){
  await page.setViewportSize({width,height:900});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:test.info().outputPath(`dashboard-${width}.png`),fullPage:true});
 }
});

test('new tracking never invents retention or historical activity and can recover from denial',async({page},info)=>{
 const state=await api(page);state.metrics={...fixture,observedDays:0,eligiblePlanners:0,consistentPlanners:0,eligibleUsers:0,consistentUsers:0,retentionPercent:null,allUserRetentionPercent:null,daily:[],trend:[],activeToday:0,lastActivityAt:null};
 await login(page);await page.goto('./#/21');await expect(page.getByTestId('okr1-percent')).toHaveText('0%');
 await expect(page.getByText('Preliminary',{exact:true})).toBeVisible();
 await expect(page.getByText('0 of 14 complete days collected',{exact:false})).toBeVisible();
 await expect(page.getByTestId('okr1-trend-line')).toHaveCount(0);
 await page.screenshot({path:info.outputPath('dashboard-baseline.png'),fullPage:true});
 state.fail=true;await page.getByRole('button',{name:'Refresh data',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Dashboard unavailable');
 await expect(page.getByTestId('okr1-percent')).toHaveCount(0);
 state.fail=false;await page.getByRole('button',{name:'Retry dashboard',exact:true}).click();
 await expect(page.getByTestId('okr1-percent')).toHaveText('0%');
 expect(state.days.every(days=>days===14)).toBe(true);
});

test('percentage rings distinguish empty denominators from genuine zero rates',async({page})=>{
 const state=await api(page);state.metrics={...fixture,planners:0,registeredUsers:0,currentPlanners:0,savedTrips:0,sharedTrips:0,sharingOwners:0,acceptedCollaborators:0,eligiblePlanners:0,consistentPlanners:0,eligibleUsers:0,consistentUsers:0,retentionPercent:null,allUserRetentionPercent:null,activeToday:0,activeYesterday:0,activeInWindow:0,daily:[],trend:[]};
 await login(page);await page.goto('./#/21');
 await expect(page.getByTestId('okr1-percent')).toHaveText('—');
 state.metrics={...fixture,consistentPlanners:0,retentionPercent:0,sharedTrips:0,trend:[]};
 await page.getByRole('button',{name:'Refresh data',exact:true}).click();
 await expect(page.getByTestId('okr1-percent')).toHaveText('0%');
 await expect(page.getByText('85 more users need to meet this cadence to reach 85%',{exact:false})).toBeVisible();
 await expect(page.getByText('Below target',{exact:true})).toBeVisible();
});

test('automatic refresh preserves expanded details and keyboard focus',async({page})=>{
 const state=await api(page);await login(page);await page.goto('./#/21');
 await expect(page.getByTestId('okr1-percent')).toHaveText('85%');
 await page.getByText('View return-rate percentages',{exact:true}).click();
 const definition=page.getByText('How this is measured',{exact:true});
 await definition.click();await definition.focus();
 const calls=state.metricCalls;
 state.metrics.consistentPlanners=86;state.metrics.retentionPercent=86;
 await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
 await expect.poll(()=>state.metricCalls).toBe(calls+1);
 await expect(page.getByTestId('okr1-percent')).toHaveText('86%');
 await expect(definition).toBeFocused();
 await expect(page.getByRole('table',{name:'Rolling return rate, UTC'})).toBeVisible();
 await expect(page.getByText('Users who have saved a trip',{exact:false})).toBeVisible();
});

test('preliminary activity shows real visits, short cadence and graduation without claiming target success',async({page},info)=>{
 const state=await api(page);
 state.metrics={...fixture,trackingStartedAt:'2026-11-12T12:00:00Z',observedDays:1,retentionPercent:null,eligiblePlanners:0,consistentPlanners:0,daily:[{date:'2026-11-14',activeUsers:30}],trend:[],preliminary:{windowStart:'2026-11-14',windowEnd:'2026-11-14',observedDays:1,eligiblePlanners:0,consistentPlanners:0,retentionPercent:null,daily:[{date:'2026-11-12',activeUsers:12},{date:'2026-11-13',activeUsers:25},{date:'2026-11-14',activeUsers:30}]}};
 await login(page);await page.goto('./#/21');
 await expect(page.getByRole('heading',{name:'Plan access today',exact:true})).toBeVisible();
 await expect(page.getByTestId('okr1-percent')).toHaveText('42%');
 await expect(page.getByText('Preliminary',{exact:true})).toBeVisible();
 await expect(page.getByText('Target met',{exact:true})).toHaveCount(0);
 await page.getByRole('slider',{name:'Inspect day'}).fill('0');
 await expect(page.locator('.okr1-chart-readout')).toContainText('12 people · Nov 12 · Partial day');
 await page.getByText('View daily numbers',{exact:true}).click();
 await expect(page.getByRole('table')).toContainText('Today so far');
 const slider=page.getByRole('slider',{name:'Inspect day'});await slider.focus();
 state.metrics.preliminary!.daily[0].activeUsers=13;
 await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
 await expect(page.locator('.okr1-chart-readout')).toContainText('13 people · Nov 12');
 await expect(slider).toBeFocused();
 await expect(page.getByRole('table')).toBeVisible();
 for(const width of info.project.name==='mobile'?[390,320]:[1440,768]){
  await page.setViewportSize({width,height:900});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath(`preliminary-${width}.png`),fullPage:true});
 }
 await page.addScriptTag({content:axe.source});
 for(const colorScheme of ['light','dark'] as const){
  await page.emulateMedia({colorScheme});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.style.colorScheme)).toBe(colorScheme);
  expect(await page.evaluate(async()=> (await (window as any).axe.run('.daniel-dashboard',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations)).toEqual([]);
 }
 state.metrics.observedDays=4;
 state.metrics.preliminary={...state.metrics.preliminary!,windowStart:'2026-11-11',observedDays:4,eligiblePlanners:10,consistentPlanners:9,retentionPercent:90};
 await page.getByRole('button',{name:'Refresh data',exact:true}).click();
 await expect(page.getByTestId('okr1-percent')).toHaveText('90%');
 await expect(page.getByText('9 of 10',{exact:true})).toBeVisible();
 await expect(page.getByText('Target met',{exact:true})).toHaveCount(0);
 await expect(page.getByText('Early result, not the official 14-day score.',{exact:false})).toBeVisible();
 state.metrics=structuredClone(fixture);
 await page.getByRole('button',{name:'Refresh data',exact:true}).click();
 await expect(page.getByTestId('okr1-percent')).toHaveText('85%');
 await expect(page.getByText('Target met',{exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Activity so far'})).toHaveCount(0);
 await expect(page.getByTestId('okr1-trend-line')).toBeVisible();
});

test('ordinary and demo accounts cannot request the aggregate dashboard',async({page})=>{
 const state=await api(page,{admin:false});await login(page);await page.goto('./#/21');
 await expect(page.getByRole('heading',{name:'You do not have access to this page.'})).toBeVisible();expect(state.metricCalls).toBe(0);
 await page.evaluate(()=>{localStorage.clear();sessionStorage.clear()});await page.goto('./');await page.getByRole('button',{name:'Try demo as Maya',exact:true}).click();await page.goto('./#/21');
 await expect(page.getByRole('heading',{name:'You do not have access to this page.'})).toBeVisible();expect(state.metricCalls).toBe(0);expect(state.accessCalls).toHaveLength(0);
});

test('foreground saved-plan access records only trip identity and is throttled across navigation',async({page})=>{
 const state=await api(page,{savedTrip:true});await login(page);expect(state.accessCalls).toHaveLength(0);
 await page.goto('./#/5');await page.getByRole('button',{name:'Tracked trip',exact:true}).click();
 await expect.poll(()=>state.accessCalls.length).toBe(1);expect(state.accessCalls[0]).toEqual({p_trip:tripId});
 await page.getByRole('button',{name:'Map & list',exact:true}).click();
 await page.getByRole('button',{name:'Hide map',exact:true}).click();
 await page.keyboard.press('Tab');expect(state.accessCalls).toHaveLength(1);
 // API errors must never block the independently usable trip UI.
 await page.route('**/rpc/record_trip_plan_access',route=>route.fulfill({status:503,json:{message:'Unavailable'}}));
 await page.reload();await expect(page.getByRole('group',{name:'Itinerary view'})).toBeVisible();
 await page.getByRole('button',{name:'Map & list',exact:true}).click();
 await expect(page.getByRole('button',{name:'Save a place',exact:true})).toBeVisible();
});

test('hidden plans do not manufacture visits and a visible return records one',async({page})=>{
 const state=await api(page,{savedTrip:true});await login(page);
 // Deterministic visibility simulates a background tab without relying on OS focus.
 await page.evaluate(()=>Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'}));
 await page.goto('./#/5');await page.getByRole('button',{name:'Tracked trip',exact:true}).click();
 await expect(page.getByRole('group',{name:'Itinerary view'})).toBeVisible();
 await page.keyboard.press('Tab');expect(state.accessCalls).toHaveLength(0);
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'visible'});document.dispatchEvent(new Event('visibilitychange'));});
 await expect.poll(()=>state.accessCalls.length).toBe(1);
});

test('dashboard remains accessible in light and dark appearance',async({page},info)=>{
 await api(page);await login(page);await page.goto('./#/21');
 await expect(page.getByTestId('okr1-percent')).toHaveText('85%');
 await page.getByText('How this is measured',{exact:true}).click();
 await page.addScriptTag({content:axe.source});
 for(const colorScheme of ['light','dark'] as const){
  await page.emulateMedia({colorScheme});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.style.colorScheme)).toBe(colorScheme);
  const violations=await page.evaluate(async()=> (await (window as any).axe.run('.daniel-dashboard',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations);
  expect(violations).toEqual([]);
  if(colorScheme==='dark')await page.screenshot({path:info.outputPath('dashboard-dark.png'),fullPage:true});
 }
});

test('receipt OKR shows progress, refreshes, and distinguishes an empty cohort', async ({ page }) => {
 const state = await api(page);
 await login(page);
 await page.goto('./#/21');
 const tracker = page.getByRole('region', { name: 'Help people stay within their trip budgets' });
 await expect(tracker.getByText('50%', { exact: true })).toBeVisible();
 await expect(tracker.getByText('2 of 4', { exact: true })).toBeVisible();
 await expect(tracker.getByText('Target met')).toBeVisible();

 state.receiptStats = { eligible_travelers: 0, repeat_travelers: 0 };
 await tracker.getByRole('button', { name: 'Refresh receipt activity' }).click();
 await expect(tracker.getByText('No eligible travelers yet.')).toBeVisible();
 expect(state.receiptCalls).toBeGreaterThanOrEqual(2);
});
