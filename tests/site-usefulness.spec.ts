import { expect, test, type Page } from '@playwright/test';
import { seed } from '../src/data.ts';
import { installGoogleMapFixture } from './google-map-fixture';

async function setup(page: Page, change?: (state: ReturnType<typeof seed>) => void) {
  const state = seed(); change?.(state);
  await page.addInitScript(value => {
    sessionStorage.setItem('trip-planner-demo-session','active');
    if (!localStorage.getItem('site-usefulness-seeded')) {
      localStorage.setItem('trip-planner-demo-v1:demo-maya',JSON.stringify(value));
      localStorage.setItem('site-usefulness-seeded','yes');
    }
  },state);
  await installGoogleMapFixture(page);
  await page.route('https://places.googleapis.com/**',r=>r.abort());
  await page.route('https://routes.googleapis.com/**',r=>r.abort());
  await page.route('https://photon.komoot.io/**',r=>r.abort());
  await page.route('https://*.supabase.co/**',r=>r.abort());
}

test('calendar paging and jump carry the date to map, add event and nearby',async({page})=>{
  await setup(page,state=>{state.trips[0].end='2026-11-04';});
  await page.goto('./#/8?view=calendar');
  await page.getByRole('button',{name:'Next seven days'}).click();
  await expect(page).toHaveURL(/date=2026-10-22/);
  await page.getByLabel('Calendar day',{exact:true}).selectOption('2026-10-29');
  await page.getByRole('button',{name:'Nearby suggestions',exact:true}).click();
  await expect(page.getByLabel('Trip day',{exact:true})).toHaveValue('2026-10-29');
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Map & list',exact:true}).click();
  await expect(page).toHaveURL(/date=2026-10-29/);
  await page.getByRole('button',{name:'Add event',exact:true}).first().click();
  await expect(page.getByLabel('Day',{exact:true})).toHaveValue('2026-10-29');
});

test('editor time choices preserve duration and exclude the edited plan',async({page})=>{
  await setup(page);
  await page.goto('./#/7?event=museum&date=2026-10-16&view=calendar');
  const start = page.getByLabel('Start time',{exact:true}), end=page.getByLabel('End time',{exact:true});
  await start.fill('09:07'); await end.fill('09:52');
  await page.getByRole('button',{name:'Find an available time',exact:true}).click();
  const guidance=page.getByRole('region',{name:'Schedule guidance'});
  await expect(guidance).toContainText('45-minute duration');
  await guidance.getByRole('button',{name:'9:00 AM–9:45 AM',exact:true}).click();
  await expect(start).toHaveValue('09:00'); await expect(end).toHaveValue('09:45');
  await expect(guidance).not.toContainText('Overlaps A morning of art');
  await page.screenshot({path:test.info().outputPath('event-times.png'),fullPage:true});
});

test('Suggestions uses the selected day for saved places and returns there after cancel',async({page})=>{
  await setup(page,state=>{state.trips[0].savedPlaces=[{id:'garden',name:'Quiet garden',place:'Seattle garden',notes:'Bring water'}];});
  await page.goto('./#/9?date=2026-10-17');
  await expect(page.getByLabel('Planning day')).toHaveValue('2026-10-17');
  await expect(page.locator('.saved-place-row')).toContainText('Quiet garden');
  await page.locator('.saved-place-row').getByRole('button',{name:'Schedule',exact:true}).click();
  await expect(page.getByLabel('Day',{exact:true})).toHaveValue('2026-10-17');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page).toHaveURL(/#\/9\?date=2026-10-17/);
  await page.screenshot({path:test.info().outputPath('suggestions.png'),fullPage:true});
});

test('hidden-map location reveals the map and full map can focus only one day',async({page})=>{
  await setup(page);
  await page.goto('./#/11?date=2026-10-16&event=museum&map=hidden');
  const stop=page.locator('#day-event-museum');
  await stop.locator('.map-stop-details').getByRole('button',{name:/Seattle Art Museum/}).click();
  await expect(page.getByRole('complementary',{name:'Map of selected day'})).toBeVisible();
  await expect(page).not.toHaveURL(/map=hidden/);
  await page.getByRole('button',{name:'Full map',exact:true}).click();
  await expect(page).toHaveURL(/date=2026-10-16/);
  await expect(page.getByRole('checkbox',{name:'Show Day 2 events on the map'})).toBeChecked();
  await expect(page.getByRole('checkbox',{name:'Show Day 1 events on the map'})).not.toBeChecked();
  await page.getByRole('checkbox',{name:'Show events from all days on the trip'}).check();
  await expect(page.getByRole('checkbox',{name:'Show Day 1 events on the map'})).toBeChecked();
  await page.reload();
  await expect(page.getByRole('checkbox',{name:'Show events from all days on the trip'})).toBeChecked();
  await page.locator('.map-day-group').first().getByRole('button',{name:'Only this day',exact:true}).click();
  await expect(page.getByRole('checkbox',{name:'Show Day 2 events on the map'})).not.toBeChecked();
  await page.getByRole('button',{name:'Nearby suggestion',exact:true}).click();
  await expect(page.getByLabel('Trip day',{exact:true})).toHaveValue('2026-10-15');
});

test('trip search and filter survive navigation and no matches can recover',async({page})=>{
  await setup(page);
  await page.goto('./#/5');
  await page.getByLabel('Find a trip',{exact:true}).fill('Seattle');
  await expect(page.locator('.trip-card')).toHaveCount(1);
  await page.getByRole('button',{name:'Seattle & Bainbridge getaway',exact:true}).click();
  await page.goto('./#/5');
  await expect(page.getByLabel('Find a trip',{exact:true})).toHaveValue('Seattle');
  await page.getByLabel('Find a trip',{exact:true}).fill('No matching destination');
  await expect(page.getByRole('heading',{name:'No trips match your search.'})).toBeVisible();
  await page.getByRole('button',{name:'Show all trips',exact:true}).click();
  await expect(page.getByLabel('Find a trip',{exact:true})).toHaveValue('');
  await expect(page.locator('.trip-card')).toHaveCount(3);
});

test('group separates missing responses and reviews the actual survey answers',async({page})=>{
  await setup(page,state=>{delete state.trips[0].prefs.maya;});
  await page.goto('./#/13');
  await page.getByText('Who hasn’t shared preferences?',{exact:true}).click();
  await page.getByRole('button',{name:'Share my preferences',exact:true}).click();
  await page.getByRole('button',{name:/Places & pace/}).click();
  await page.getByLabel('Maximum comfortable continuous walk (meters)').fill('750');
  await page.getByRole('button',{name:/Practical details/}).click();
  await expect(page.getByRole('region',{name:'Review your preferences'})).toContainText('750 meters');
  await page.screenshot({path:test.info().outputPath('preference-review.png'),fullPage:true});
});

test('new planning tools fit a narrow viewport and dark appearance',async({page})=>{
  await setup(page,state=>{state.trips[0].end='2026-11-04';});
  await page.setViewportSize({width:320,height:740});
  await page.emulateMedia({colorScheme:'dark'});
  for(const route of ['5','8?view=calendar','9','13','17']) {
    await page.goto(`./#/${route}`);
    await expect(page.locator('#main-content')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:test.info().outputPath(`narrow-${route.split('?')[0]}.png`),fullPage:true});
  }
});

test('skip link stays offscreen until focused and mobile focused actions clear navigation',async({page})=>{
  await setup(page);
  await page.setViewportSize({width:390,height:600});
  await page.goto('./#/15');
  const skip=page.getByRole('link',{name:'Skip to content',exact:true});
  expect(await skip.evaluate(element=>element.getBoundingClientRect().bottom)).toBeLessThanOrEqual(0);
  await skip.focus();
  await expect(skip).toBeInViewport({ratio:1});
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  await page.goto('./#/9');
  const action=page.getByRole('button',{name:'Review this idea',exact:true}).last();
  await action.focus();
  await action.scrollIntoViewIfNeeded();
  const button=await action.boundingBox(), nav=await page.locator('.mobile-nav').boundingBox();
  expect(button!.y+button!.height).toBeLessThanOrEqual(nav!.y);
});

test('full map focuses a distant day and preserves All days through event editing',async({page})=>{
  await setup(page,state=>{
    const trip=state.trips[0], first=trip.events[0];
    trip.events=[{...first,id:'seattle-stop',date:'2026-10-15',point:{lat:47.6,lng:-122.3}},{...first,id:'tokyo-stop',name:'Tokyo stop',date:'2026-10-16',point:{lat:35.68,lng:139.76}}];
  });
  await page.goto('./#/17');
  await page.locator('.map-day-group').nth(1).getByRole('button',{name:'Only this day',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__googleMapFixture.instances.at(-1)?.center)).toEqual({lat:35.68,lng:139.76});
  await expect(page.locator('test-map-marker')).toHaveCount(1);
  await page.getByRole('checkbox',{name:'Show events from all days on the trip'}).check();
  await page.goto('./#/7?event=tokyo-stop&date=2026-10-16&return=17&days=all');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page).toHaveURL(/days=all/);
  await expect(page.getByRole('checkbox',{name:'Show events from all days on the trip'})).toBeChecked();
  await expect(page.locator('test-map-marker')).toHaveCount(2);
});
