/** Opt-in style verification for a local candidate and disposable accounts only.
 * Run after design acceptance. No credentials are logged; cleanup is mandatory.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {chromium, expect} from '@playwright/test';

const env={...parseEnv(readFileSync('.env.local','utf8')),...parseEnv(readFileSync('.env.server.local','utf8')),...process.env};
const appUrl=env.TRIP_QA_URL;
assert.ok(appUrl && ['127.0.0.1','localhost'].includes(new URL(appUrl).hostname),'TRIP_QA_URL must identify the local candidate.');
const options={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(20000)})}};
const admin=createClient(env.VITE_SUPABASE_URL,env.SUPABASE_SECRET_KEY,options);
const accounts=[];
let browser;
const check=result=>{if(result.error)throw new Error(result.error.message);return result.data;};
async function login(page,account){
  await page.goto(appUrl);
  await page.getByLabel('Email',{exact:true}).fill(account.email);
  await page.getByLabel('Password',{exact:true}).fill(account.password);
  await page.getByRole('button',{name:'Log in',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Home',exact:true})).toBeVisible({timeout:30000});
  await page.goto(`${appUrl}#/18`);
  await expect(page.getByText('Loading your saved style…',{exact:true})).toHaveCount(0,{timeout:30000});
}
try{
  for(let i=0;i<2;i++){
    const email=`style-qa-${randomUUID()}@example.com`,password=`${randomUUID()}aA1!`;
    const {user}=check(await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{name:'Style QA'}}));
    const client=createClient(env.VITE_SUPABASE_URL,env.VITE_SUPABASE_PUBLISHABLE_KEY,options);
    const account={id:user.id,email,password,client};accounts.push(account);
    check(await client.auth.signInWithPassword({email,password}));
  }
  const [owner,other]=accounts;
  browser=await chromium.launch();
  const first=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await first.newPage();await login(page,owner);
  await page.getByRole('switch',{name:'Match my device'}).click();
  await page.getByRole('button',{name:'Dark',exact:true}).click();
  await page.getByRole('button',{name:'Green',exact:true}).click();
  await page.getByRole('button',{name:/Handwritten/}).click();
  await page.getByRole('button',{name:'Round',exact:true}).click();
  await page.getByRole('button',{name:'Apply to my site',exact:true}).click();
  await expect(page.getByText('Style saved to your account.',{exact:true})).toBeVisible({timeout:30000});
  const expected={theme:'green',match_device:false,mode:'dark',heading:'caveat',corners:'round'};
  const columns=Object.keys(expected).join(',');
  assert.deepEqual(check(await owner.client.from('user_style').select(columns).eq('user_id',owner.id).single()),expected);
  assert.equal(check(await other.client.from('user_style').select('*').eq('user_id',owner.id)).length,0);
  await page.reload();
  await expect(page.getByRole('button',{name:'Green',exact:true})).toHaveAttribute('aria-pressed','true');
  await first.close();
  const fresh=await browser.newContext({viewport:{width:390,height:844},colorScheme:'light'});
  const phone=await fresh.newPage();await login(phone,owner);
  await expect(phone.getByRole('button',{name:'Green',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(phone.getByRole('button',{name:/Handwritten/})).toHaveAttribute('aria-pressed','true');
  await expect(phone.getByRole('button',{name:'Round',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(phone.getByRole('button',{name:'Dark',exact:true})).toHaveAttribute('aria-pressed','true');
  await phone.getByRole('button',{name:'Purple',exact:true}).click();
  await phone.getByRole('button',{name:'Apply to my site',exact:true}).click();
  await expect(phone.getByText('Style saved to your account.',{exact:true})).toBeVisible({timeout:30000});
  assert.equal(check(await owner.client.from('user_style').select('theme').eq('user_id',owner.id).single()).theme,'purple');
  await fresh.close();
  console.log('PASS: desktop apply, database readback, account isolation, reload, fresh phone login and phone update.');
}finally{
  await browser?.close();
  const failures=[];
  for(const account of accounts){
    await account.client.auth.signOut();
    const removed=await admin.auth.admin.deleteUser(account.id);
    if(removed.error)failures.push(account.id);
    else for(const table of ['user_style','user_style_log']){
      const rows=await admin.from(table).select('user_id').eq('user_id',account.id);
      if(rows.error || rows.data.length)failures.push(`${account.id}:${table}`);
    }
  }
  assert.deepEqual(failures,[],'Disposable account/style cleanup failed; investigate listed QA IDs.');
  console.log('PASS: disposable accounts and style/history rows cleaned up.');
}
