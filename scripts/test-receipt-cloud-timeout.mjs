/** Development-server acceptance: stall the optional cloud request and run real OCR. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
const site=process.env.TRIP_QA_URL||'http://127.0.0.1:4215/';
const output=process.env.TRIP_QA_OUTPUT||'/tmp/receipt-cloud-timeout';
mkdirSync(output,{recursive:true});
const browser=await chromium.launch();
const context=await browser.newContext();
const page=await context.newPage();
const requests=[];
let workerStarts=0;
page.on('worker',()=>workerStarts++);
let failure;
try {
  await context.tracing.start({screenshots:true,snapshots:true});
  // Retain these requests without supplying a response, like a stalled provider.
  await page.route('**/functions/v1/read-receipt',route=>{requests.push(route);});
  await page.goto(site);
  const results=await page.evaluate(async()=>{
    const {scanReceiptPhoto}=await import('/src/receipt-photo.ts');
    const canvas=document.createElement('canvas');canvas.width=900;canvas.height=1100;
    const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,900,1100);ctx.fillStyle='black';ctx.font='32px monospace';
    ['CEDAR CAFE','USD','2 x Latte          9.00','Sandwich          12.00','Subtotal          21.00','Tax                1.68','Tip                3.00','TOTAL             25.68'].forEach((line,index)=>ctx.fillText(line,70,110+index*85));
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));const file=new File([blob],'receipt.png',{type:'image/png'});
    window.receiptSpeedFile=file;
    const start=performance.now();let firstOCR;
    const result=await scanReceiptPhoto(file,true,undefined,{onProgress:(_,status)=>{if(status==='Preparing scanner'&&firstOCR===undefined)firstOCR=performance.now()-start;}});
    const elapsed=performance.now()-start;
    const warmStart=performance.now();
    const warmResult=await scanReceiptPhoto(file,true);
    const warmElapsed=performance.now()-warmStart;
    const reusable=await import('/src/receipt-scanner.ts');
    const first=reusable.takeReceiptScanner();const originalWorker=await first.worker;first.release(true);
    const second=reusable.takeReceiptScanner();const sameWorker=(await second.worker)===originalWorker;second.release(true);
    const controller=new AbortController();const cancelStart=performance.now();let ocrAfterCancel=false;
    const pending=scanReceiptPhoto(file,true,undefined,{signal:controller.signal,onProgress:(_,status)=>{if(status==='Preparing scanner')ocrAfterCancel=true;}});
    setTimeout(()=>controller.abort(),100);
    let cancellation;
    try{await pending;}catch(error){cancellation=error.name;}
    return {result,warmResult,firstOCR,elapsed,warmElapsed,sameWorker,cancellation,cancelElapsed:performance.now()-cancelStart,ocrAfterCancel};
  });
  assert.equal(requests.length,3,'All cloud attempts reach the stalled browser route');
  assert.ok(results.firstOCR<100,'Local OCR starts immediately alongside the cloud request');
  assert.ok(results.warmElapsed<3500,'A clear warm receipt finishes before the stalled cloud timeout');
  assert.equal(results.result.method,'ocr');assert.equal(results.result.totalCents,2568);assert.equal(results.result.items.length,2);
  assert.equal(results.warmResult.totalCents,2568);assert.equal(results.warmResult.items.length,2);
  assert.equal(results.result.items[0].description,'Latte');assert.equal(results.warmResult.items[0].description,'Latte');
  assert.equal(results.sameWorker,true);assert.equal(workerStarts,1,'Repeated scans reuse the initialized worker');
  assert.equal(results.cancellation,'AbortError');assert.ok(results.cancelElapsed<1500);
  await page.unroute('**/functions/v1/read-receipt');
  await page.route('**/functions/v1/read-receipt',route=>route.fulfill({json:{purpose:'Cloud Cafe',category:'Food',currency:'USD',totalCents:2568,subtotalCents:2100,taxCents:168,tipCents:300,items:[{description:'Lunch',quantity:1,amountCents:2100}]}}));
  const cloudResult=await page.evaluate(async()=>{
    const {scanReceiptPhoto}=await import('/src/receipt-photo.ts');
    const result=await scanReceiptPhoto(window.receiptSpeedFile,true);
    // A cloud winner cancels its local scan; the next photo must still be readable.
    const next=await scanReceiptPhoto(window.receiptSpeedFile,false);
    return {method:result.method,purpose:result.purpose,nextTotal:next.totalCents};
  });
  assert.equal(cloudResult.method,'vision');assert.equal(cloudResult.purpose,'Cloud Cafe');assert.equal(cloudResult.nextTotal,2568);
  await page.unroute('**/functions/v1/read-receipt');
  await page.route('**/functions/v1/read-receipt',async route=>{
    await new Promise(resolve=>setTimeout(resolve,500));
    await route.fulfill({json:{purpose:'Cloud Cafe',category:'Food',currency:'USD',totalCents:2568,subtotalCents:2100,taxCents:168,tipCents:300,items:[{description:'Lunch',quantity:1,amountCents:2100}]}});
  });
  const partial=await page.evaluate(async()=>{
    const {scanReceiptPhoto}=await import('/src/receipt-photo.ts');
    const canvas=document.createElement('canvas');canvas.width=200;canvas.height=200;
    const context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,200,200);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    const start=performance.now();const result=await scanReceiptPhoto(new File([blob],'blank.png',{type:'image/png'}),true);
    return {method:result.method,elapsed:performance.now()-start};
  });
  assert.equal(partial.method,'vision');assert.ok(partial.elapsed>=450,'Incomplete local reading waits for cloud');
  writeFileSync(output+'/speed-results.json',JSON.stringify({passed:7,workerStarts,...results,cloudResult,partial},null,2));
  console.log(`PASS immediate OCR: cold ${Math.round(results.elapsed)} ms, warm ${Math.round(results.warmElapsed)} ms`);
  console.log('PASS real OCR recovers two items and exact $25.68 total');
  console.log('PASS repeated scans reuse one worker');
  console.log('PASS parent cancellation exits promptly during parallel recognition');
  console.log('PASS fast cloud result wins and a subsequent local scan still works');
  console.log('PASS incomplete local reading waits for the cloud result');
}catch(error){failure=error.message;throw error;}finally{
  await context.tracing.stop({path:output+(failure?'/failure-trace.zip':'/trace.zip')});
  await context.unrouteAll({behavior:'ignoreErrors'});
  await browser.close();
}
