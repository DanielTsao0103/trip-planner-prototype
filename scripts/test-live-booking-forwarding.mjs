/** Real database authorization and ingestion with disposable users and a synthetic provider response. No email is sent or inbox read. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { handleInbound } from '../supabase/functions/inbound-email/handler.ts';
import { saveAccountTrip, loadAccountTrips, tripFromRow } from '../src/account-trips.ts';
import { TRIP_CLIENT_INFO } from '../src/trip-client-info.ts';
const env=Object.assign({},...['.env.local','.env.server.local'].filter(existsSync).map(file=>parseEnv(readFileSync(file,'utf8'))),process.env);
const options={auth:{persistSession:false,autoRefreshToken:false},global:{headers:{'X-Client-Info':TRIP_CLIENT_INFO},fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(20000)})}};
const service=createClient(env.VITE_SUPABASE_URL,env.SUPABASE_SECRET_KEY,options);
const anon=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,options);
const accounts=[];const messageIds=[];const tripIds=[];let checks=0;
const check=r=>{if(r.error)throw Error(r.error.message);return r.data;};
function verify(label,condition){assert.ok(condition,label);checks++;console.log(`PASS ${label}`);}
try{
 for(const name of ['Owner','Other']){
  const email=`forwarding-${randomUUID()}@example.com`,password=randomUUID();
  const {user}=check(await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:`QA ${name}`}}));
  const client=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,options);accounts.push({id:user.id,email,name:`QA ${name}`,client});
  check(await client.auth.signInWithPassword({email,password}));
 }
 const [owner,other]=accounts;
 const first=check(await owner.client.rpc('get_booking_forwarding_code',{p_rotate:false}));
 const same=check(await owner.client.rpc('get_booking_forwarding_code',{p_rotate:false}));
 const different=check(await other.client.rpc('get_booking_forwarding_code',{p_rotate:false}));
 verify('account code stable and distinct',/^[a-f0-9]{48}$/.test(first.code)&&first.code===same.code&&first.code!==different.code);
 verify('anonymous code access denied',Boolean((await anon.rpc('get_booking_forwarding_code')).error));
 verify('authenticated callers cannot resolve other accounts',Boolean((await other.client.rpc('resolve_booking_forwarding_code',{p_code:first.code})).error));
 verify('service resolves correct account',check(await service.rpc('resolve_booking_forwarding_code',{p_code:first.code}))===owner.id);
 const key=randomUUID();let code=first.code;let spoofOnly=false;
 async function ingest(){
  const id=`qa_${randomUUID()}`;messageIds.push(id);
  const provider=async(url,init)=>{
   const address=String(url);
   if(address.startsWith('https://mailtrap.io/')){
    if(address.endsWith('/messages'))return Response.json({data:[{id}],last_id:null});
    return Response.json({id,from_email:other.email,subject:`${spoofOnly?'':`[SC:${code}] `}Hotel confirmation`,text_body:'Hotel: Regression Stay\nCheck-in: 2027-01-01\nCheck-out: 2027-01-02\nConfirmation: QA123',received_at:new Date().toISOString()});
   }
   return fetch(url,init);
  };
  const values={SUPABASE_URL:env.VITE_SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY:env.SUPABASE_SECRET_KEY,MAILTRAP_API_TOKEN:'test-provider-only',MAILTRAP_INBOX_ID:'1',INBOUND_WEBHOOK_KEY:key};
  const response=await handleInbound(new Request(`https://example.invalid/inbound?key=${key}`,{method:'POST'}),name=>values[name],provider);
  if(response.status!==200)throw Error(`Ingestion failed ${response.status}: ${await response.text()}`);
  return id;
 }
 const accepted=await ingest();
 const rows=check(await owner.client.from('forwarded_booking').select('booking_id,owner_id,subject,title').eq('mailtrap_message_id',accepted));
 verify('real booking insert follows code, not forged From',rows.length===1&&rows[0].owner_id===owner.id&&!rows[0].subject.includes(first.code)&&!rows[0].title.includes(first.code));
 verify('other account cannot read booking',check(await other.client.from('forwarded_booking').select('booking_id').eq('mailtrap_message_id',accepted)).length===0);
 // The booking marker must describe a confirmed itinerary event, never a draft.
 const bookingId=rows[0].booking_id,tripId=randomUUID();tripIds.push(tripId);
 const start=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
 let trip=await saveAccountTrip(owner.client,owner,{
  id:tripId,title:'Confirmed booking import QA',destinations:['London'],destinationTimezones:['Europe/London'],
  start,end:start,zone:'Europe/London',image:'',persistence:'account',budget:null,budgetMode:'group',
  members:[{id:owner.id,name:owner.name,email:owner.email,role:'Owner',status:'accepted',days:[]}],
  events:[],expenses:[],prefs:{},individual:{},todos:[],dismissed:[],savedPlaces:[],
 });
 const marker=client=>client.rpc('mark_forwarded_booking_added',{p_booking:bookingId,p_trip:tripId});
 const booking=async()=>check(await owner.client.from('forwarded_booking').select('trip_id,added_at').eq('booking_id',bookingId).single());
 verify('booking cannot be marked before its event is confirmed',Boolean((await marker(owner.client)).error)&&(await booking()).trip_id===null);
 verify('anonymous booking marker access denied',Boolean((await marker(anon)).error));
 verify('another account cannot mark this booking',Boolean((await marker(other.client)).error));
 verify('direct booking marker PATCH denied',Boolean((await owner.client.from('forwarded_booking').update({trip_id:tripId,added_at:new Date().toISOString()}).eq('booking_id',bookingId)).error)&&(await booking()).trip_id===null);
 trip.events.push({id:bookingId,name:'Confirmed booking event',place:'London',date:start,start:'10:00',end:'11:00',cost:0,attendees:[owner.id],notes:'',image:''});
 trip=await saveAccountTrip(owner.client,owner,trip);
 verify('confirmed event permits booking marker',check(await marker(owner.client))===true&&(await booking()).trip_id===tripId);
 const firstAdded=(await booking()).added_at;
 verify('repeated marker retains its original confirmed timestamp',check(await marker(owner.client))===true&&(await booking()).added_at===firstAdded);
 verify('another account cannot undo this booking',Boolean((await other.client.rpc('undo_forwarded_booking',{p_booking:bookingId})).error));
 verify('undo restores waiting state',check(await owner.client.rpc('undo_forwarded_booking',{p_booking:bookingId}))===true&&(await booking()).trip_id===null);
 const restored=tripFromRow((await loadAccountTrips(owner.client)).find(row=>row.tripID===tripId),owner);
 verify('undo preserves the saved itinerary event',restored.events.length===1&&restored.events[0].id===bookingId);
 verify('missing booking cannot report a successful undo',Boolean((await owner.client.rpc('undo_forwarded_booking',{p_booking:randomUUID()})).error));

 spoofOnly=true;const rejected=await ingest();
 verify('matching sender without code cannot assign a booking',check(await service.from('forwarded_booking').select('booking_id').eq('mailtrap_message_id',rejected)).length===0);
 spoofOnly=false;
 const rotated=check(await owner.client.rpc('get_booking_forwarding_code',{p_rotate:true}));
 verify('rotation replaces old code',rotated.code!==first.code&&check(await service.rpc('resolve_booking_forwarding_code',{p_code:first.code}))===null);
 const revoked=await ingest();
 verify('revoked code cannot add a booking',check(await service.from('forwarded_booking').select('booking_id').eq('mailtrap_message_id',revoked)).length===0);
 console.log(`${checks} live booking authorization and ingestion checks passed; provider messages were synthetic.`);
}finally{
 const errors=[];
 for(const id of tripIds){try{check(await service.from('trip').delete().eq('tripID',id));}catch(error){errors.push(error.message);}}
 for(const id of messageIds){try{check(await service.from('inbound_email_log').delete().eq('mailtrap_message_id',id));}catch(error){errors.push(error.message);}}
 for(const account of accounts){try{
  check(await account.client.auth.signOut({scope:'global'}));
  check(await service.from('forwarded_booking').delete().eq('owner_id',account.id));
  check(await service.from('user').delete().eq('userID',account.id));
  check(await service.auth.admin.deleteUser(account.id));
 }catch(error){errors.push(error.message);}}
 if(errors.length)throw Error(`QA cleanup failed: ${errors.join('; ')}`);
 console.log('Disposable forwarding accounts, trips, bookings and log entries removed.');
}
