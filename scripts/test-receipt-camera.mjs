/** End-to-end virtual camera acceptance. Chromium supplies a generated receipt
 * video through the real getUserMedia API; capture and OCR are not stubbed.
 * Creates its own Y4M feed without external media tools. No physical camera or phone OS picker is tested. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const site = process.env.TRIP_QA_URL || 'http://127.0.0.1:4213/trip-planner-prototype/';
const output = resolve(process.env.TRIP_QA_OUTPUT || '/tmp/trip-receipt-camera');
mkdirSync(output, {recursive:true});
const imagePath = resolve(output, 'generated-receipt.png');
const feedPath = resolve(output, 'receipt-camera.y4m');
const results = [];
const verify = (name, condition) => { assert.ok(condition, name); results.push({name,passed:true}); console.log('PASS '+name); };
const makeBrowser = () => chromium.launch({args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',`--use-file-for-fake-video-capture=${feedPath}`]});
let browser, live, tracingContext, failurePage, cleanupVerified=false, completed=false, failure;
const liveMode=process.env.TRIP_QA_LIVE_RECEIPTS==='1';
const checked=result=>{if(result.error)throw Error(result.error.message);return result.data;};
async function setupLive(){
 const env={...parseEnv(readFileSync('.env.local','utf8')),...parseEnv(readFileSync('.env.server.local','utf8')),...process.env};
 const options={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(20000)})}};
 const admin=createClient(env.VITE_SUPABASE_URL,env.SUPABASE_SECRET_KEY,options);
 const client=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,options);
 const email=`camera-receipt-${randomUUID()}@example.invalid`,password=randomUUID();
 const {user}=checked(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:'Camera Receipt QA'}}));
 live={admin,client,owner:{id:user.id,email,password,name:'Camera Receipt QA'},tripId:randomUUID(),title:'Camera Receipt Acceptance'};
 checked(await client.auth.signInWithPassword({email,password}));
 const {saveAccountTrip}=await import('../src/account-trips.ts');
 const today=new Date().toISOString().slice(0,10);
 await saveAccountTrip(client,live.owner,{id:live.tripId,title:live.title,destinations:['Seattle'],start:today,end:today,zone:'America/Los_Angeles',image:'',persistence:'account',budget:null,budgetMode:'group',members:[{id:user.id,name:live.owner.name,email,role:'Owner',status:'accepted',days:[]}],events:[],expenses:[],prefs:{},individual:{},todos:[],dismissed:[]});
}
async function openBudget(page,useLive=liveMode){
 await page.goto(site);
 if(useLive){await page.getByLabel('Email',{exact:true}).fill(live.owner.email);await page.getByLabel('Password',{exact:true}).fill(live.owner.password);await page.getByRole('button',{name:'Log in',exact:true}).click();await page.getByRole('heading',{name:'Home',exact:true}).waitFor();await page.goto(site+'#/5');await page.getByRole('button',{name:live.title,exact:true}).click();}
 else await page.getByRole('button',{name:'Explore a sample trip',exact:true}).click();
 await page.goto(site+'#/12');
}
async function liveReadback(){
 const {loadAccountTrips,tripFromRow}=await import('../src/account-trips.ts');
 const row=(await loadAccountTrips(live.client)).find(row=>row.tripID===live.tripId);assert.ok(row);
 return tripFromRow(row,live.owner);
}
try {
  if(liveMode)await setupLive();
  const painter = await chromium.launch();
  let rgba;
  try {
    const page = await painter.newPage({viewport:{width:800,height:652}});
    await page.setContent('<body style="margin:0"><canvas width="800" height="652"></canvas></body>');
    rgba = await page.evaluate(() => {
      const context = document.querySelector('canvas').getContext('2d');
      context.fillStyle='white';context.fillRect(0,0,800,652);context.fillStyle='#151515';context.font='30px monospace';
      ['CEDAR CAFE','Currency USD','','2 x Latte                    9.00','Sandwich                    12.00','Subtotal                    21.00','Tax                          1.68','Tip                          3.00','TOTAL                       25.68','VISA                        25.68'].forEach((line,index)=>context.fillText(line,35,60+index*52));
      const bytes=context.getImageData(0,0,800,652).data;const chunks=[];for(let offset=0;offset<bytes.length;offset+=8192)chunks.push(String.fromCharCode(...bytes.subarray(offset,offset+8192)));return btoa(chunks.join(''));
    });
    await page.screenshot({path:imagePath});
  } finally { await painter.close(); }
  const pixels=Buffer.from(rgba,'base64'),width=800,height=652,plane=width*height;
  const frame=Buffer.alloc(plane*3/2);const byte=value=>Math.max(0,Math.min(255,Math.round(value)));
  // BT.601 limited-range YUV420. Chromium loops the supplied camera frames.
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4,r=pixels[i],g=pixels[i+1],b=pixels[i+2];frame[y*width+x]=byte(16+.257*r+.504*g+.098*b);
    if(!(x%2)&&!(y%2)){
      let sr=0,sg=0,sb=0;for(const offset of [0,4,width*4,width*4+4]){sr+=pixels[i+offset];sg+=pixels[i+offset+1];sb+=pixels[i+offset+2];}
      const c=(y/2)*(width/2)+x/2;frame[plane+c]=byte(128-.148*sr/4-.291*sg/4+.439*sb/4);frame[plane+plane/4+c]=byte(128+.439*sr/4-.368*sg/4-.071*sb/4);
    }
  }
  writeFileSync(feedPath,Buffer.concat([Buffer.from(`YUV4MPEG2 W${width} H${height} F5:1 Ip A1:1 C420jpeg\n`),...Array.from({length:10},()=>[Buffer.from('FRAME\n'),frame]).flat()]));
  browser = await makeBrowser();
  const context = await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:output+'/video'}});
  await context.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    window.__receiptCameraStreams=[];
    navigator.mediaDevices.getUserMedia=async constraints=>{const stream=await original(constraints);window.__receiptCameraStreams.push(stream);return stream;};
  });
  await context.tracing.start({screenshots:true,snapshots:true});tracingContext=context;
  const page=await context.newPage();failurePage=page;
  const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
  await openBudget(page);
  await page.getByRole('button',{name:'Add expense',exact:true}).click();
  await page.getByRole('button',{name:'Take photo',exact:true}).dblclick();
  await page.getByRole('button',{name:'Capture receipt',exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
  verify('Real getUserMedia has a live video track',await page.evaluate(()=>window.__receiptCameraStreams.some(stream=>stream.getVideoTracks().some(track=>track.readyState==='live'))));
  verify('Repeated Take photo cannot open a second active stream',await page.getByRole('button',{name:'Take photo',exact:true}).isDisabled() && await page.evaluate(()=>window.__receiptCameraStreams.length===1));
  await page.screenshot({path:output+'/camera-preview.png'});
  await page.getByRole('button',{name:'Close camera',exact:true}).click();
  verify('Close camera stops all real media tracks',await page.evaluate(()=>window.__receiptCameraStreams.every(stream=>stream.getTracks().every(track=>track.readyState==='ended'))));
  await page.getByRole('button',{name:'Take photo',exact:true}).click();await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();verify('Closing expense stops the mounted camera stream',await page.evaluate(()=>window.__receiptCameraStreams.every(stream=>stream.getTracks().every(track=>track.readyState==='ended'))));
  await page.getByRole('button',{name:'Add expense',exact:true}).click();await page.getByRole('button',{name:'Take photo',exact:true}).click();await page.waitForFunction(()=>document.querySelector('video')?.readyState>=2);
  await page.getByRole('button',{name:'Capture receipt',exact:true}).click();
  await page.getByLabel('Receipt item 1',{exact:true}).waitFor({timeout:60000});
  verify('Capture stops the real media stream',await page.evaluate(()=>window.__receiptCameraStreams.every(stream=>stream.getTracks().every(track=>track.readyState==='ended'))));
  verify('Real camera photo OCR extracts merchant and final total',await page.getByLabel('What was it for?',{exact:true}).inputValue()==='CEDAR CAFE' && await page.getByLabel('Amount (USD)',{exact:true}).inputValue()==='25.68');
  verify('Real camera photo OCR extracts both item amounts',await page.getByLabel('Receipt item 1 amount',{exact:true}).inputValue()==='9.00' && await page.getByLabel('Receipt item 2 amount',{exact:true}).inputValue()==='12.00');
  await page.screenshot({path:output+'/camera-extracted.png'});
  await page.getByRole('button',{name:'Save expense',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'confirm the review'}).waitFor();verify('Receipt requires explicit review before saving',true);
  await page.getByLabel('I checked the receipt details and the USD expense amount.',{exact:true}).check();
  if(liveMode){
    let failNext=true;
    let uploaded=false, releaseUpload;
    const uploadGate=new Promise(resolve=>{releaseUpload=resolve;});
    await page.route('**/storage/v1/object/expense-receipts/**',async route=>{
      if(!uploaded&&route.request().method()==='POST'){
        const response=await route.fetch();assert.ok(response.ok(),'Photo is stored before its response is lost');uploaded=true;await uploadGate;return route.abort('failed');
      }
      return route.continue();
    });
    await page.route('**/rest/v1/expense_receipt_details*',route=>{if(failNext&&route.request().method()==='POST'){failNext=false;return route.fulfill({status:503,json:{message:'Acceptance test attachment interruption'}});}return route.continue();});
    await page.getByRole('button',{name:'Save expense',exact:true}).dblclick();
    await page.getByRole('button',{name:'Saving expense…',exact:true}).waitFor();verify('Pending upload locks expense and receipt inputs',await page.getByLabel('Amount (USD)',{exact:true}).isDisabled() && (await page.getByLabel('Receipt item 1',{exact:true}).count()===0 || await page.getByLabel('Receipt item 1',{exact:true}).isDisabled()));releaseUpload();
    await page.getByRole('alert').filter({hasText:'receipt details could not be attached'}).waitFor({timeout:30000});
    verify('Lost successful upload response recovers through the saved photo',uploaded);
    verify('Interrupted attachment reports saved expense and offers retry',(await liveReadback()).expenses.filter(item=>item.purpose==='CEDAR CAFE').length===1);
  }
  await page.getByRole('button',{name:'Save expense',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});
  await page.reload();const row=page.locator('.expense-row').filter({hasText:'CEDAR CAFE'});await row.waitFor();verify('Camera expense persists exactly once after reload',await row.count()===1);
  await row.getByRole('button',{name:'Edit',exact:true}).click();await page.getByRole('button',{name:'View receipt',exact:true}).click();await page.getByRole('region',{name:'Receipt details',exact:true}).waitFor();
  verify('Saved camera receipt item details reload',await page.getByText('2 × Latte',{exact:true}).count()===1 && await page.getByText('Sandwich',{exact:true}).count()===1);
  await page.screenshot({path:output+'/camera-reloaded.png'});
  verify('Camera flow has no uncaught browser errors',pageErrors.length===0);
  if(liveMode){
    const trip=await liveReadback();const expense=trip.expenses.find(item=>item.purpose==='CEDAR CAFE');
    verify('Independent account read confirms exact expense and shares after retry',trip.expenses.length===1&&expense.amount===2568&&expense.shares[live.owner.id]===2568&&expense.source==='Receipt photo');
    const document=checked(await live.client.from('expense_receipt_details').select('details').eq('trip_id',live.tripId).eq('expense_id',expense.id).single()).details;
    verify('Independent database read confirms reviewed items',document.items.length===2&&document.items[0].amountCents===900&&document.items[0].quantity===2&&document.items[1].amountCents===1200&&document.totalCents===2568);
    const photo=checked(await live.client.storage.from('expense-receipts').download(`${live.owner.id}/${live.tripId}/${expense.id}`));verify('Independent private storage read confirms captured photo',photo.size>1000&&photo.type==='image/jpeg');
    const fresh=await browser.newContext({viewport:{width:390,height:844}});const freshPage=await fresh.newPage();failurePage=freshPage;await openBudget(freshPage);const freshRow=freshPage.locator('.expense-row').filter({hasText:'CEDAR CAFE'});await freshRow.getByRole('button',{name:'Edit',exact:true}).click();let failRead=true;await freshPage.route('**/rest/v1/expense_receipt_details*',route=>{if(failRead&&route.request().method()==='GET'){return route.fulfill({status:503,json:{message:'Acceptance test receipt read interruption'}});}return route.continue();});await freshPage.getByRole('button',{name:'View receipt',exact:true}).click();await freshPage.getByRole('alert').filter({hasText:'Could not open the receipt'}).waitFor();verify('Interrupted item read preserves a retry action',await freshPage.getByRole('button',{name:'View receipt',exact:true}).isEnabled());failRead=false;await freshPage.getByRole('button',{name:'View receipt',exact:true}).click();await freshPage.getByRole('region',{name:'Receipt details',exact:true}).waitFor();
    verify('Fresh signed-in phone browser loads stored receipt items',await freshPage.getByText('2 × Latte',{exact:true}).count()===1&&await freshPage.getByText('Sandwich',{exact:true}).count()===1);await freshPage.getByText('View receipt photo',{exact:true}).click();await freshPage.waitForFunction(()=>{const photo=document.querySelector('.receipt-photo-review');return photo?.complete&&photo.naturalWidth>0;});verify('Fresh signed-in phone browser loads private receipt photo',true);await freshPage.screenshot({path:output+'/fresh-account-phone.png'});await fresh.close();failurePage=page;
    let blockDeleteSave=true, blockPhotoDelete=true;
    await page.route('**/rest/v1/rpc/save_account_trip',route=>blockDeleteSave?route.fulfill({status:400,json:{message:'Acceptance test interrupted deletion'}}):route.continue());
    await page.route('**/storage/v1/object/expense-receipts',route=>blockPhotoDelete&&route.request().method()==='DELETE'?route.fulfill({status:503,json:{message:'Acceptance test interrupted photo removal'}}):route.continue());
    await page.getByRole('button',{name:'Delete expense',exact:true}).click();
    await page.getByRole('button',{name:'Delete expense',exact:true}).click();
    await page.getByRole('dialog').getByRole('alert').filter({hasText:'Could not confirm your trip changes'}).waitFor();
    verify('Failed expense deletion keeps expense and receipt intact',(await liveReadback()).expenses.length===1&&checked(await live.admin.from('expense_receipt_details').select('expense_id').eq('trip_id',live.tripId)).length===1&&checked(await live.admin.storage.from('expense-receipts').list(`${live.owner.id}/${live.tripId}`)).length===1);
    blockDeleteSave=false;
    await page.getByRole('button',{name:'Delete expense',exact:true}).click();
    await page.getByRole('button',{name:'Retry receipt removal',exact:true}).waitFor();
    verify('Confirmed deletion cleans private items but exposes photo cleanup retry',(await liveReadback()).expenses.length===0&&checked(await live.admin.from('expense_receipt_details').select('expense_id').eq('trip_id',live.tripId)).length===0&&checked(await live.admin.storage.from('expense-receipts').list(`${live.owner.id}/${live.tripId}`)).length===1);
    blockPhotoDelete=false;
    await page.getByRole('button',{name:'Retry receipt removal',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    verify('Retried cleanup removes the private receipt photo',checked(await live.admin.storage.from('expense-receipts').list(`${live.owner.id}/${live.tripId}`)).length===0);
    await page.reload();
    await page.getByRole('button',{name:'Add expense',exact:true}).waitFor();
    verify('Deleted camera expense remains absent after reload',await page.locator('.expense-row').filter({hasText:'CEDAR CAFE'}).count()===0);
  }
  await context.tracing.stop({path:output+'/camera-trace.zip'});tracingContext=undefined;await context.close();failurePage=undefined;
  // Automatic fake-UI approval overrides permission denial; use a separate browser for this branch.
  await browser.close();browser=await chromium.launch({args:['--use-fake-device-for-media-stream',`--use-file-for-fake-video-capture=${feedPath}`]});
  const denied=await browser.newContext({viewport:{width:1440,height:1000}});const deniedPage=await denied.newPage();failurePage=deniedPage;
  const cdp=await browser.newBrowserCDPSession();
  const {browserContextIds}=await cdp.send('Target.getBrowserContexts');
  await cdp.send('Browser.setPermission',{permission:{name:'camera'},setting:'denied',origin:new URL(site).origin,browserContextId:browserContextIds.at(-1)});
  await openBudget(deniedPage,false);await deniedPage.getByRole('button',{name:'Add expense',exact:true}).click();await deniedPage.getByRole('button',{name:'Take photo',exact:true}).click();
  await deniedPage.getByRole('alert').filter({hasText:/Camera access was declined|The camera could not open/}).waitFor();verify('Browser-denied camera shows upload recovery',await deniedPage.evaluate(async()=>(await navigator.permissions.query({name:'camera'})).state)==='denied' && await deniedPage.getByRole('button',{name:'Upload receipt',exact:true}).isEnabled());
  await deniedPage.getByLabel('Upload receipt image',{exact:true}).setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('invalid image')});await deniedPage.getByRole('alert').filter({hasText:'image could not be read'}).waitFor();verify('Corrupt image is rejected before OCR',true);
  await deniedPage.getByLabel('Upload receipt image',{exact:true}).setInputFiles(imagePath);await deniedPage.getByLabel('Receipt item 1',{exact:true}).waitFor({timeout:60000});verify('Upload retries successfully after denied camera and invalid image',await deniedPage.getByLabel('Amount (USD)',{exact:true}).inputValue()==='25.68');
  await deniedPage.screenshot({path:output+'/camera-denied-upload-recovery.png'});await denied.close();completed=true;
} catch(error){failure=error instanceof Error?error.message:String(error);throw error;} finally {
  if(!completed&&failurePage&&!failurePage.isClosed())await failurePage.screenshot({path:output+'/failure.png',fullPage:true}).catch(()=>{});
  if(tracingContext)await tracingContext.tracing.stop({path:output+'/camera-failure-trace.zip'}).catch(()=>{});
  await browser?.close();
  if(live){
    try{
      const prefix=`${live.owner.id}/${live.tripId}`;
      const files=checked(await live.admin.storage.from('expense-receipts').list(prefix));
      if(files.length)checked(await live.admin.storage.from('expense-receipts').remove(files.map(file=>prefix+'/'+file.name)));
      assert.equal(checked(await live.admin.storage.from('expense-receipts').list(prefix)).length,0);
      checked(await live.admin.from('trip').delete().eq('tripID',live.tripId));
      assert.equal(checked(await live.admin.from('expense_receipt_details').select('expense_id').eq('trip_id',live.tripId)).length,0);
      await live.client.auth.signOut();
      // This legacy profile table has no Auth cascade; delete only this run's identity.
      checked(await live.admin.from('user').delete().eq('userID',live.owner.id).eq('email',live.owner.email));
      assert.equal(checked(await live.admin.from('user').select('userID').eq('userID',live.owner.id)).length,0);
      checked(await live.admin.auth.admin.deleteUser(live.owner.id));
      assert.equal((await live.admin.auth.admin.getUserById(live.owner.id)).error?.status,404);cleanupVerified=true;console.log('Cleanup verified: disposable account, profile, trip, photo and receipt document removed.');
    }catch(error){completed=false;failure=`Cleanup: ${error.message}`;process.exitCode=1;console.error(failure);}
  }
  writeFileSync(output+'/results.json',JSON.stringify({completed,failure,method:`Real Chromium getUserMedia and canvas capture using a generated virtual-camera video; real Tesseract OCR; ${liveMode?'real disposable account and independent database/storage readback':'sample persistence'}. No physical camera or phone OS picker claim.`,site,cleanupVerified:liveMode?cleanupVerified:undefined,checks:results},null,2));
}
