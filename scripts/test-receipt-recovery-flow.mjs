/** Full UI recovery with real image OCR and IndexedDB; every account/storage
 * response is intercepted, so this test does not modify production data. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium,expect} from '@playwright/test';
const site=process.env.TRIP_QA_URL||'http://127.0.0.1:4215/';const output=process.env.TRIP_QA_OUTPUT||'/tmp/receipt-followup-20261116';mkdirSync(output,{recursive:true});
const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'receipt-recovery@example.test',app_metadata:{provider:'email'},user_metadata:{name:'Receipt Traveler'},created_at:'2026-01-01T00:00:00Z'};
let draft={id:'33333333-3333-4333-8333-333333333333',title:'Receipt recovery trip',destinations:['Seattle'],start:'2027-05-01',end:'2027-05-04',zone:'America/Los_Angeles',destinationTimezones:['America/Los_Angeles'],image:'',members:[{id:user.id,name:'Receipt Traveler',email:user.email,role:'Owner',status:'accepted',days:[]}],events:[],expenses:[],prefs:{},budget:null,budgetMode:'group',individual:{},todos:[],dismissed:[]};
let failSave=true,failDetails=false,photo,details,uploads=0;const checks=[];const verify=(name,okay)=>{assert.ok(okay,name);checks.push(name);console.log('PASS '+name);};
const row=()=>({tripID:draft.id,owner_id:user.id,created_by:user.id,trip_name:draft.title,destinations:draft.destinations,start_date:draft.start,end_date:draft.end,timezone:draft.zone,revision:1,content_version:1,content:draft});
const browser=await chromium.launch();const context=await browser.newContext();const page=await context.newPage();
await context.route('https://*.supabase.co/**',route=>{
 const req=route.request(),path=new URL(req.url()).pathname;
 if(path.endsWith('/token'))return route.fulfill({json:{user,access_token:'qa-token',refresh_token:'qa-refresh',expires_in:3600,token_type:'bearer'}});
 if(path==='/auth/v1/user')return route.fulfill({json:user});
 if(path.endsWith('/load_trip_bundles'))return route.fulfill({json:[row()]});
 if(path.endsWith('/save_account_trip')){if(failSave)return route.fulfill({status:400,json:{message:'Injected trip save failure'}});draft=req.postDataJSON().p_data;return route.fulfill({json:row()});}
 if(path.endsWith('/expense_receipt_details')){if(req.method()==='POST'){if(failDetails)return route.fulfill({status:503,json:{message:'Injected settled-receipt attachment failure'}});details=req.postDataJSON().details;return route.fulfill({status:201,json:{}});}return route.fulfill({json:details?{details}:null});}
 if(path.includes('/storage/v1/object/')&&path.includes('expense-receipts')){if(req.method()==='POST'){uploads++;return route.fulfill({status:200,json:{Key:'receipt'}});}return route.fulfill({status:200,contentType:'image/png',body:photo});}
 return route.fulfill({json:[]});
});
try{
 await context.tracing.start({screenshots:true,snapshots:true});await page.goto(site);await page.getByLabel('Email',{exact:true}).fill(user.email);await page.getByLabel('Password',{exact:true}).fill('qa-password');await page.getByRole('button',{name:'Log in',exact:true}).click();await page.getByRole('button',{name:'Account and preferences',exact:true}).waitFor();
 await page.goto(site+'#/5');await page.getByRole('button',{name:'Open itinerary',exact:true}).click();await page.goto(site+'#/12');await page.getByRole('button',{name:'Add expense',exact:true}).click();
 photo=Buffer.from(await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=900;canvas.height=1100;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,900,1100);ctx.fillStyle='black';ctx.font='32px monospace';['CEDAR CAFE','USD','2 x Latte          9.00','Sandwich          12.00','Subtotal          21.00','Tax                1.68','Tip                3.00','TOTAL             25.68'].forEach((line,i)=>ctx.fillText(line,70,110+i*85));return canvas.toDataURL('image/png').split(',')[1];}),'base64');
 await page.getByLabel('Upload receipt image',{exact:true}).setInputFiles({name:'receipt.png',mimeType:'image/png',buffer:photo});await page.getByLabel('Receipt item 1',{exact:true}).waitFor({timeout:60000});await page.getByLabel('Receipt item 1',{exact:true}).fill('Reviewed oat latte');await page.getByLabel('I checked the receipt details and the USD expense amount.',{exact:true}).check();
 await page.evaluate(()=>{const original=IDBDatabase.prototype.transaction;let failed=false;IDBDatabase.prototype.transaction=function(...args){if(!failed&&this.name==='trip-planner-receipt-outbox'&&args[1]==='readwrite'){failed=true;throw new DOMException('Injected quota failure','QuotaExceededError');}return original.apply(this,args);};});
 await page.getByRole('button',{name:'Save expense',exact:true}).click();await page.getByRole('dialog').getByRole('alert').filter({hasText:'Could not preserve the receipt details'}).waitFor();
 verify('Unavailable recovery storage blocks photo upload and expense mutation',uploads===0&&draft.expenses.length===0);
 await page.getByRole('button',{name:'Save expense',exact:true}).click();await page.getByRole('dialog').getByRole('alert').filter({hasText:'Could not confirm your trip changes'}).waitFor();
 const pending=await page.evaluate(async account=>{const{listPendingReceipts}=await import('/src/receipt-outbox.ts');return listPendingReceipts(account);},user.id);
 verify('Failed expense save retains reviewed items before closing',pending.length===1&&pending[0].details.items[0].description==='Reviewed oat latte'&&draft.expenses.length===0);
 await page.getByRole('dialog').getByRole('button',{name:'Cancel',exact:true}).click();failSave=false;await page.reload();
 await expect.poll(()=>draft.expenses.length).toBe(1);await expect.poll(()=>details?.items[0]?.description).toBe('Reviewed oat latte');
 verify('Reload replays the queued expense and then recovers its reviewed items',draft.expenses[0].amount===2568&&details.items[0].quantity===2);
 await page.locator('.expense-row').filter({hasText:'CEDAR CAFE'}).getByRole('button',{name:'Edit',exact:true}).click();await page.getByRole('button',{name:'View receipt',exact:true}).click();await page.getByText('2 × Reviewed oat latte',{exact:true}).waitFor();
 verify('Recovered item edits appear when opening the saved receipt',true);
 const remaining=await page.evaluate(async account=>{const{listPendingReceipts}=await import('/src/receipt-outbox.ts');return listPendingReceipts(account);},user.id);verify('Confirmed attachment removes its recovery record',remaining.length===0);
 await page.screenshot({path:output+'/recovered-account-receipt.png',fullPage:true});
 await page.evaluate(async({id,details})=>{const{stageReceiptDetails}=await import('/src/receipt-storage.ts');await stageReceiptDetails(id,{...details,items:[{...details.items[0],description:'Initial-load recovery'},details.items[1]]});},{id:{account:true,accountId:user.id,tripId:draft.id,expenseId:draft.expenses[0].id},details});
 await page.reload();await expect.poll(()=>details.items[0].description).toBe('Initial-load recovery');verify('Initial confirmed account load also drains pending reviewed details',true);
 const companion='22222222-2222-4222-8222-222222222222';
 draft.members.push({id:companion,name:'Repaying Traveler',email:'companion@example.test',role:'Editor',status:'accepted',days:[]});
 draft.expenses[0].shares={[user.id]:1284,[companion]:1284};draft.expenses[0].settled=[companion];
 failDetails=true;
 await page.evaluate(async({id,details})=>{const{stageReceiptDetails}=await import('/src/receipt-storage.ts');await stageReceiptDetails(id,{...details,items:[{...details.items[0],description:'Settled receipt recovery'},details.items[1]]});},{id:{account:true,accountId:user.id,tripId:draft.id,expenseId:draft.expenses[0].id},details});
 await page.reload();await page.locator('.expense-row').filter({hasText:'CEDAR CAFE'}).getByRole('button',{name:'Details',exact:true}).click();
 const settledDialog=page.getByRole('dialog',{name:'Expense details',exact:true});
 await settledDialog.getByRole('button',{name:'View receipt',exact:true}).click();
 await settledDialog.getByText('2 × Settled receipt recovery',{exact:true}).waitFor();
 await expect(settledDialog.getByRole('alert')).toContainText('Receipt details are waiting to sync');
 await expect.poll(()=>settledDialog.locator('.expense-receipt-photo').evaluate(image=>image.complete&&image.naturalWidth>0)).toBe(true);
 verify('Settled expense shows its loaded photo and pending reviewed items after a sync failure',await settledDialog.getByRole('button',{name:'Save expense',exact:true}).count()===0&&await settledDialog.getByText('This expense has repayment history and cannot be changed.',{exact:true}).isVisible());
 verify('Settled expense retains a reachable receipt retry after its photo loads',await settledDialog.getByRole('button',{name:'View receipt',exact:true}).isVisible()&&await settledDialog.getByRole('button',{name:'View receipt',exact:true}).isEnabled());
 await page.screenshot({path:output+'/settled-receipt-pending.png',fullPage:true});
 failDetails=false;await settledDialog.getByRole('button',{name:'View receipt',exact:true}).click();
 await expect(settledDialog.getByRole('alert')).toHaveCount(0);await expect(settledDialog.getByRole('button',{name:'View receipt',exact:true})).toHaveCount(0);
 await expect.poll(()=>details.items[0].description).toBe('Settled receipt recovery');
 await expect.poll(()=>page.evaluate(async account=>{const{listPendingReceipts}=await import('/src/receipt-outbox.ts');return(await listPendingReceipts(account)).length;},user.id)).toBe(0);
 await expect(settledDialog.getByRole('alert')).toHaveCount(0);
 verify('Successful settled-receipt retry clears the error and pending record',true);
 await page.screenshot({path:output+'/settled-receipt-recovered.png',fullPage:true});
 writeFileSync(output+'/recovery-flow-results.json',JSON.stringify({passed:checks.length,checks,accountTraffic:'All intercepted; real OCR, trip journal and receipt outbox'},null,2));
}finally{await context.tracing.stop({path:output+'/recovery-flow-trace.zip'});await browser.close();}
