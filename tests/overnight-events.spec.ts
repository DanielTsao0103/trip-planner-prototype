import { expect, test } from '@playwright/test';
import { seed } from '../src/data.ts';
import { installGoogleMapFixture } from './google-map-fixture.ts';

/** Canonical demo fixtures keep these journeys independent of account writes. */
test.beforeEach(async ({page}) => {
  const state=seed(), trip=state.trips.find(item=>item.id==='seattle')!;
  state.userId='maya';state.tripId=trip.id;
  trip.events=[{...trip.events[0],id:'night',name:'Overnight train',date:'2026-10-15',endDate:'2026-10-16',start:'23:30',end:'08:15',cost:3450,point:{lat:47.6,lng:-122.3}}];
  await page.addInitScript(value=>{
    sessionStorage.setItem('trip-planner-demo-session','active');
    if(!localStorage.getItem('trip-planner-demo-v1:demo-maya'))localStorage.setItem('trip-planner-demo-v1:demo-maya',JSON.stringify(value));
  },state);
  await page.route(/https:\/\/(.*\.supabase\.co|maps\.googleapis\.com|places\.googleapis\.com|photon\.komoot\.io)\//,route=>route.abort());
});

test('one overnight event appears on both calendar days and continuation edits retain its identity',async({page})=>{
  await page.goto('./#/8?view=calendar&date=2026-10-16');
  await expect(page.locator('.itcal-event[data-event-id="night"]')).toHaveCount(2);
  const continuation=page.locator('.itcal-event[data-event-id="night"][data-occurrence-date="2026-10-16"]');
  await continuation.getByRole('button',{name:'Overnight train',exact:true}).click();
  await expect(page.getByLabel('End day',{exact:true})).toHaveValue('2026-10-16');
  await page.getByLabel('End time',{exact:true}).fill('09:17');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(page).toHaveURL(/date=2026-10-16/);
  await page.reload();
  await expect(continuation).toContainText('9:17 AM');
  const events=await page.evaluate(()=>JSON.parse(localStorage.getItem('trip-planner-demo-v1:demo-maya')!).trips.find((t:{id:string})=>t.id==='seattle').events);
  expect(events).toHaveLength(1);expect(events[0]).toMatchObject({id:'night',endDate:'2026-10-16',cost:3450,end:'09:17'});
});

test('map filters preserve a continuation with only one physical pin',async({page})=>{
  await installGoogleMapFixture(page);
  await page.goto('./#/17?date=2026-10-16&days=2026-10-16');
  await expect(page.locator('test-map-marker')).toHaveCount(1);
  await expect(page.locator('.map-day-group')).toHaveCount(2);
  const dayTwo=page.locator('.map-day-group').filter({has:page.locator('.map-day-number',{hasText:'Day 2'})});
  await dayTwo.locator('summary').click();
  await dayTwo.getByRole('button',{name:/Overnight train/}).click();
  await expect(dayTwo.getByRole('link',{name:'View itinerary item'})).toHaveAttribute('href',/date=2026-10-16/);
  await dayTwo.getByRole('link',{name:'View itinerary item'}).click();
  await expect(page.locator('#day-event-night-2026-10-16')).toBeVisible();
});

test('phone initial calendar scroll uses its visible day rather than earlier plans later in the week',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('./#/8?view=calendar');
  await page.evaluate(()=>{
    const key='trip-planner-demo-v1:demo-maya',state=JSON.parse(localStorage.getItem(key)!);
    const trip=state.trips.find((t:{id:string})=>t.id==='seattle'),original=trip.events[0];
    trip.events=[{...original,id:'afternoon',date:'2026-10-15',endDate:'2026-10-15',start:'15:00',end:'16:00'},
      {...original,id:'later-day',date:'2026-10-16',endDate:'2026-10-16',start:'09:00',end:'10:00'}];
    localStorage.setItem(key,JSON.stringify(state));
  });
  await page.reload();
  await expect(page.locator('.itcal-event[data-event-id="afternoon"]')).toBeVisible();
  await expect.poll(()=>page.locator('.itcal-scroll').evaluate(node=>node.scrollTop)).toBeGreaterThan(400);
  const visible=await page.locator('.itcal-event[data-event-id="afternoon"]').evaluate(node=>{
    const card=node.getBoundingClientRect(),scroll=node.closest('.itcal-scroll')!.getBoundingClientRect();
    return card.top>=scroll.top && card.top<scroll.bottom;
  });
  expect(visible).toBe(true);
});

test('a new overnight plan uses the optional end day and saves one complete event', async({page})=>{
  await page.goto('./#/7?date=2026-10-17');
  await page.getByLabel('Event name',{exact:true}).fill('Night ferry');
  await page.getByLabel('Where',{exact:true}).fill('Seattle ferry terminal');
  await expect(page.getByLabel('End day',{exact:true})).not.toBeVisible();
  await page.getByLabel('Start time',{exact:true}).fill('23:47');
  await page.getByLabel('End time',{exact:true}).fill('06:12');
  await page.locator('.event-end-day summary').click();
  await page.getByLabel('End day',{exact:true}).selectOption('2026-10-18');
  await page.getByRole('button',{name:'Add to itinerary',exact:true}).click();
  await page.reload();
  const events=await page.evaluate(()=>JSON.parse(localStorage.getItem('trip-planner-demo-v1:demo-maya')!).trips.find((trip:{id:string})=>trip.id==='seattle').events);
  expect(events).toHaveLength(2);
  expect(events.find((event:{name:string})=>event.name==='Night ferry')).toMatchObject({date:'2026-10-17',endDate:'2026-10-18',start:'23:47',end:'06:12'});
});
