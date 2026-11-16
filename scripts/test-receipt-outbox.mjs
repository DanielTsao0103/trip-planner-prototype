/** Browser persistence/concurrency regression. Provider writes are intercepted;
 * no account creation, authentication or production data changes are performed. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from '@playwright/test';
const site=process.env.TRIP_QA_URL||'http://127.0.0.1:4215/';
const output=process.env.TRIP_QA_OUTPUT||'/tmp/receipt-followup-20261116';mkdirSync(output,{recursive:true});
const browser=await chromium.launch();const context=await browser.newContext();const page=await context.newPage();const checks=[];let blocked=true,holdWrite=false,releaseWrite,writeSeen;const writes=[];
const verify=(name,okay)=>{assert.ok(okay,name);checks.push(name);console.log('PASS '+name);};
await context.route('**/rest/v1/**',route=>{
 if(!route.request().url().includes('/expense_receipt_details'))return route.abort();
 if(route.request().method()==='POST'){writes.push(route.request().postDataJSON());if(holdWrite){holdWrite=false;writeSeen?.();return new Promise(resolve=>{releaseWrite=()=>resolve(route.fulfill({status:201,json:{}}));});}return route.fulfill({status:blocked?503:201,json:blocked?{message:'Injected metadata write failure'}:{}});}
 return route.fulfill({status:200,json:null});
});
try{
 await context.tracing.start({screenshots:true,snapshots:true});await page.goto(site);
 const id={account:true,accountId:'00000000-0000-0000-0000-000000000001',tripId:'00000000-0000-0000-0000-000000000002',expenseId:'receipt-outbox-test'};
 const otherId={...id,accountId:'00000000-0000-0000-0000-000000000003'};
 const details={purpose:'Reviewed cafe receipt',currency:'USD',subtotalCents:900,totalCents:900,items:[{description:'Edited latte',quantity:2,amountCents:900}]};
 const setup=async(target)=>target.evaluate(async id=>{const {getSupabase}=await import('/src/supabase.ts');getSupabase().auth.getSession=async()=>({data:{session:{user:{id:id.accountId}}},error:null});},id);
 await setup(page);
 await page.evaluate(async({id,otherId,details})=>{const{stageReceiptDetails}=await import('/src/receipt-storage.ts');await stageReceiptDetails(id,details);await stageReceiptDetails(otherId,{...details,purpose:'Other account'});},{id,otherId,details});
 await page.reload();await setup(page);
 const restored=await page.evaluate(async id=>{const{listPendingReceipts}=await import('/src/receipt-outbox.ts');return listPendingReceipts(id.accountId);},id);
 verify('Reviewed receipt details survive full reload in an account-scoped outbox',restored.length===1&&restored[0].details.items[0].description==='Edited latte'&&restored[0].details.items[0].quantity===2);
 const trip={id:id.tripId,persistence:'account',members:[{id:id.accountId,accountId:id.accountId,status:'accepted'}],expenses:[{id:id.expenseId,payer:id.accountId}]};
 const missing=await page.evaluate(async({id,trip})=>{const{recoverReceiptDetails}=await import('/src/receipt-storage.ts');return recoverReceiptDetails(id.accountId,[{...trip,expenses:[]}]);},{id,trip});
 verify('No attachment write occurs before a confirmed expense exists',missing.recovered===0&&writes.length===0);
 const failed=await page.evaluate(async({id,trip})=>{const{recoverReceiptDetails}=await import('/src/receipt-storage.ts');const{listPendingReceipts}=await import('/src/receipt-outbox.ts');return {result:await recoverReceiptDetails(id.accountId,[trip]),remaining:(await listPendingReceipts(id.accountId)).length};},{id,trip});
 verify('Failed metadata write preserves the exact reviewed recovery document',failed.result.pending===1&&failed.remaining===1&&writes.at(-1).details.items[0].description==='Edited latte');
 blocked=false;
 const recovered=await page.evaluate(async({id,trip})=>{const{recoverReceiptDetails}=await import('/src/receipt-storage.ts');const{listPendingReceipts}=await import('/src/receipt-outbox.ts');return {result:await recoverReceiptDetails(id.accountId,[trip]),remaining:(await listPendingReceipts(id.accountId)).length};},{id,trip});
 verify('Confirmed recovery drains only after a successful metadata write',recovered.result.recovered===1&&recovered.remaining===0);
 const other=await page.evaluate(async otherId=>{const{listPendingReceipts}=await import('/src/receipt-outbox.ts');return listPendingReceipts(otherId.accountId);},otherId);
 verify('Recovering one account leaves another account untouched',other.length===1&&other[0].details.purpose==='Other account');
 const count=writes.length;
 const wrongAccount=await page.evaluate(async otherId=>{const{flushReceiptDetails}=await import('/src/receipt-storage.ts');try{await flushReceiptDetails(otherId);return false;}catch{return true;}},otherId);
 verify('Session identity blocks cross-account attachment writes',wrongAccount&&writes.length===count);
 // A newer record cannot be erased by a completion for an older version.
 const versionSafe=await page.evaluate(async({id,details})=>{const o=await import('/src/receipt-outbox.ts');await o.stagePendingReceipt(id,details);const old=await o.readPendingReceipt(id);await o.stagePendingReceipt(id,{...details,purpose:'Newer review'});await o.withReceiptLock(id,()=>o.retirePendingReceipt(id,old.version));return(await o.readPendingReceipt(id)).details.purpose;},{id,details});
 verify('Older completion cannot remove a newer reviewed document',versionSafe==='Newer review');
 // Hold a real Web Lock in another tab, then verify staging waits for release.
 const second=await context.newPage();await second.goto(site);await second.evaluate(id=>{window.lockHeld=new Promise(resolve=>navigator.locks.request('trip-receipt:'+id.accountId+'/'+id.tripId+'/'+id.expenseId,async()=>{resolve();await new Promise(done=>window.releaseReceiptLock=done);}));},id);await second.evaluate(()=>window.lockHeld);
 await page.evaluate(async({id,details})=>{window.staged=false;const{stagePendingReceipt}=await import('/src/receipt-outbox.ts');window.stagePending=stagePendingReceipt(id,details).then(()=>window.staged=true);},{id,details});
 verify('Cross-tab lock prevents overlapping attachment mutations',await page.evaluate(()=>window.staged)===false);await second.evaluate(()=>window.releaseReceiptLock());await page.evaluate(()=>window.stagePending);await second.close();
 await page.evaluate(async id=>{const{discardReceiptRecovery}=await import('/src/receipt-storage.ts');await discardReceiptRecovery(id);},id);
 const afterDiscard=writes.length;await page.evaluate(async({id,trip})=>{const{recoverReceiptDetails}=await import('/src/receipt-storage.ts');await recoverReceiptDetails(id.accountId,[trip]);},{id,trip});
 verify('Intentional receipt removal prevents later attachment resurrection',writes.length===afterDiscard);
 await page.evaluate(async({id,details})=>{const{stageReceiptDetails}=await import('/src/receipt-storage.ts');await stageReceiptDetails(id,details);},{id,details});
 holdWrite=true;const writeStarted=new Promise(resolve=>{writeSeen=resolve;});
 await page.evaluate(async id=>{const{flushReceiptDetails}=await import('/src/receipt-storage.ts');window.flushResult=flushReceiptDetails(id).then(()=>false,error=>error.message);},id);await writeStarted;
 await page.evaluate(async()=>{const{getSupabase}=await import('/src/supabase.ts');getSupabase().auth.getSession=async()=>({data:{session:null},error:null});});releaseWrite();
 const signedOut=await page.evaluate(async id=>{const{readPendingReceipt}=await import('/src/receipt-outbox.ts');return {message:await window.flushResult,pending:!!await readPendingReceipt(id)};},id);
 verify('Signout during an in-flight write retains recovery for the original account',signedOut.message.includes('Sign back in')&&signedOut.pending);
 writeFileSync(output+'/outbox-results.json',JSON.stringify({passed:checks.length,checks,provider:'Explicitly intercepted writes, real IndexedDB/reload/Web Locks'},null,2));
}finally{await context.tracing.stop({path:output+'/outbox-trace.zip'});await browser.close();}
