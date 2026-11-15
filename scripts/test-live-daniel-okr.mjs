/** Hosted telemetry checks with disposable accounts/trip. No invitation/email is sent.
 * Uses ignored local credentials; never prints tokens or existing account identities.
 * Run: node --experimental-strip-types scripts/test-live-daniel-okr.mjs */
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const env=Object.assign({},...['.env.local','.env.server.local','.env.supabase.local'].filter(existsSync).map(f=>parseEnv(readFileSync(f,'utf8'))),process.env);
const options={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(20000)})}};
const client=()=>createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,options);
const service=createClient(env.VITE_SUPABASE_URL,env.SUPABASE_SECRET_KEY,options);
const accounts=[];const trip=randomUUID();let checks=0;let latestMetrics;
const check=r=>{if(r.error)throw Error(r.error.message);return r.data;};
const verify=(label,fn)=>{fn();checks++;console.log('PASS '+label);};
const sqlQuote=v=>"'"+String(v).replaceAll("'","''")+"'";
async function sql(query,read_only=false){
 const response=await fetch(`https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query,read_only}),signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error(`SQL HTTP ${response.status}: ${await response.text()}`);return response.json();
}
try {
 for(const name of ['Owner','Friend','Outsider']){
  const email=`okr1-qa-${randomUUID()}@example.com`,password=randomUUID();
  const {user}=check(await service.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:`OKR QA ${name}`}}));
  const account={id:user.id,email,client:client()};accounts.push(account);
  check(await account.client.auth.signInWithPassword({email,password}));
 }
 const [owner,friend,outsider]=accounts;
 check(await owner.client.from('trip').insert({tripID:trip,owner_id:owner.id,created_by:owner.id,trip_name:'Disposable OKR QA',destination:'Seattle',destinations:['Seattle'],start_date:'2027-01-01',end_date:'2027-01-02',timezone:'America/Los_Angeles'}));
 const recorded=check(await owner.client.rpc('record_trip_plan_access',{p_trip:trip}));
 verify('real owner plan access is accepted',()=>assert.equal(recorded,true));
 check(await owner.client.rpc('record_trip_plan_access',{p_trip:trip}));
 const ledger=await sql(`select count(*)::integer as count,bool_and(access_date=(last_seen_at at time zone 'UTC')::date) as utc from private.plan_access_day where user_id=${sqlQuote(owner.id)}::uuid`,true);
 verify('repeated REST calls create one server-dated UTC record',()=>{assert.equal(ledger[0].count,1);assert.equal(ledger[0].utc,true);});
 const anon=client();
 const anonymousRecord=await anon.rpc('record_trip_plan_access',{p_trip:trip});
 verify('anonymous recording is denied',()=>assert.ok(anonymousRecord.error));
 const deniedTrip=await outsider.client.rpc('record_trip_plan_access',{p_trip:trip});
 verify('unrelated account cannot record access to another trip',()=>assert.equal(deniedTrip.error?.code,'42501'));
 const deniedAdmin=await outsider.client.rpc('get_daniel_okr_metrics',{p_days:14});
 verify('non-admin aggregate access denied',()=>assert.equal(deniedAdmin.error?.code,'42501'));
 check(await outsider.client.auth.updateUser({data:{admin:true,is_admin:true}}));
 const spoofed=await outsider.client.rpc('get_daniel_okr_metrics',{p_days:14});
 verify('user-editable metadata cannot grant admin analytics',()=>assert.equal(spoofed.error?.code,'42501'));
 const arbitraryActor=await owner.client.rpc('record_trip_plan_access',{p_trip:trip,p_user:outsider.id,p_date:'2020-01-01'});
 verify('RPC rejects caller-selected user/date parameters',()=>assert.ok(arbitraryActor.error));
 // Seed only the disposable friend membership; never deliver an invitation.
 await sql(`insert into public.trip_member("tripID","userID","roleID",status,planner_id,display_name,invite_email,shared_account)
 select ${sqlQuote(trip)}::uuid,${sqlQuote(friend.id)}::uuid,"roleID",'accepted',${sqlQuote(friend.id)}::uuid,'Disposable friend',${sqlQuote(friend.email)},true from public.role where role_name='Viewer'`);
 const shared=check(await friend.client.rpc('record_trip_plan_access',{p_trip:trip}));
 verify('accepted real shared account may record plan access',()=>assert.equal(shared,true));
 await sql(`update public.trip_member set status='pending' where "tripID"=${sqlQuote(trip)}::uuid and "userID"=${sqlQuote(friend.id)}::uuid`);
 const revoked=await friend.client.rpc('record_trip_plan_access',{p_trip:trip});
 verify('revoked sharing cannot use the same session to record',()=>assert.equal(revoked.error?.code,'42501'));
 const retained=await sql(`select planner_at is not null as enrolled from private.plan_user_cohort where user_id=${sqlQuote(friend.id)}::uuid`,true);
 verify('revoked collaborator remains in enrolled cohort',()=>assert.equal(retained[0].enrolled,true));
 // An isolated database-created Google identity exercises the existing admin guard.
 // It is a QA authorization fixture, not a live Google OAuth verification claim.
 await sql(`insert into auth.identities(id,user_id,provider_id,provider,identity_data)
 values(gen_random_uuid(),${sqlQuote(owner.id)}::uuid,${sqlQuote(owner.id)},'google',jsonb_build_object('sub',${sqlQuote(owner.id)},'email',${sqlQuote(owner.email)}));
 insert into public.admin_email(email) values(${sqlQuote(owner.email)});`);
 latestMetrics=check(await owner.client.rpc('get_daniel_okr_metrics',{p_days:14}));
 verify('approved admin receives aggregate-only metrics contract',()=>{
  for(const key of ['trackingStartedAt','windowStart','windowEnd','observedDays','windowDays','targetPercent','registeredUsers','planners','currentPlanners','savedTrips','sharedTrips','sharingOwners','acceptedCollaborators','eligiblePlanners','consistentPlanners','eligibleUsers','consistentUsers','retentionPercent','allUserRetentionPercent','activeToday','activeYesterday','activeInWindow','newPlanners','lastActivityAt','daily','trend','preliminary'])assert.ok(key in latestMetrics,key);
  assert.equal(latestMetrics.targetPercent,85);
  const early=latestMetrics.preliminary;
  assert.equal(early.observedDays,latestMetrics.observedDays);
  assert.ok(Array.isArray(early.daily));
  assert.ok(latestMetrics.activeToday>=2);
  if(early.observedDays<2 || early.eligiblePlanners===0)assert.equal(early.retentionPercent,null);
  else assert.equal(early.retentionPercent,Math.round(1000*early.consistentPlanners/early.eligiblePlanners)/10);
  if(latestMetrics.observedDays<14){assert.equal(latestMetrics.retentionPercent,null);assert.equal(latestMetrics.eligiblePlanners,0);}
  else {assert.equal(latestMetrics.retentionPercent,latestMetrics.eligiblePlanners===0?null:Math.round(1000*latestMetrics.consistentPlanners/latestMetrics.eligiblePlanners)/10);} 
  const serialized=JSON.stringify(latestMetrics);for(const account of accounts){assert.equal(serialized.includes(account.id),false);assert.equal(serialized.includes(account.email),false);}
 });
 for(const days of [7,30]){const value=check(await owner.client.rpc('get_daniel_okr_metrics',{p_days:days}));verify(`${days}-day window is server-calculated`,()=>assert.equal(value.windowDays,days));}
 const invalid=await owner.client.rpc('get_daniel_okr_metrics',{p_days:999});verify('unsupported observation window rejected',()=>assert.equal(invalid.error?.code,'22023'));
 await sql(`delete from public.admin_email where email=${sqlQuote(owner.email)}`);
 const revokedAdmin=await owner.client.rpc('get_daniel_okr_metrics',{p_days:14});verify('admin revocation takes effect without token refresh',()=>assert.equal(revokedAdmin.error?.code,'42501'));
 const privileges=await sql(`select relname,relrowsecurity,has_table_privilege('authenticated',c.oid,'select,insert,update,delete') as account_access,has_table_privilege('anon',c.oid,'select,insert,update,delete') as anon_access from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and relname in('plan_access_day','plan_user_cohort','plan_tracking_settings')`,true);
 verify('private telemetry tables enforce RLS with no client data grants',()=>{assert.equal(privileges.length,3);assert.ok(privileges.every(row=>row.relrowsecurity&&!row.account_access&&!row.anon_access));});
 const fn=await sql(`select n.nspname,p.proname,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'execute') as anon_execute from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in('record_trip_plan_access','get_daniel_okr_metrics','get_daniel_okr_preliminary_metrics')`,true);
 verify('public wrappers are invokers, privileged helpers private, anon denied',()=>{assert.equal(fn.length,5);assert.ok(fn.every(row=>row.prosecdef===(row.nspname==='private')&&!row.anon_execute&&row.proconfig.some(value=>value.startsWith('search_path='))));});
 console.log(`${checks} live telemetry/authorization checks passed.`);
} finally {
 const errors=[];
 for(const account of accounts){try{
  await sql(`delete from public.admin_email where email=${sqlQuote(account.email)}; delete from auth.identities where user_id=${sqlQuote(account.id)}::uuid and provider='google';`);
  check(await account.client.auth.signOut({scope:'global'}));
  check(await service.from('trip').delete().eq('owner_id',account.id));
  check(await service.from('user').delete().eq('userID',account.id));
  check(await service.auth.admin.deleteUser(account.id));
  const remaining=await sql(`select (select count(*) from private.plan_access_day where user_id=${sqlQuote(account.id)}::uuid)::integer as visits,(select count(*) from private.plan_user_cohort where user_id=${sqlQuote(account.id)}::uuid)::integer as cohort`,true);
  assert.deepEqual(remaining[0],{visits:0,cohort:0});
 }catch(error){errors.push(error.message);}}
 if(errors.length)throw Error('Disposable QA cleanup needs attention: '+errors.join('; '));
 console.log('All disposable accounts, identities, trips, approvals, activity and cohort rows removed; no email sent.');
}
