/** Local browser regression checks. Real OCR and demo persistence; injected
 * transient failures verify recovery without creating production account data. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from '@playwright/test';
const site=process.env.TRIP_QA_URL||'http://127.0.0.1:4215/';
const output=process.env.TRIP_QA_OUTPUT||'/tmp/receipt-followup-20261116';
mkdirSync(output,{recursive:true});
const browser=await chromium.launch();const context=await browser.newContext();const page=await context.newPage();const checks=[];
const verify=(name,passed)=>{assert.ok(passed,name);checks.push(name);console.log('PASS '+name);};
try{
 await context.tracing.start({screenshots:true,snapshots:true});
 await page.goto(site);await page.getByRole('button',{name:'Explore a sample trip',exact:true}).click();await page.goto(site+'#/12');await page.getByRole('button',{name:'Add expense',exact:true}).click();
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=900;c.height=1100;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,900,1100);ctx.fillStyle='black';ctx.font='32px monospace';['CEDAR CAFE','USD','2 x Latte          9.00','Sandwich          12.00','Subtotal          21.00','Tax                1.68','Tip                3.00','TOTAL             25.68'].forEach((line,i)=>ctx.fillText(line,70,110+i*85));return c.toDataURL('image/png').split(',')[1];});
 await page.getByLabel('Upload receipt image',{exact:true}).setInputFiles({name:'receipt.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await page.getByLabel('Receipt item 1',{exact:true}).waitFor({timeout:60000});
 await page.getByLabel('Receipt item 1',{exact:true}).fill('');
 verify('Invalid edited item disables Save',await page.getByRole('button',{name:'Save expense',exact:true}).isDisabled());
 await page.getByLabel('Upload receipt image',{exact:true}).setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('broken')});await page.getByRole('alert').filter({hasText:'image could not be read'}).waitFor();
 await page.getByLabel('I checked the receipt details and the USD expense amount.',{exact:true}).check();
 verify('Rejected replacement preserves invalid draft and disabled Save',await page.getByLabel('Receipt item 1',{exact:true}).inputValue()===''&&await page.getByRole('button',{name:'Save expense',exact:true}).isDisabled());
 // Direct form submission also exercises the handler guard, beyond the button.
 await page.locator('.expense-form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 verify('Invalid draft cannot bypass guard through form submission',await page.getByRole('dialog').isVisible());
 await page.getByLabel('Receipt item 1',{exact:true}).fill('Latte corrected');await page.getByLabel('I checked the receipt details and the USD expense amount.',{exact:true}).check();await page.getByRole('button',{name:'Save expense',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
 await page.reload();await page.locator('.expense-row').filter({hasText:'CEDAR CAFE'}).getByRole('button',{name:'Edit',exact:true}).click();
 await page.evaluate(()=>{const original=IDBDatabase.prototype.transaction;let fail=true;IDBDatabase.prototype.transaction=function(...args){if(fail&&this.name==='trip-planner-demo-receipts'&&args[1]==='readonly'){fail=false;throw new DOMException('Injected transient read failure','UnknownError');}return original.apply(this,args);};});
 await page.getByRole('button',{name:'View receipt',exact:true}).click();await page.getByRole('alert').filter({hasText:'Could not open the receipt'}).waitFor();
 await page.getByRole('button',{name:'View receipt',exact:true}).click();await page.getByText('2 × Latte corrected',{exact:true}).waitFor();
 verify('Successful retry restores saved items and clears stale error',await page.getByRole('alert').filter({hasText:'Could not open the receipt'}).count()===0);
 await page.screenshot({path:output+'/successful-retry.png',fullPage:true});
 // Account storage responses are explicitly injected. This tests partial-load
 // behavior without auth, real account writes, or a live provider dependency.
 const details={purpose:'Cedar Cafe',currency:'USD',totalCents:100,subtotalCents:100,items:[{description:'Tea',quantity:null,amountCents:100}]};
 await page.route('**/rest/v1/expense_receipt_details*',route=>route.fulfill({status:200,json:{details}}));
 await page.route('**/storage/v1/object/**',route=>route.fulfill({status:503,json:{message:'Injected photo read failure'}}));
 const partial=await page.evaluate(async()=>{const {getSupabase}=await import('/src/supabase.ts');getSupabase().auth.getSession=async()=>({data:{session:{user:{id:'00000000-0000-0000-0000-000000000001'}}},error:null});const {loadReceipt}=await import('/src/receipt-storage.ts');const loaded=await loadReceipt({account:true,accountId:'00000000-0000-0000-0000-000000000001',tripId:'00000000-0000-0000-0000-000000000002',expenseId:'recovery-check'});return {hasPhoto:!!loaded.photo,items:loaded.details?.items,photoError:loaded.photoError};});
 verify('Photo failure retains useful details and reports a retryable error',!partial.hasPhoto&&partial.items?.[0].description==='Tea'&&partial.photoError?.includes('Try opening the receipt again'));
 writeFileSync(output+'/recovery-results.json',JSON.stringify({passed:checks.length,checks,partial},null,2));
}finally{await context.tracing.stop({path:output+'/recovery-trace.zip'});await browser.close();}
