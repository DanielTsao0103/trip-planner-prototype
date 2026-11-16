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
    const start=performance.now();let firstOCR;
    const result=await scanReceiptPhoto(file,true,undefined,{onProgress:(_,status)=>{if(status==='Preparing scanner'&&firstOCR===undefined)firstOCR=performance.now()-start;}});
    const controller=new AbortController();const cancelStart=performance.now();let ocrAfterCancel=false;
    const pending=scanReceiptPhoto(file,true,undefined,{signal:controller.signal,onProgress:(_,status)=>{if(status==='Preparing scanner')ocrAfterCancel=true;}});
    setTimeout(()=>controller.abort(),100);
    let cancellation;
    try{await pending;}catch(error){cancellation=error.name;}
    return {result,firstOCR,elapsed:performance.now()-start,cancellation,cancelElapsed:performance.now()-cancelStart,ocrAfterCancel};
  });
  assert.equal(requests.length,2,'Both cloud attempts reach the stalled browser route');
  assert.ok(results.firstOCR>=3900&&results.firstOCR<6500,'Cloud timeout starts OCR after the four-second budget');
  assert.equal(results.result.method,'ocr');assert.equal(results.result.totalCents,2568);assert.equal(results.result.items.length,2);
  assert.equal(results.cancellation,'AbortError');assert.ok(results.cancelElapsed<1500);assert.equal(results.ocrAfterCancel,false);
  writeFileSync(output+'/results.json',JSON.stringify({passed:3,...results},null,2));
  console.log('PASS stalled cloud request falls back after four seconds');
  console.log('PASS real OCR recovers two items and exact $25.68 total');
  console.log('PASS parent cancellation exits promptly without OCR');
}catch(error){failure=error.message;throw error;}finally{
  await context.tracing.stop({path:output+(failure?'/failure-trace.zip':'/trace.zip')});
  await context.unrouteAll({behavior:'ignoreErrors'});
  await browser.close();
}
