/** Real Google → itinerary → database → fresh browser check. No provider/auth/storage mocks.
 * Run with: node --experimental-strip-types scripts/test-live-suggestions.mjs
 * TRIP_QA_URL supports the published site; TRIP_QA_OUTPUT selects the evidence folder.
 * TRIP_QA_CURRENT_LOCATION=1 supplies declared Seattle geolocation input and tests Nearby Search.
 */
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import {resolve} from 'node:path';
import {chromium, expect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {saveAccountTrip, loadAccountTrips, tripFromRow} from '../src/account-trips.ts';
import {TRIP_CLIENT_INFO} from '../src/trip-client-info.ts';
const env={...Object.assign({},...['.env.local','.env.server.local'].filter(existsSync).map(path=>parseEnv(readFileSync(path,'utf8')))),...process.env};
const site=(env.TRIP_QA_URL||'http://127.0.0.1:4216/trip-planner-prototype/').replace(/\/?$/,'/');
const output=resolve(env.TRIP_QA_OUTPUT||'/tmp/trip-live-suggestions');mkdirSync(output,{recursive:true});
const options={auth:{persistSession:false,autoRefreshToken:false},global:{headers:{'X-Client-Info':TRIP_CLIENT_INFO},fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(20000)})}};
const admin=createClient(env.VITE_SUPABASE_URL,env.SUPABASE_SECRET_KEY,options);
const make=()=>createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,options);
const checked=r=>{if(r.error)throw Error(r.error.message);return r.data;};
const passed=[],requests=[],clients=[];let owner,tripId,browser,page,providerPlaces=[],savedEvent;
const currentLocation=env.TRIP_QA_CURRENT_LOCATION==='1';
const report={site,currentLocationInput:currentLocation ? {latitude:47.6062,longitude:-122.3321,source:'browser geolocation test input; actual Google results'} : null,checkedAt:new Date().toISOString(),mocks:false,passed,requests,cleanup:{}};
const verify=(name,condition)=>{assert.ok(condition,name);passed.push(name);console.log('PASS '+name);};
async function login(client){checked(await client.auth.signInWithPassword({email:owner.email,password:owner.password}));}
async function openTrip(target){
 await target.goto(site);await target.getByLabel('Email',{exact:true}).fill(owner.email);await target.getByLabel('Password',{exact:true}).fill(owner.password);
 await target.getByRole('button',{name:'Log in',exact:true}).click();await target.getByRole('heading',{name:'Home',exact:true}).waitFor({timeout:30000});
 await target.goto(site+'#/5');await target.getByRole('button',{name:report.tripTitle,exact:true}).click();
}
try{
 const email=`suggestions-${randomUUID()}@example.invalid`,password=randomUUID();
 const {user}=checked(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:'Suggestions QA'}}));
 owner={id:user.id,email,password,name:'Suggestions QA'};tripId=randomUUID();
 const client=make();clients.push(client);await login(client);
 const start=new Date(Date.now()+7*86400000).toISOString().slice(0,10),end=new Date(Date.now()+9*86400000).toISOString().slice(0,10);
 report.tripTitle=`Live suggestions QA ${tripId.slice(0,8)}`;
 await saveAccountTrip(client,owner,{id:tripId,title:report.tripTitle,destinations:['Seattle'],start,end,zone:'America/Los_Angeles',image:'',persistence:'account',budget:null,budgetMode:'group',members:[{id:owner.id,name:owner.name,email,role:'Owner',status:'accepted',days:[]}],events:[],expenses:[],prefs:{},individual:{},todos:[],dismissed:[]});
 browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1440,height:1000},...(currentLocation ? {geolocation:{latitude:47.6062,longitude:-122.3321},permissions:['geolocation']} : {})});context.setDefaultTimeout(30000);page=await context.newPage();
 page.on('response',async response=>{if(/^https:\/\/places.googleapis.com\/v1\/places:search/.test(response.url())){const record={provider:'Google Places',status:response.status()};requests.push(record);try{const data=await response.json();providerPlaces=data.places||[];record.resultCount=providerPlaces.length;}catch{record.parseFailure=true;}}});
 await openTrip(page);await page.goto(site+'#/9');const research=page.getByRole('region',{name:'Nearby suggestions'});
 if(currentLocation){await research.getByRole('button',{name:'Use my location',exact:true}).click();await expect(research.getByText('Current location',{exact:true})).toBeVisible();}
 const started=performance.now();await research.getByRole('button',{name:'Find nearby suggestions',exact:true}).click();
 await research.locator('.nearby-result').first().waitFor({timeout:45000});report.visibleResultsMs=Math.round(performance.now()-started);
 await expect.poll(()=>providerPlaces.length,{timeout:10000}).toBeGreaterThan(0);
 verify('real Google Places response supplies suggestions',requests.some(r=>r.status===200&&r.resultCount>0));
 const eligible=research.locator('.nearby-result').filter({has:page.locator('button:not([disabled])').filter({hasText:/^Add to itinerary$/})}).first();
 await expect(eligible).toBeVisible();const name=await eligible.locator('h4').innerText();
 const place=providerPlaces.find(p=>p.displayName?.text===name);verify('rendered suggestion matches an actual provider place',!!place);
 const expected={name,address:place.formattedAddress,point:{lat:place.location.latitude,lng:place.location.longitude},googlePlaceId:place.id};report.expected=expected;
 await expect(eligible.locator('dl')).toContainText(expected.address);
 await page.screenshot({path:output+'/suggestion-results-desktop.png',fullPage:true});
 const selected=research.locator('.nearby-result').filter({has:page.getByRole('heading',{name,exact:true})});
 await selected.getByRole('button',{name:'Add to itinerary',exact:true}).click();
 await page.screenshot({path:output+'/suggestion-added-desktop.png',fullPage:true});
 const independent=make();clients.push(independent);await login(independent);
 await expect.poll(async()=>checked(await independent.from('event').select('eventID').eq('tripID',tripId)).length,{timeout:30000}).toBe(1);
 const rows=checked(await independent.from('event').select('eventID,title,location,map_point,google_place_id').eq('tripID',tripId));
 verify('independent authenticated database read finds exactly one saved event',rows.length===1);const row=rows[0];
 verify('database event name exactly matches Google',row.title===expected.name);
 verify('database address exactly matches Google',row.location===expected.address);
 verify('database coordinates exactly match Google',row.map_point?.lat===expected.point.lat&&row.map_point?.lng===expected.point.lng);
 verify('database stable Google place ID exactly matches Google',row.google_place_id===expected.googlePlaceId);
 savedEvent=tripFromRow((await loadAccountTrips(independent)).find(r=>r.tripID===tripId),owner).events[0];
 report.persisted={...row};
 const fresh=await browser.newContext({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:1});fresh.setDefaultTimeout(30000);const phone=await fresh.newPage();await openTrip(phone);
 await phone.goto(site+'#/11?date='+savedEvent.date);await expect(phone.getByText(expected.name,{exact:true}).first()).toBeVisible();await expect(phone.getByText(expected.address,{exact:true}).first()).toBeVisible();
 await phone.reload();await expect(phone.getByText(expected.name,{exact:true}).first()).toBeVisible();await expect(phone.getByText(expected.address,{exact:true}).first()).toBeVisible();
 verify('fresh mobile browser and reload retain saved name and address',true);
 await phone.goto(site+'#/7?event='+encodeURIComponent(savedEvent.id));
 await expect(phone.getByLabel('Event name',{exact:true})).toHaveValue(expected.name);await expect(phone.getByLabel('Where',{exact:true})).toHaveValue(expected.address);
 verify('fresh-session editor is prefilled with the complete saved venue',true);await phone.screenshot({path:output+'/suggestion-fresh-mobile-editor.png',fullPage:true});
 const finalRow=checked(await independent.from('event').select('map_point,google_place_id').eq('eventID',savedEvent.id).single());
 verify('fresh reload preserves provider identity without duplicate saves',finalRow.google_place_id===expected.googlePlaceId&&finalRow.map_point.lat===expected.point.lat&&checked(await independent.from('event').select('eventID').eq('tripID',tripId)).length===1);
 report.success=true;
}catch(error){report.success=false;report.failure=String(error);if(page)await page.screenshot({path:output+'/suggestion-failure.png',fullPage:true}).catch(()=>{});process.exitCode=1;console.error(error);
}finally{
 if(browser)await browser.close();
 try{if(tripId){checked(await admin.from('trip').delete().eq('tripID',tripId));report.cleanup.tripDeleted=checked(await admin.from('trip').select('tripID').eq('tripID',tripId)).length===0;}for(const client of clients)await client.auth.signOut();if(owner){checked(await admin.auth.admin.deleteUser(owner.id));report.cleanup.accountDeleted=(await admin.auth.admin.getUserById(owner.id)).error?.status===404;}assert.ok(!tripId||report.cleanup.tripDeleted);assert.ok(!owner||report.cleanup.accountDeleted);}catch(error){report.cleanup.failure=String(error);process.exitCode=1;}
 writeFileSync(output+'/suggestions-live-account.json',JSON.stringify(report,null,2));console.log('Evidence: '+output+'/suggestions-live-account.json');console.log('Cleanup: '+JSON.stringify(report.cleanup));
}
