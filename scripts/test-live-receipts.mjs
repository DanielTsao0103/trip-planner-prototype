/** Real private receipt storage/RLS checks using disposable accounts, no messages. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {saveAccountTrip,loadAccountTrips,tripFromRow} from '../src/account-trips.ts';
import {parseReceiptDocument} from '../src/receipt-items.ts';
const env={...parseEnv(readFileSync('.env.local','utf8')),...parseEnv(readFileSync('.env.server.local','utf8')),...process.env};
const opts={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(20000)})}};
const admin=createClient(env.VITE_SUPABASE_URL,env.SUPABASE_SECRET_KEY,opts);
const make=()=>createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,opts);
const output=env.TRIP_QA_OUTPUT||'/Users/danieltsao/Documents/ChatGPT/travel app/outputs/suggestions-receipts-2026-11-16';mkdirSync(output,{recursive:true});
const check=r=>{if(r.error)throw Error(r.error.message);return r.data;};
const accounts=[],passed=[];let tripId,photoPath;
const verify=(name,ok)=>{assert.ok(ok,name);passed.push(name);console.log('PASS '+name);};
try{
 for(const name of ['Payer','Other']){const email=`receipt-${randomUUID()}@example.invalid`,password=randomUUID();const {user}=check(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name}}));const a={id:user.id,email,password,name,client:make()};accounts.push(a);check(await a.client.auth.signInWithPassword({email,password}));}
 const [owner,other]=accounts;tripId=randomUUID();const expenseId=randomUUID();
 let trip={id:tripId,title:'Private receipt QA',destinations:['Seattle'],start:'2027-01-01',end:'2027-01-02',zone:'America/Los_Angeles',image:'',persistence:'account',budget:null,budgetMode:'group',members:[{id:owner.id,name:owner.name,email:owner.email,role:'Owner',status:'accepted',days:[]}],events:[],expenses:[{id:expenseId,purpose:'Cedar Cafe',amount:2568,category:'Food',payer:owner.id,shares:{[owner.id]:2568},date:'2027-01-01',source:'Receipt photo',settled:[]}],prefs:{},individual:{},todos:[],dismissed:[]};
 trip=await saveAccountTrip(owner.client,owner,trip);
 const details=parseReceiptDocument('Cedar Cafe\nUSD\n2 x Latte 9.00\nSandwich 12.00\nSubtotal 21.00\nTax 1.68\nTip 3.00\nTotal 25.68');
 const row={account_id:owner.id,trip_id:tripId,expense_id:expenseId,details};
 check(await owner.client.from('expense_receipt_details').upsert(row));
 const saved=check(await owner.client.from('expense_receipt_details').select('details').eq('trip_id',tripId).single());
 verify('reviewed line items and totals persist',saved.details.items.length===2&&saved.details.totalCents===2568);
 trip.todos.push({id:randomUUID(),text:'Normal aggregate save after receipt',date:trip.start,done:false});
 await saveAccountTrip(owner.client,owner,trip);
 verify('ordinary trip replacement preserves receipt details',check(await owner.client.from('expense_receipt_details').select('details').eq('trip_id',tripId)).length===1);
 verify('outsider cannot read receipt details',check(await other.client.from('expense_receipt_details').select('*').eq('trip_id',tripId)).length===0);
 verify('outsider cannot forge payer receipt',!!(await other.client.from('expense_receipt_details').insert({...row,account_id:other.id})).error);
 verify('payer cannot attach receipt to nonexistent expense',!!(await owner.client.from('expense_receipt_details').insert({...row,expense_id:'not-an-expense'})).error);
 verify('payer cannot transfer receipt ownership',!!(await owner.client.from('expense_receipt_details').update({account_id:other.id}).eq('trip_id',tripId)).error);
 photoPath=`${owner.id}/${tripId}/${expenseId}`;
 const image=readFileSync(output+'/ocr/cafe.png');
 check(await owner.client.storage.from('expense-receipts').upload(photoPath,image,{contentType:'image/png',upsert:false}));
 const loaded=check(await owner.client.storage.from('expense-receipts').download(photoPath));
 verify('private receipt photo survives independent read',Buffer.from(await loaded.arrayBuffer()).equals(image));
 verify('outsider cannot download photo',!!(await other.client.storage.from('expense-receipts').download(photoPath)).error);
 const fresh=make();check(await fresh.auth.signInWithPassword({email:owner.email,password:owner.password}));
 verify('fresh account session can read receipt details',check(await fresh.from('expense_receipt_details').select('details').eq('trip_id',tripId).single()).details.items[0].amountCents===900);
 const load=tripFromRow((await loadAccountTrips(fresh)).find(row=>row.tripID===tripId),owner);
 verify('expense amount and shares remain correct',load.expenses[0].amount===2568&&load.expenses[0].shares[owner.id]===2568);
 load.expenses=[];
 await saveAccountTrip(owner.client,owner,load);
 verify('confirmed expense deletion removes private receipt details',check(await admin.from('expense_receipt_details').select('expense_id').eq('trip_id',tripId)).length===0);
 check(await owner.client.storage.from('expense-receipts').remove([photoPath]));
 verify('payer removes receipt photo after confirmed expense deletion',check(await admin.storage.from('expense-receipts').list(`${owner.id}/${tripId}`)).length===0);
 await fresh.auth.signOut();writeFileSync(output+'/receipt-live-storage.json',JSON.stringify({passed,checkedAt:new Date().toISOString()},null,2));
}finally{
 if(photoPath&&accounts[0])check(await accounts[0].client.storage.from('expense-receipts').remove([photoPath]));
 if(tripId)check(await admin.from('trip').delete().eq('tripID',tripId));
 for(const a of accounts){await a.client.auth.signOut();check(await admin.auth.admin.deleteUser(a.id));}
 if(tripId)assert.equal(check(await admin.from('expense_receipt_details').select('expense_id').eq('trip_id',tripId)).length,0);
 console.log('Cleanup verified.');
}
