import { test, expect, type Page } from '@playwright/test';

/** SDK-shaped fixtures isolate behavior; separate live probes establish provider availability. */
async function googleFixture(page:Page, mode:'places'|'geocoder'|'failed'='places') {
  await page.addInitScript(mode=>{
    const state={mode,calls:[] as string[],details:0};
    Object.assign(window,{__locationQA:state});
    class AutocompleteSessionToken {}
    class AutocompleteSuggestion {
      static async fetchAutocompleteSuggestions({input}:{input:string}) {
        state.calls.push(input);
        if(state.mode!=='places')throw Error('PERMISSION_DENIED');
        if(input==='Alfa')await new Promise(resolve=>setTimeout(resolve,1200));
        return {suggestions:[{placePrediction:{placeId:'place-'+input,mainText:input+' Museum',secondaryText:'Seattle, USA',text:input+' Museum, Seattle, USA',
          toPlace:()=>({fetchFields:async()=>{state.details++;}})}}]};
      }
    }
    class Geocoder {
      async geocode({address}:{address:string}) {
        if(state.mode==='failed')throw Error('REQUEST_DENIED');
        if(address.includes('Seattle,') || address.includes('Bainbridge'))return {results:[{geometry:{location:{toJSON:()=>({lat:47.6,lng:-122.3})}}}]};
        if(address==='400 Broad Street')return {results:[{place_id:'space-needle',formatted_address:'400 Broad St, Seattle, WA',types:['street_address'],geometry:{location:{toJSON:()=>({lat:47.62,lng:-122.349})}}}]};
        if(address==='Starbucks Seattle')return {results:[{place_id:'seattle',formatted_address:'Seattle, WA',types:['locality'],partial_match:true}]};
        return {results:[]};
      }
    }
    Object.assign(window,{google:{maps:{importLibrary:async()=>({AutocompleteSuggestion,AutocompleteSessionToken,Geocoder})}}});
  },mode);
}

test.beforeEach(async({page})=>{
  await page.addInitScript(()=>sessionStorage.setItem('trip-planner-demo-session','active'));
  await page.route('https://maps.googleapis.com/**',route=>route.abort());
  await page.route('https://*.supabase.co/functions/v1/unsplash-search**',route=>route.fulfill({json:{results:[]}}));
  await page.route('https://geocoding-api.open-meteo.com/**',route=>route.fulfill({json:{results:[{name:'Paris',timezone:'Europe/Paris'}]}}));
  await page.route('https://api.open-meteo.com/**',route=>route.fulfill({json:{timezone:'Europe/Paris'}}));
});

test('a hung destination bias does not prevent place suggestions or touch selection',async({page,isMobile})=>{
  await page.route('https://photon.komoot.io/**',async route=>{
    if(new URL(route.request().url()).searchParams.has('layer')){
      await new Promise(resolve=>setTimeout(resolve,2500));return route.fulfill({json:{features:[]}}).catch(()=>{});
    }
    return route.fulfill({json:{features:[{geometry:{coordinates:[-122.349,47.62]},properties:{name:'Space Needle',street:'Broad Street',housenumber:'400',city:'Seattle',osm_id:1}}]}});
  });
  await page.goto('./#/7');const input=page.getByRole('combobox',{name:'Where',exact:true});
  await input.fill('Space Needle');const option=page.getByRole('option',{name:/Space Needle/});
  await expect(option).toBeVisible({timeout:3500});
  if(isMobile)await option.tap();else await option.click();
  await expect(input).toHaveValue('Space Needle, 400 Broad Street, Seattle');
  await expect(input).toBeFocused();await expect(input).toHaveAttribute('aria-expanded','false');
});

test('fallback predictions discard stale queries and save their exact place ID',async({page})=>{
  await googleFixture(page);await page.route('https://photon.komoot.io/**',route=>route.abort());
  await page.goto('./#/7');const input=page.getByRole('combobox',{name:'Where',exact:true});
  await input.fill('Alfa');await expect.poll(()=>page.evaluate(()=>(window as any).__locationQA.calls)).toContain('Alfa');
  await input.fill('Beta');await expect(page.getByRole('option',{name:'Beta Museum Seattle, USA'})).toBeVisible();
  await page.waitForTimeout(1300);await expect(page.getByRole('option',{name:/Alfa/})).toHaveCount(0);
  await input.press('ArrowDown');await input.press('Enter');
  await expect(input).toHaveValue('Beta Museum, Seattle, USA');
  await expect.poll(()=>page.evaluate(()=>(window as any).__locationQA.details)).toBe(1);
  await page.getByLabel('Event name',{exact:true}).fill('Autocomplete saved location');
  await page.getByRole('button',{name:'Add to itinerary',exact:true}).click();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('trip-planner-demo-v1:demo-maya')!).trips.flatMap((trip:any)=>trip.events).find((event:any)=>event.name==='Autocomplete saved location'));
  expect(saved.googlePlaceId).toBe('place-Beta');expect(saved.point).toBeNull();
  await page.goto('./#/7?event='+saved.id);await page.reload();await expect(input).toHaveValue('Beta Museum, Seattle, USA');
  await input.fill('Hotel lobby');await input.press('Escape');await page.getByRole('button',{name:'Save changes',exact:true}).click();
  const edited=await page.evaluate(id=>JSON.parse(localStorage.getItem('trip-planner-demo-v1:demo-maya')!).trips.flatMap((trip:any)=>trip.events).find((event:any)=>event.id===id),saved.id);
  expect(edited.googlePlaceId).toBeNull();expect(edited.place).toBe('Hotel lobby');
});

test('disabled Places still supports full addresses and refuses a business-to-city substitution',async({page})=>{
  await googleFixture(page,'geocoder');await page.route('https://photon.komoot.io/**',route=>route.abort());
  await page.goto('./#/7');const input=page.getByRole('combobox',{name:'Where',exact:true});
  await input.fill('Starbucks Seattle');await expect(page.getByText('Try a full address or landmark name, or keep the location you typed.',{exact:true})).toBeVisible();
  await expect(page.getByRole('listbox',{name:'Location suggestions'}).getByRole('option')).toHaveCount(0);
  await input.fill('400 Broad Street');await page.getByRole('option',{name:'400 Broad St, Seattle, WA'}).click();
  await expect(input).toHaveValue('400 Broad St, Seattle, WA');
});

test('a failed search retries unchanged text and Escape or Tab dismisses late suggestions',async({page})=>{
  await googleFixture(page,'failed');await page.route('https://photon.komoot.io/**',route=>route.abort());
  await page.goto('./#/7');const input=page.getByRole('combobox',{name:'Where',exact:true});await input.fill('400 Broad Street');
  await expect(page.getByRole('button',{name:'Retry location search'})).toBeVisible();
  await page.evaluate(()=>{(window as any).__locationQA.mode='geocoder';});
  await page.getByRole('button',{name:'Retry location search'}).click();await expect(page.getByRole('option',{name:'400 Broad St, Seattle, WA'})).toBeVisible();
  await input.focus();await input.press('Escape');await expect(input).toHaveAttribute('aria-expanded','false');
  await input.fill('Alfa');await input.press('Tab');await expect(input).toHaveAttribute('aria-expanded','false');
  await page.waitForTimeout(600);await expect(page.getByRole('listbox',{name:'Location suggestions'})).toHaveCount(0);
});

test('destination keyboard choice survives late live enrichment and works in create and edit',async({page})=>{
  await page.route('https://photon.komoot.io/**',async route=>{await new Promise(resolve=>setTimeout(resolve,900));return route.fulfill({json:{features:Array.from({length:8},(_,i)=>({properties:{name:'Remote Paris '+i,country:'France',type:'city'}}))}}).catch(()=>{});});
  await page.goto('./#/6');await page.mouse.move(0,0);const input=page.getByRole('combobox',{name:'Where are you going?'});
  await input.fill('Pari');await expect(page.getByRole('option').first()).toBeVisible();await input.press('ArrowDown');
  const selected=await input.getAttribute('aria-activedescendant');const name=await page.locator('[role=option][aria-selected=true] strong').innerText();
  await page.waitForTimeout(1100);await expect(input).toHaveAttribute('aria-activedescendant',selected!);
  await expect(page.locator('[role=option][aria-selected=true] strong')).toHaveText(name);
  await input.press('Enter');await expect(page.locator('.chips .chip').filter({hasText:name})).toBeVisible();
  await page.goto('./#/6?edit=true');await input.fill('台北');await expect(page.getByRole('option').filter({hasText:'Taipei'}).first()).toBeVisible();
});

test('destinations retain offline country options and use fallback when the bundled index fails',async({page,isMobile})=>{
  await googleFixture(page);await page.route('https://photon.komoot.io/**',route=>route.abort());
  await page.goto('./#/6');const input=page.getByRole('combobox',{name:'Where are you going?'});await input.fill('Japan');
  const option=page.getByRole('option').filter({hasText:'Japan'}).first();await expect(option).toBeVisible();
  if(isMobile)await option.tap();else await option.click();await expect(page.locator('.chips .chip').filter({hasText:'Japan'})).toBeVisible();
  await page.route('**/data/destinations.json',route=>route.fulfill({status:503,body:'Unavailable'}));await page.reload();
  await input.fill('Hidden Village');await expect(page.getByRole('option').filter({hasText:/hidden village Museum/i})).toBeVisible();
  await input.press('ArrowDown');await input.press('Enter');await expect(page.locator('.chips .chip').filter({hasText:/hidden village Museum/i})).toBeVisible();
});
