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
  await page.route('https://places.googleapis.com/**',route=>route.abort());
  await page.route('https://*.supabase.co/functions/v1/unsplash-search**',route=>route.fulfill({json:{results:[]}}));
  await page.route('https://geocoding-api.open-meteo.com/**',route=>route.fulfill({json:{results:[{name:'Paris',timezone:'Europe/Paris'}]}}));
  await page.route('https://api.open-meteo.com/**',route=>route.fulfill({json:{timezone:'Europe/Paris'}}));
});

/** The event field uses the separate no-payment REST API, not the map SDK. */
async function demoFixture(page:Page, mode:'places'|'addresses'|'failed'='places') {
  const state={mode,calls:[] as string[],biases:[] as unknown[]};
  await page.route('https://places.googleapis.com/v1/places:*',async route=>{
    const body=route.request().postDataJSON();
    if(state.mode==='failed')return route.fulfill({status:503,json:{error:{message:'Unavailable'}}});
    if(route.request().url().endsWith(':searchText'))return route.fulfill({json:{places:[{location:{latitude:47.6,longitude:-122.3}}]}});
    const input=body.input;state.calls.push(input);state.biases.push(body.locationBias);
    if(input==='Alfa')await new Promise(resolve=>setTimeout(resolve,1200));
    const palace=input.toLowerCase().startsWith('national palace');
    const name=palace?'National Palace Museum':input+' Museum';
    const address=palace?'Zhi Shan Road, Shilin District, Taipei, Taiwan':'Seattle, USA';
    const suggestions=state.mode==='addresses' && input!=='400 Broad Street'?[]:[{placePrediction:{
      placeId:palace?'national-palace':'place-'+input,text:{text:name+', '+address},
      structuredFormat:{mainText:{text:name},secondaryText:{text:address}},
    }}];
    return route.fulfill({json:{suggestions}}).catch(()=>{});
  });
  return state;
}

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

test('typed suggestions arrive within two seconds even when the optional trip lookup stalls',async({page})=>{
  await demoFixture(page);
  await page.route('https://places.googleapis.com/v1/places:autocomplete',async route=>{
    // Allow realistic provider latency; the stalled bias must not add another wait.
    await new Promise(resolve=>setTimeout(resolve,600));await route.fallback();
  });
  await page.route('https://places.googleapis.com/v1/places:searchText',async route=>{
    await new Promise(resolve=>setTimeout(resolve,2500));
    await route.fulfill({json:{places:[]}}).catch(()=>{});
  });
  await page.goto('./#/7');
  const input=page.getByRole('combobox',{name:'Where',exact:true});
  const started=Date.now();await input.fill('national palace museu');
  await expect(page.getByRole('option',{name:/National Palace Museum.*Taipei/})).toBeVisible({timeout:1500});
  expect(Date.now()-started).toBeLessThan(2000);
});

test('demo predictions discard stale queries and save their exact place ID',async({page})=>{
  const state=await demoFixture(page);await page.route('https://photon.komoot.io/**',route=>route.abort());
  await page.goto('./#/7');const input=page.getByRole('combobox',{name:'Where',exact:true});
  await input.fill('Alfa');await expect.poll(()=>state.calls).toContain('Alfa');
  await input.fill('Beta');await expect(page.getByRole('option',{name:'Beta Museum Seattle, USA'})).toBeVisible();
  await page.waitForTimeout(1300);await expect(page.getByRole('option',{name:/Alfa/})).toHaveCount(0);
  await input.press('ArrowDown');await input.press('Enter');
  await expect(input).toHaveValue('Beta Museum, Seattle, USA');
  expect(state.biases.at(-1)).toEqual({circle:{center:{latitude:47.6,longitude:-122.3},radius:50000}});
  await page.getByLabel('Event name',{exact:true}).fill('Autocomplete saved location');
  await page.getByRole('button',{name:'Add to itinerary',exact:true}).click();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('trip-planner-demo-v1:demo-maya')!).trips.flatMap((trip:any)=>trip.events).find((event:any)=>event.name==='Autocomplete saved location'));
  expect(saved.googlePlaceId).toBe('place-Beta');expect(saved.point).toBeNull();
  await page.goto('./#/7?event='+saved.id);await page.reload();await expect(input).toHaveValue('Beta Museum, Seattle, USA');
  await input.fill('Hotel lobby');await input.press('Escape');await page.getByRole('button',{name:'Save changes',exact:true}).click();
  const edited=await page.evaluate(id=>JSON.parse(localStorage.getItem('trip-planner-demo-v1:demo-maya')!).trips.flatMap((trip:any)=>trip.events).find((event:any)=>event.id===id),saved.id);
  expect(edited.googlePlaceId).toBeNull();expect(edited.place).toBe('Hotel lobby');
});

test('empty predictions retain manual entry and never activate the map SDK',async({page})=>{
  await demoFixture(page,'addresses');await page.route('https://photon.komoot.io/**',route=>route.abort());
  let legacyCalls=0;await page.route('https://maps.googleapis.com/**',route=>{legacyCalls++;return route.abort();});
  await page.goto('./#/7');const input=page.getByRole('combobox',{name:'Where',exact:true});
  await input.fill('Starbucks Seattle');await expect(page.getByText('Try another spelling, or enter the location manually.',{exact:true})).toBeVisible();
  await expect(page.getByRole('listbox',{name:'Location suggestions'}).getByRole('option')).toHaveCount(0);
  await input.fill('400 Broad Street');await page.getByRole('option',{name:'400 Broad Street Museum Seattle, USA'}).click();
  await expect(input).toHaveValue('400 Broad Street Museum, Seattle, USA');
  expect(legacyCalls).toBe(0);
});

test('a failed search retries unchanged text and Escape or Tab dismisses late suggestions',async({page})=>{
  const state=await demoFixture(page,'failed');await page.route('https://photon.komoot.io/**',route=>route.abort());
  await page.goto('./#/7');const input=page.getByRole('combobox',{name:'Where',exact:true});await input.fill('400 Broad Street');
  await expect(page.getByRole('button',{name:'Retry location search'})).toBeVisible();
  state.mode='addresses';
  await page.getByRole('button',{name:'Retry location search'}).click();await expect(page.getByRole('option',{name:'400 Broad Street Museum Seattle, USA'})).toBeVisible();
  await input.focus();await input.press('Escape');await expect(input).toHaveAttribute('aria-expanded','false');
  await input.fill('Alfa');await input.press('Tab');await expect(input).toHaveAttribute('aria-expanded','false');
  await page.waitForTimeout(600);await expect(page.getByRole('listbox',{name:'Location suggestions'})).toHaveCount(0);
});

test('suggests National Palace Museum before the traveler finishes typing',async({page,isMobile})=>{
  await demoFixture(page);
  await page.goto('./#/7');const input=page.getByRole('combobox',{name:'Where',exact:true});
  await input.pressSequentially('national palace museu',{delay:25});
  const option=page.getByRole('option',{name:/National Palace Museum.*Taipei/});
  await expect(option).toBeVisible();
  if(isMobile)await option.tap();else await option.click();
  await expect(input).toHaveValue('National Palace Museum, Zhi Shan Road, Shilin District, Taipei, Taiwan');
  await expect(input).toHaveAttribute('aria-expanded','false');
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


test('a country destination biases its full region without restricting matches',async({page})=>{
 const state=await demoFixture(page);
 const viewport={low:{latitude:21.8,longitude:119.3},high:{latitude:25.4,longitude:122.1}};
 await page.route('https://places.googleapis.com/v1/places:searchText',route=>route.fulfill({json:{places:[{location:{latitude:23.7,longitude:121},viewport}]}}));
 await page.goto('./#/7');
 await page.evaluate(()=>{
  const key='trip-planner-demo-v1:demo-maya',store=JSON.parse(localStorage.getItem(key)!);
  const trip=store.trips.find((t:any)=>t.id===store.tripId);trip.destinations=['Taiwan'];trip.events=[];
  localStorage.setItem(key,JSON.stringify(store));
 });await page.reload();
 await page.getByRole('combobox',{name:'Where',exact:true}).fill('coffee');
 await expect.poll(()=>state.biases.at(-1)).toEqual({rectangle:viewport});
});
