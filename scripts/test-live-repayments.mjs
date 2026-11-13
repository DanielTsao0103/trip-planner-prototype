/** Disposable-account acceptance for audited repayments. No email or real money. */
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import {chromium} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {saveAccountTrip,tripFromRow,loadAccountTrips} from '../src/account-trips.ts';
import {recordRepayment,repaymentPaid} from '../src/repayments.ts';
const env={...Object.fromEntries(['.env.local','.env.server.local'].flatMap(p=>existsSync(p)?Object.entries(parseEnv(readFileSync(p,'utf8'))):[])),...process.env};
const options={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(20000)})}};
const admin=createClient(env.VITE_SUPABASE_URL,env.SUPABASE_SECRET_KEY,options);
const makeClient=()=>createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,options);
const output=env.TRIP_QA_OUTPUT||'../../outputs/site-refinement/final-release/live-repayments';mkdirSync(output,{recursive:true});
const accounts=[];let tripId;let browser;let passed=0;
const check=r=>{if(r.error)throw Error(r.error.message);return r.data;};
const verify=(name,condition)=>{assert.ok(condition,name);passed++;console.log('PASS '+name);};
const load=async account=>{const row=(await loadAccountTrips(account.client)).find(row=>row.tripID===tripId);assert.ok(row);return tripFromRow(row,account);};
const reject=async(name,fn)=>{let rejected=false;try{await fn();}catch{rejected=true;}verify(name,rejected);};
const waitFor=async(fn)=>{for(let i=0;i<60;i++){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,250));}throw Error('Timed out waiting for independent database readback');};
try{
 for(const name of ['Owner','Payer','Outsider']){
  const email=`repayment-${randomUUID()}@example.com`,password=randomUUID();
  const {user}=check(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:'Audit '+name}}));
  const account={id:user.id,email,password,name:'Audit '+name,client:makeClient()};accounts.push(account);
  check(await account.client.auth.signInWithPassword({email,password}));
 }
 const [owner,payer,outsider]=accounts;tripId=randomUUID();
 let trip={id:tripId,title:'Audited repayment QA',destinations:['Taipei'],destinationTimezones:['Asia/Taipei'],start:'2027-01-01',end:'2027-01-02',zone:'Asia/Taipei',image:'',persistence:'account',budget:10000,budgetMode:'group',members:[
 {id:owner.id,name:owner.name,email:owner.email,role:'Owner',status:'accepted',days:[]},
 {id:payer.id,name:payer.name,email:payer.email,role:'Editor',status:'accepted',days:[]}],events:[],expenses:[
 {id:'owner-lunch',purpose:'Owner lunch',amount:2000,category:'Food',payer:owner.id,shares:{[owner.id]:1000,[payer.id]:1000},date:'2027-01-01',source:'Manual',settled:[]},
 {id:'payer-tickets',purpose:'Payer tickets',amount:3000,category:'Activities',payer:payer.id,shares:{[owner.id]:1500,[payer.id]:1500},date:'2027-01-01',source:'Manual',settled:[]}],prefs:{},individual:{},todos:[],dismissed:[]};
 trip=await saveAccountTrip(owner.client,owner,trip);
 check(await admin.from('trip_member').update({userID:payer.id,shared_account:true,status:'accepted'}).eq('tripID',tripId).eq('planner_id',payer.id));
 trip=await load(owner);
 const pending=structuredClone(trip);recordRepayment(pending.expenses.find(e=>e.id==='owner-lunch'),payer.id,owner.id,'paid');
 let saved=await saveAccountTrip(owner.client,owner,pending);
 let expense=saved.expenses.find(e=>e.id==='owner-lunch');
 verify('server records paid status with authoritative timestamp',expense.repaymentHistory.length===1&&Number.isFinite(Date.parse(expense.repaymentHistory[0].recordedAt)));
 const first=structuredClone(expense.repaymentHistory[0]);
 const repeated=await saveAccountTrip(owner.client,owner,pending);
 verify('lost-response retry has no duplicate or revision bump',repeated.revision===saved.revision&&repeated.expenses.find(e=>e.id==='owner-lunch').repaymentHistory.length===1);
 const correction=structuredClone(saved);recordRepayment(correction.expenses.find(e=>e.id==='owner-lunch'),payer.id,owner.id,'unpaid','The transfer was cancelled.');
 saved=await saveAccountTrip(owner.client,owner,correction);
 const queued=structuredClone(correction);queued.revision=saved.revision;queued.todos.push({id:randomUUID(),text:'Queued after correction',date:'2027-01-01',done:false});
 saved=await saveAccountTrip(owner.client,owner,queued);
 let read=await load(owner);expense=read.expenses.find(e=>e.id==='owner-lunch');
 verify('correction and queued edit persist through fresh read',!repaymentPaid(expense,payer.id)&&expense.repaymentHistory.length===2&&read.todos.length===1);
 verify('original paid entry and expense lock remain',JSON.stringify(expense.repaymentHistory[0])===JSON.stringify(first)&&expense.settled.includes(payer.id)&&expense.amount===2000);
 let tampered=structuredClone(read);tampered.expenses.find(e=>e.id==='owner-lunch').repaymentHistory[0].reason='tampered';
 await reject('earlier audit records cannot be rewritten',()=>saveAccountTrip(owner.client,owner,tampered));
 tampered=structuredClone(read);delete tampered.expenses.find(e=>e.id==='owner-lunch').repaymentHistory;
 await reject('history cannot be dropped by an old payload',()=>saveAccountTrip(owner.client,owner,tampered));
 for(const field of ['purpose','source','amount']){
  tampered=structuredClone(read);tampered.expenses.find(e=>e.id==='owner-lunch')[field]=field==='amount'?3000:'Tampered';
  await reject('locked expense preserves '+field,()=>saveAccountTrip(owner.client,owner,tampered));
 }
 tampered=structuredClone(read);tampered.expenses=tampered.expenses.filter(e=>e.id!=='owner-lunch');
 await reject('corrected expense cannot be removed',()=>saveAccountTrip(owner.client,owner,tampered));
 // Force a later validation failure after the append helper, proving transactional rollback.
 tampered=structuredClone(read);recordRepayment(tampered.expenses.find(e=>e.id==='owner-lunch'),payer.id,owner.id,'paid');tampered.todos.push({id:randomUUID(),text:'Invalid day',date:'2028-01-01',done:false});
 await reject('invalid later content rolls back audit append',()=>saveAccountTrip(owner.client,owner,tampered));
 verify('rollback leaves the audit count unchanged',(await load(owner)).expenses.find(e=>e.id==='owner-lunch').repaymentHistory.length===2);
 let shared=await load(payer);recordRepayment(shared.expenses.find(e=>e.id==='payer-tickets'),owner.id,payer.id,'paid');shared=await saveAccountTrip(payer.client,payer,shared);
 recordRepayment(shared.expenses.find(e=>e.id==='payer-tickets'),owner.id,payer.id,'unpaid','Payment was not received.');shared=await saveAccountTrip(payer.client,payer,shared);
 verify('accepted collaborator can correct their own repayment',!repaymentPaid((await load(owner)).expenses.find(e=>e.id==='payer-tickets'),owner.id));
 tampered=structuredClone(shared);tampered.expenses.find(e=>e.id==='owner-lunch').repaymentHistory.push({id:randomUUID(),debtor:payer.id,status:'paid',reason:'',actor:owner.id});
 await reject('collaborator cannot correct another payer record',()=>saveAccountTrip(payer.client,payer,tampered));
 const outsiderRows=check(await outsider.client.from('trip_repayment_history').select('id').eq('trip_id',tripId));verify('outsider cannot read audit records',outsiderRows.length===0);
 const direct=await owner.client.from('trip_repayment_history').update({reason:'tampered'}).eq('trip_id',tripId);verify('direct audit writes are denied',!!direct.error);
 const audit=check(await admin.from('trip_repayment_history').select('actor_id,actor_account_id,recorded_at').eq('trip_id',tripId));
 verify('server actor account matches authenticated payer',audit.every(r=>r.actor_id===r.actor_account_id)&&audit.length===4);
 // Return owner repayment to paid so the actual UI can exercise Correct repayment.
 read=await load(owner);recordRepayment(read.expenses.find(e=>e.id==='owner-lunch'),payer.id,owner.id,'paid');await saveAccountTrip(owner.client,owner,read);
 browser=await chromium.launch();
 async function login(context){const page=await context.newPage();await page.goto(env.TRIP_QA_URL||'http://127.0.0.1:5190/trip-planner-prototype/');await page.getByLabel('Email',{exact:true}).fill(owner.email);await page.getByLabel('Password',{exact:true}).fill(owner.password);await page.getByRole('button',{name:'Log in',exact:true}).click();await page.getByRole('heading',{name:'Home',exact:true}).waitFor();await page.goto((env.TRIP_QA_URL||'http://127.0.0.1:5190/trip-planner-prototype/')+'#/5');await page.getByRole('button',{name:'Audited repayment QA',exact:true}).click();await page.goto((env.TRIP_QA_URL||'http://127.0.0.1:5190/trip-planner-prototype/')+'#/12');await page.getByRole('button',{name:'Repayments',exact:true}).click();await page.locator('.repayment-group').filter({hasText:/Audit Payer (?:repaid|owes) you/}).locator(':scope > summary').click();return page;}
 const context=await browser.newContext({viewport:{width:390,height:600}});let page=await login(context);
 await page.getByRole('button',{name:'Correct repayment',exact:true}).click();await page.getByLabel('Reason for correction').fill('Verified from the phone UI.');await page.getByRole('button',{name:'Mark as unpaid',exact:true}).click();
 await waitFor(async()=>{const e=(await load(owner)).expenses.find(e=>e.id==='owner-lunch');return e.repaymentHistory.length===4&&!repaymentPaid(e,payer.id)&&e.repaymentHistory[3].reason==='Verified from the phone UI.';});
 verify('phone UI correction independently persists to the database',true);
 await page.reload();await page.getByRole('button',{name:'Repayments',exact:true}).click();await page.locator('.repayment-group').filter({hasText:'Audit Payer owes you'}).locator(':scope > summary').click();await page.locator('.repayment-group').filter({hasText:/Audit Payer (?:repaid|owes) you/}).getByText('Repayment history',{exact:true}).click();await page.getByText('Verified from the phone UI.',{exact:true}).waitFor();await page.screenshot({path:output+'/phone-history-reloaded.png'});await context.close();
 const fresh=await browser.newContext({viewport:{width:1440,height:900}});page=await login(fresh);await page.locator('.repayment-group').filter({hasText:/Audit Payer (?:repaid|owes) you/}).getByText('Repayment history',{exact:true}).click();await page.getByText('Verified from the phone UI.',{exact:true}).waitFor();verify('fresh signed-in browser sees persisted correction history',true);await page.screenshot({path:output+'/fresh-desktop-history.png'});await fresh.close();
 writeFileSync(output+'/result.json',JSON.stringify({passed,tripId,ui:'phone and fresh desktop',database:'independent owner/collaborator/RLS readback'},null,2));
} finally {
 await browser?.close();
 if(tripId)check(await admin.from('trip').delete().eq('tripID',tripId));
 for(const a of accounts){await a.client.auth.signOut();check(await admin.auth.admin.deleteUser(a.id));}
 if(tripId){const remaining=check(await admin.from('trip_repayment_history').select('id').eq('trip_id',tripId));assert.equal(remaining.length,0);}
 for(const a of accounts){const r=await admin.auth.admin.getUserById(a.id);assert.equal(r.error?.status,404);}
 console.log('Cleanup verified: generated accounts, trip and audit rows removed.');
}
console.log(`Completed ${passed} live repayment checks.`);
