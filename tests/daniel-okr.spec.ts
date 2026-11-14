import { expect, test, type Page } from '@playwright/test';
import { seed } from '../src/data.ts';
import { installGoogleMapFixture } from './google-map-fixture';
import type { Okr1Metrics } from '../src/okr1.ts';
import axe from 'axe-core';

const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'metrics@example.test',app_metadata:{provider:'google'},user_metadata:{name:'Metrics QA'},created_at:'2026-01-01T00:00:00Z'};
const tripId='22222222-2222-4222-8222-222222222222';
const fixture:Okr1Metrics={trackingStartedAt:'2026-10-01T12:00:00Z',windowStart:'2026-11-01',windowEnd:'2026-11-14',observedDays:14,windowDays:14,targetPercent:85,registeredUsers:120,planners:100,currentPlanners:98,savedTrips:150,sharedTrips:62,sharingOwners:48,acceptedCollaborators:50,eligiblePlanners:100,consistentPlanners:85,eligibleUsers:120,consistentUsers:85,retentionPercent:85,allUserRetentionPercent:70.833333,activeToday:42,activeYesterday:46,activeInWindow:92,newPlanners:0,lastActivityAt:'2026-11-15T10:00:00Z',daily:Array.from({length:14},(_,i)=>({date:`2026-11-${String(i+1).padStart(2,'0')}`,activeUsers:30+i}))};

async function api(page:Page,{admin=true,savedTrip=false}={}){
 const state={metrics:structuredClone(fixture),fail:false,metricCalls:0,accessCalls:[] as unknown[],days:[] as number[]};
 const trip=seed().trips[0];
 const content={...trip,sample:false,members:[{id:user.id,name:'Metrics QA',email:user.email,role:'Owner',days:[],status:'accepted'}],events:[],expenses:[],prefs:{}};
 const row={tripID:tripId,owner_id:user.id,created_by:user.id,trip_name:'Tracked trip',destination:trip.destinations[0],destinations:trip.destinations,start_date:trip.start,end_date:trip.end,timezone:trip.zone,revision:1,content_version:1,content};
 await installGoogleMapFixture(page);
 await page.route('https://*.supabase.co/**',async route=>{
  const request=route.request();const path=new URL(request.url()).pathname;
  if(path.endsWith('/is_admin'))return route.fulfill({json:admin});
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
 await page.getByText('View daily numbers',{exact:true}).click();
 await expect(page.getByRole('table')).toContainText('Nov 14');
 await page.getByLabel('Measure among').selectOption('all');
 await expect(page.getByTestId('okr1-percent')).toHaveText('70.8%');
 await expect(page.getByText('Below target',{exact:true})).toBeVisible();
 await page.getByLabel('Measure among').selectOption('planners');
 for(const width of info.project.name==='mobile'?[390,320]:[1440,1024,768]){
  await page.setViewportSize({width,height:900});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:test.info().outputPath(`dashboard-${width}.png`),fullPage:true});
 }
});

test('new tracking never invents retention or historical activity and can recover from denial',async({page})=>{
 const state=await api(page);state.metrics={...fixture,observedDays:0,eligiblePlanners:0,consistentPlanners:0,eligibleUsers:0,consistentUsers:0,retentionPercent:null,allUserRetentionPercent:null,daily:[],lastActivityAt:null};
 await login(page);await page.goto('./#/21');await expect(page.getByTestId('okr1-percent')).toHaveText('—');
 await expect(page.getByText('Collecting baseline',{exact:true})).toBeVisible();
 await expect(page.getByText('Activity starts here',{exact:true})).toBeVisible();
 state.fail=true;await page.getByRole('button',{name:'Refresh data',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('Dashboard unavailable');
 await expect(page.getByTestId('okr1-percent')).toHaveCount(0);
 state.fail=false;await page.getByRole('button',{name:'Retry dashboard',exact:true}).click();
 await expect(page.getByTestId('okr1-percent')).toHaveText('—');
 await page.getByLabel('Measurement period').selectOption('7');await expect.poll(()=>state.days.at(-1)).toBe(7);
 await expect(page.getByText('0 of 7 complete tracking days available.',{exact:false})).toBeVisible();
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
 await page.getByRole('button',{name:'List',exact:true}).click();
 await page.getByRole('button',{name:'Day & map',exact:true}).click();
 await page.keyboard.press('Tab');expect(state.accessCalls).toHaveLength(1);
 // API errors must never block the independently usable trip UI.
 await page.route('**/rpc/record_trip_plan_access',route=>route.fulfill({status:503,json:{message:'Unavailable'}}));
 await page.reload();await expect(page.getByRole('group',{name:'Itinerary view'})).toBeVisible();
 await page.getByRole('button',{name:'List',exact:true}).click();
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
 await page.getByText('Metric definition and data coverage',{exact:true}).click();
 await page.addScriptTag({content:axe.source});
 for(const colorScheme of ['light','dark'] as const){
  await page.emulateMedia({colorScheme});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.style.colorScheme)).toBe(colorScheme);
  const violations=await page.evaluate(async()=> (await (window as any).axe.run('.daniel-dashboard',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations);
  expect(violations).toEqual([]);
  if(colorScheme==='dark')await page.screenshot({path:info.outputPath('dashboard-dark.png'),fullPage:true});
 }
});
