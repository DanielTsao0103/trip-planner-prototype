import { expect, test } from '@playwright/test';

// These regressions exercise user-visible failures found in independent local reviews.
test.beforeEach(async ({ page }) => {
  await page.route('https://places.googleapis.com/**', route => route.abort());
  await page.addInitScript(() => sessionStorage.setItem('trip-planner-demo-session', 'active'));
  await page.route('https://maps.googleapis.com/maps/api/js?**', route => route.abort());
});

test('suggestion cancellation and preferences preserve their originating page', async ({ page }) => {
  await page.goto('./#/9');
  await page.getByRole('button', {name: 'Choose a time'}).first().click();
  await page.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(page).toHaveURL(/#\/9$/);
  await page.getByRole('button', {name: 'Update your preferences'}).click();
  await page.getByRole('button', {name: 'Next', exact: true}).click();
  await page.getByLabel('Maximum comfortable continuous walk (meters)').fill('-1');
  await page.getByRole('button', {name: 'Next', exact: true}).click();
  await expect(page.getByRole('alert')).toContainText('Enter a whole number');
  await expect(page.getByLabel('Maximum comfortable continuous walk (meters)')).toBeVisible();
  await page.getByLabel('Maximum comfortable continuous walk (meters)').fill('500');
  await page.getByRole('button', {name: 'Next', exact: true}).click();
  await page.getByRole('button', {name: 'Save my preferences'}).click();
  await expect(page).toHaveURL(/#\/9$/);
  await expect(page.getByRole('status').filter({hasText:'Trip preferences saved.'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Update your preferences'})).toBeVisible();
  await page.goto('./#/7');
  await expect(page.locator('.toast').filter({ hasText: 'Trip preferences saved.' })).toHaveCount(0);
});

test('unreadable photos are rejected while a decoded photo remains saveable', async ({ page }) => {
  await page.goto('./#/7?event=museum&date=2026-10-16');
  await page.locator('.event-photo-disclosure summary').click();
  const input = page.getByLabel('Upload your own event photo');
  const originalImage = await page.getByAltText('Your event photo preview').getAttribute('src');
  await input.setInputFiles({name:'broken.png', mimeType:'image/png', buffer:Buffer.from('not an image')});
  await expect(page.getByRole('alert')).toContainText('That image could not be read');
  await expect(page.getByAltText('Your event photo preview')).toHaveAttribute('src', originalImage!);
  // Generated in the test browser, with no local/private image exported.
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width=16; canvas.height=16;
    const context = canvas.getContext('2d')!; context.fillStyle='#38678a'; context.fillRect(0,0,16,16);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await input.setInputFiles({name:'test.png', mimeType:'image/png', buffer:Buffer.from(png,'base64')});
  await expect(page.getByAltText('Your event photo preview')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', {name:'Save changes',exact:true}).click();
  await page.reload();
  await page.goto('./#/7?event=museum&date=2026-10-16');
  await page.locator('.event-photo-disclosure summary').click();
  await expect(page.getByAltText('Your event photo preview')).toHaveAttribute('src', `data:image/png;base64,${png}`);
});

test('group chart tooltip stays in the content area and Escape dismisses it', async ({ page }) => {
  await page.setViewportSize({width:768,height:900});
  await page.goto('./#/13');
  const target=page.locator('.dietary-bubble-item').first();
  await target.focus();
  const tooltip=target.getByRole('tooltip', {includeHidden:true});
  await expect(tooltip).toHaveCSS('opacity','1');
  const bounds=await tooltip.boundingBox(); const main=await page.locator('main').boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(main!.x);
  expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(768);
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCSS('opacity','0');
  await expect(target).toBeFocused();
});

test('demo trip cover can be cleared or saved locally without requiring an account', async ({ page }) => {
  await page.route('https://photon.komoot.io/**', route => route.fulfill({json: {features: []}}));
  await page.route('https://geocoding-api.open-meteo.com/**', route => route.fulfill({json: {
    results: [{name: 'Bainbridge Island', timezone: 'America/Los_Angeles'}],
  }}));
  const uploads: string[]=[];
  await page.route('https://*.supabase.co/storage/**', route => {uploads.push(route.request().url());return route.abort();});
  await page.route('**/functions/v1/unsplash-search?**', route=>route.fulfill({json:[]}));
  await page.goto('./#/6?edit=true');
  const png = await page.evaluate(() => {
    const canvas=document.createElement('canvas');canvas.width=20;canvas.height=10;
    const context=canvas.getContext('2d')!;context.fillStyle='#415d77';context.fillRect(0,0,20,10);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const file={name:'generated-cover.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')};
  await page.locator('.trip-photo-disclosure summary').click();
  const input=page.locator('.trip-photo-upload input');
  await input.setInputFiles(file);
  await expect(page.getByRole('button',{name:'Keep current cover',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Keep current cover',exact:true}).click();
  await expect(page.getByRole('button',{name:'Keep current cover',exact:true})).toHaveCount(0);
  await input.setInputFiles(file);
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(page).toHaveURL(/#\/8$/);
  await page.reload();
  await expect(page.locator('.trip-hero > img')).toHaveAttribute('src',`data:image/png;base64,${png}`);
  expect(uploads).toEqual([]);
});

test('secondary time-zone failure describes the active calendar and retires after removal', async ({ page }) => {
  await page.route('https://photon.komoot.io/**', route => route.abort());
  await page.route('https://geocoding-api.open-meteo.com/**', route =>
    new URL(route.request().url()).searchParams.get('name') === 'Taipei'
      ? route.fulfill({ json: { results: [{ name: 'Taipei', timezone: 'Asia/Taipei' }] } })
      : route.abort());
  await page.route('**/functions/v1/unsplash-search?**', route => route.fulfill({ json: [] }));
  await page.goto('./#/6');
  const add = async (place: string) => {
    await page.getByLabel('Where are you going?', { exact: true }).fill(place);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
  };
  await add('Taipei');
  await expect(page.locator('.trip-timezone-list')).toContainText('Taipei — Taiwan Standard Time');
  await add('Mystery Island');
  await expect(page.getByText(/Some destination time zones could not be found\. Event times use/)).toBeVisible();
  await expect(page.getByLabel('Calendar time zone', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Remove Mystery Island', exact: true }).click();
  await expect(page.getByText(/Some destination time zones could not be found/)).toHaveCount(0);
  await add('Mystery Island');
  await expect(page.getByText(/Some destination time zones could not be found\. Event times use/)).toBeVisible();
  await page.getByRole('button', { name: 'Remove Taipei', exact: true }).click();
  await expect(page.getByLabel('Calendar time zone', { exact: true })).toBeVisible();
  await expect(page.getByText(/Choose the calendar time zone below/)).toBeVisible();
});

test('concurrent destination lookups retain successful zones when another destination fails', async ({ page }) => {
  await page.route('https://photon.komoot.io/**', route => route.abort());
  await page.route('**/functions/v1/unsplash-search?**', route => route.fulfill({ json: [] }));
  await page.route('https://geocoding-api.open-meteo.com/**', async route => {
    const name = new URL(route.request().url()).searchParams.get('name');
    await new Promise(resolve => setTimeout(resolve, name === 'Taipei' ? 1000 : 100));
    await route.fulfill(name === 'Taipei'
      ? { json: { results: [{ name: 'Taipei', timezone: 'Asia/Taipei' }] } }
      : { status: 503, json: { reason: 'Secondary lookup unavailable' } });
  });
  await page.goto('./#/6');
  for (const destination of ['Taipei', 'Mystery Island']) {
    await page.getByLabel('Where are you going?', { exact: true }).fill(destination);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
  }
  await expect(page.locator('.trip-timezone-list')).toContainText('Taipei — Taiwan Standard Time');
  await expect(page.locator('.trip-timezone-list')).toContainText('Mystery Island — Time zone unavailable');
  await expect(page.getByLabel('Calendar time zone', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Event times use Taiwan Standard Time/)).toBeVisible();
  await page.getByLabel('Trip title', { exact: true }).fill('Partial destination lookup');
  await page.getByLabel('Start date', { exact: true }).fill('2027-05-01');
  await page.getByLabel('End date', { exact: true }).fill('2027-05-04');
  await page.getByRole('button', { name: 'Create trip', exact: true }).click();
  await page.getByRole('button', { name: 'Partial destination lookup', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Edit trip', exact: true }).click();
  await expect(page.locator('.trip-timezone-list')).toContainText('Taipei — Taiwan Standard Time');
  await expect(page.locator('.trip-timezone-list')).toContainText('Mystery Island — Time zone unavailable');
  await expect(page.getByLabel('Calendar time zone', { exact: true })).toHaveCount(0);
});

test('creating directly from a typed destination waits for its calendar time zone', async ({page}) => {
  await page.route('https://photon.komoot.io/**',r=>r.abort());
  await page.route('**/functions/v1/unsplash-search?**',r=>r.fulfill({json:[]}));
  await page.route('https://geocoding-api.open-meteo.com/**',async r=>{
    await new Promise(resolve=>setTimeout(resolve,400));
    await r.fulfill({json:{results:[{name:'Taipei',timezone:'Asia/Taipei'}]}});
  });
  await page.goto('./#/6');
  await page.getByLabel('Trip title',{exact:true}).fill('Typed Taipei');
  await page.getByLabel('Where are you going?',{exact:true}).fill('Taipei');
  await page.getByLabel('Start date',{exact:true}).fill('2027-05-01');
  await page.getByLabel('End date',{exact:true}).fill('2027-05-04');
  await page.getByRole('button',{name:'Create trip',exact:true}).click();
  await expect(page.getByRole('button',{name:'Typed Taipei',exact:true})).toBeVisible();
  const trip=await page.evaluate(()=>JSON.parse(localStorage.getItem('trip-planner-demo-v1:demo-maya')!).trips.find((t:any)=>t.title==='Typed Taipei'));
  expect(trip.destinations).toEqual(['Taipei']);
  expect(trip.zone).toBe('Asia/Taipei');
  expect(trip.destinationTimezones).toEqual(['Asia/Taipei']);
  await page.getByRole('button',{name:'Typed Taipei',exact:true}).click();await page.reload();
  await page.getByRole('button',{name:'Edit trip',exact:true}).click();
  await expect(page.locator('.trip-timezone-list')).toContainText('Taipei — Taiwan Standard Time');
});

test('typed destination lookup failure retains the draft and honors an explicit calendar fallback', async ({page}) => {
  await page.route('https://photon.komoot.io/**',r=>r.abort());
  await page.route('https://geocoding-api.open-meteo.com/**',r=>r.fulfill({status:503,json:{reason:'Unavailable'}}));
  await page.route('**/functions/v1/unsplash-search?**',r=>r.fulfill({json:[]}));
  for(const confirmFirst of [false,true]){
    await page.goto('./#/6');
    const title=confirmFirst?'Explicit fallback':'Review fallback';
    await page.getByLabel('Trip title',{exact:true}).fill(title);
    await page.getByLabel('Where are you going?',{exact:true}).fill('Mystery Island');
    await page.getByLabel('Start date',{exact:true}).fill('2027-05-01');
    await page.getByLabel('End date',{exact:true}).fill('2027-05-04');
    if(confirmFirst)await page.getByLabel('Calendar time zone',{exact:true}).selectOption('Asia/Taipei');
    await page.getByRole('button',{name:'Create trip',exact:true}).click();
    if(!confirmFirst){
      await expect(page.locator('.trip-form-error')).toContainText('Choose a calendar time zone');
      await expect(page.getByLabel('Calendar time zone',{exact:true})).toBeFocused();
      await expect(page.getByLabel('Calendar time zone',{exact:true})).toBeInViewport({ratio:1});
      await page.screenshot({path:test.info().outputPath('typed-zone-review.png')});
      await expect(page.getByLabel('Trip title',{exact:true})).toHaveValue(title);
      expect(await page.evaluate(title=>JSON.parse(localStorage.getItem('trip-planner-demo-v1:demo-maya')!).trips.some((t:any)=>t.title===title),title)).toBe(false);
      await page.getByLabel('Calendar time zone',{exact:true}).selectOption('Asia/Taipei');
      await page.getByRole('button',{name:'Create trip',exact:true}).click();
    }
    await expect(page.getByRole('button',{name:title,exact:true})).toBeVisible();
    const trip=await page.evaluate(title=>JSON.parse(localStorage.getItem('trip-planner-demo-v1:demo-maya')!).trips.find((t:any)=>t.title===title),title);
    expect(trip.zone).toBe('Asia/Taipei');expect(trip.destinationTimezones).toEqual([null]);
  }
});

test('saving during an Add lookup waits, and leaving a pending lookup cannot create a trip', async ({page}) => {
  await page.route('https://photon.komoot.io/**',r=>r.abort());
  await page.route('**/functions/v1/unsplash-search?**',r=>r.fulfill({json:[]}));
  await page.route('https://geocoding-api.open-meteo.com/**',async r=>{
    const name=new URL(r.request().url()).searchParams.get('name');
    await new Promise(resolve=>setTimeout(resolve,900));
    await r.fulfill({json:{results:[{name,timezone:'Asia/Taipei'}]}}).catch(()=>{});
  });
  for(const leave of [false,true]){
    await page.goto('./#/6');
    const title=leave?'Abandoned lookup':'Quick Add lookup';
    await page.getByLabel('Trip title',{exact:true}).fill(title);
    await page.getByLabel('Start date',{exact:true}).fill('2027-05-01');
    await page.getByLabel('End date',{exact:true}).fill('2027-05-04');
    await page.getByLabel('Where are you going?',{exact:true}).fill(leave?'Tainan':'Taipei');
    if(!leave)await page.getByRole('button',{name:'Add',exact:true}).click();
    await page.getByRole('button',{name:'Create trip',exact:true}).click();
    await expect(page.getByRole('button',{name:'Finding time zones…'})).toBeDisabled();
    if(leave){await page.getByRole('link',{name:'Home',exact:true}).click();await page.waitForTimeout(1100);}
    else await expect(page.getByRole('button',{name:title,exact:true})).toBeVisible();
    const trip=await page.evaluate(title=>JSON.parse(localStorage.getItem('trip-planner-demo-v1:demo-maya')!).trips.find((t:any)=>t.title===title),title);
    if(leave)expect(trip).toBeUndefined();else expect(trip.zone).toBe('Asia/Taipei');
  }
});

test('a copied starter cannot create hidden plans outside a shortened trip', async ({ page }) => {
  await page.route('https://*.supabase.co/**', route => route.fulfill({ json: [] }));
  // Keep the primary geocoder deterministic so it cannot time out before the mocked fallback.
  await page.route('https://photon.komoot.io/**', route => route.fulfill({ json: { features: [] } }));
  await page.route('https://geocoding-api.open-meteo.com/**', route => route.fulfill({ json: { results: [{ name: 'Seattle', timezone: 'America/Los_Angeles' }] } }));
  await page.goto('./#/6?template=seattle');
  await page.getByLabel('Trip title', { exact: true }).fill('Template date boundary');
  const start = page.getByLabel('Start date', { exact: true });
  const end = page.getByLabel('End date', { exact: true });
  await start.fill('2027-06-02');
  await start.blur();
  await end.fill('2027-06-03');
  await end.blur();
  const count = await page.evaluate(() => JSON.parse(localStorage.getItem('trip-planner-demo-v1:demo-maya')!).trips.length);
  await page.getByRole('button', { name: 'Create trip', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Choose June 5, 2027 or later.' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'End date calendar', exact: true })).toHaveCount(0);
  await expect(page.getByRole('alert').filter({ hasText: 'Choose June 5, 2027 or later.' })).toBeInViewport({ratio:1});
  await page.screenshot({path:test.info().outputPath('invalid-date-without-obscuring-calendar.png')});
  await expect(page.locator('.mobile-trip-preview')).toContainText('Check your dates');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('trip-planner-demo-v1:demo-maya')!).trips.length)).toBe(count);
  await page.getByRole('button', {name: 'Open calendar for End date', exact: true}).click();
  await page.getByRole('button', {name: 'June 5, 2027', exact: true}).click();
  await expect(end).toHaveValue('June 5, 2027');
  await expect(page.locator('.mobile-trip-preview')).toContainText('Jun 2 – Jun 5 · 4 days');
  await page.getByRole('button', { name: 'Create trip', exact: true }).click();
  await page.getByRole('button', { name: 'Template date boundary', exact: true }).click();
  await page.getByRole('button', { name: 'List', exact: true }).click();
  await expect(page.locator('[id^="itinerary-event-"]')).toHaveCount(7);
  await page.reload();
  await expect(page.locator('[id^="itinerary-event-"]')).toHaveCount(7);
  const saved = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('trip-planner-demo-v1:demo-maya')!);
    return state.trips.find((trip: { title: string }) => trip.title === 'Template date boundary');
  });
  expect(saved.events.every((event: { date: string }) => event.date >= saved.start && event.date <= saved.end)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('template-all-plans-visible.png') });
});

test('typing a day outside the trip preserves context and explains the date boundary', async ({ page }) => {
  await page.goto('./#/11?date=2026-10-16');
  const chooser = page.getByLabel('Choose a day', { exact: true });
  for (const [date, message] of [['2026-10-14', 'or later'], ['2026-10-19', 'or earlier']]) {
    await chooser.fill(date);
    await expect(page.getByRole('dialog', { name: 'Choose a day calendar', exact: true })).toHaveCount(0);
    await chooser.blur();
    await expect(page.getByRole('alert').filter({ hasText: message })).toBeVisible();
    await expect(page).toHaveURL(/date=2026-10-16$/);
    await expect(page.getByRole('heading', { name: 'Friday, Oct 16', exact: true })).toBeVisible();
    await expect(chooser).toHaveValue(date);
  }
  await chooser.fill('2026-10-17');
  await chooser.blur();
  await expect(page.getByRole('heading', { name: 'Saturday, Oct 17', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('unresolved destination keeps its unknown status after calendar time zone is saved', async ({ page }) => {
  await page.route('https://geocoding-api.open-meteo.com/**', route=>route.abort());
  await page.route('https://photon.komoot.io/**', route=>route.abort());
  await page.route('**/functions/v1/unsplash-search?**', route=>route.fulfill({json:[]}));
  await page.goto('./#/6');
  await page.getByLabel('Trip title',{exact:true}).fill('Time zone fallback test');
  await page.getByLabel('Where are you going?',{exact:true}).fill('Mystery Island');
  await page.getByRole('button',{name:'Add',exact:true}).click();
  await expect(page.getByLabel('Calendar time zone',{exact:true})).toBeVisible();
  await page.getByLabel('Calendar time zone',{exact:true}).selectOption('Asia/Taipei');
  await page.getByLabel('Start date',{exact:true}).fill('2027-05-01');
  await page.getByLabel('End date',{exact:true}).fill('2027-05-04');
  await page.getByRole('button',{name:'Create trip',exact:true}).click();
  await page.getByRole('button',{name:'Time zone fallback test',exact:true}).click();
  await expect(page).toHaveURL(/#\/8$/);
  await page.reload();
  await page.getByRole('button',{name:'Edit trip',exact:true}).click();
  await expect(page.locator('.trip-timezone-list')).toContainText('Time zone unavailable');
  await expect(page.getByLabel('Calendar time zone',{exact:true})).toHaveValue('Asia/Taipei');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await page.getByRole('button',{name:'Add event',exact:true}).first().click();
  await expect(page.getByText(/Times in Taipei/)).toBeVisible();
});

test('simultaneous calendar events have separate readable lanes and retain exact-minute drag', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Desktop time-grid interaction');
  await page.goto('./#/8?view=calendar');
  await page.waitForFunction(()=>!!localStorage.getItem('trip-planner-demo-v1:demo-maya'));
  await page.evaluate(() => {
    const key='trip-planner-demo-v1:demo-maya'; const state=JSON.parse(localStorage.getItem(key)!);
    const trip=state.trips[0]; const original=trip.events.find((event:any)=>event.id==='museum');
    trip.events.push({...original,id:'overlap-one',name:'Coffee with the group',start:'10:00',end:'11:30'}, {...original,id:'overlap-two',name:'A second overlapping plan',start:'10:15',end:'10:45'});
    localStorage.setItem(key,JSON.stringify(state));
  });
  await page.reload();
  const cards=page.locator('[data-calendar-date="2026-10-16"] .itcal-event').filter({has:page.locator('[title="A morning of art"], [title="Coffee with the group"], [title="A second overlapping plan"]')});
  const bounds=await cards.evaluateAll(elements=>elements.map(element=>{const r=element.getBoundingClientRect();return {x:r.x,width:r.width};}));
  expect(bounds).toHaveLength(3);
  for(const box of bounds) expect(box.width).toBeGreaterThanOrEqual(140);
  const ordered=bounds.sort((a,b)=>a.x-b.x);
  for(let i=1;i<ordered.length;i++)expect(ordered[i].x).toBeGreaterThanOrEqual(ordered[i-1].x+ordered[i-1].width);
  await page.getByRole('button',{name:'Show agenda',exact:true}).click();
  await expect(page.getByRole('region',{name:'Seven-day agenda',exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'Seven-day agenda',exact:true})).toContainText('A second overlapping plan');
  await page.getByRole('button',{name:'Show time grid',exact:true}).click();
  await page.locator(".itcal-scroll").evaluate(el => { el.scrollIntoView({block:"start"}); el.scrollTop=0; });
  // Start the drag before scrolling to a destination outside the dense grid's viewport.
  // dragTo scrolls the target before its first move, which can put another lane under the pointer.
  const source = page.locator('[data-event-id="museum"]');
  await source.scrollIntoViewIfNeeded();
  const sourceBox = (await source.boundingBox())!;
  await page.mouse.move(sourceBox.x + 12, sourceBox.y + 39);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + 18, sourceBox.y + 39, {steps:3});
  await expect(source).toHaveClass(/is-dragging/);
  await page.locator('.itcal-scroll').evaluate(el => { el.scrollLeft=el.scrollWidth; el.scrollTop=0; });
  const targetBox = (await page.locator('[data-calendar-date="2026-10-18"]').boundingBox())!;
  await page.mouse.move(targetBox.x + 50, targetBox.y + 3*72+39+8, {steps:8});
  await page.mouse.move(targetBox.x + 50, targetBox.y + 3*72+39+8);
  await page.mouse.up();
  await page.reload();
  await expect(page.locator('[data-calendar-date="2026-10-18"] [data-event-id="museum"]')).toHaveAttribute('aria-label', /10:07 AM/);
});

test('a horizontal calendar drag after overlap rejection preserves the original minutes', async ({page}, info) => {
  test.skip(info.project.name!=='desktop','Native desktop drag geometry');
  await page.setViewportSize({width:1440,height:900});
  await page.goto('./#/8?view=calendar');
  await page.getByRole('button',{name:'Move A morning of art',exact:true}).click();
  await page.getByLabel('New start time').fill('10:07');
  await page.getByRole('button',{name:'Move event',exact:true}).click();
  await page.reload();
  const event=page.locator('[data-event-id="museum"]');
  await expect(event).toHaveAttribute('aria-label',/10:07 AM to 12:07 PM/);
  // A native pointer must start after fonts and the initial calendar scroll settle.
  await page.evaluate(async()=>{await document.fonts.ready;await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));});
  const drag=async(dx:number,dy:number)=>{
    const box=(await event.boundingBox())!;
    await page.mouse.move(box.x+80,box.y+70);await page.mouse.down();
    await page.mouse.move(box.x+80+dx,box.y+70+dy,{steps:20});
    // A second target move dispatches dragover in WebKit too.
    await page.mouse.move(box.x+80+dx,box.y+70+dy);await page.mouse.up();
  };
  await drag(0,72);
  await expect(page.getByRole('alert')).toContainText('This overlaps with Wander through Pike Place');
  await expect(event).toHaveAttribute('aria-label',/10:07 AM to 12:07 PM/);
  await drag(530,0);
  await expect(page.locator('[data-calendar-date="2026-10-18"] [data-event-id="museum"]')).toHaveAttribute('aria-label',/10:07 AM to 12:07 PM/);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-calendar-date="2026-10-18"] [data-event-id="museum"]')).toHaveAttribute('aria-label',/10:07 AM to 12:07 PM/);
});

test('phone Today week controls change visible dates and selected-day plans', async ({ page }) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('./#/10');
  await page.evaluate(() => {
    const key='trip-planner-demo-v1:demo-maya';const state=JSON.parse(localStorage.getItem(key)!);
    state.date='2026-10-16';state.trips[0].end='2026-11-03';
    localStorage.setItem(key,JSON.stringify(state));
  });
  await page.reload();
  const range=page.locator('.week-date-range');const before=await range.innerText();
  await page.getByRole('button',{name:'Next week',exact:true}).click();
  await expect(range).not.toHaveText(before);
  await expect(page.locator('.mobile-agenda h3')).toContainText('Oct 18');
  await page.getByRole('group',{name:'Choose a day this week'}).getByRole('button').nth(2).click();
  await expect(page.locator('.mobile-agenda h3')).toContainText('Oct 20');
  await page.getByRole('button',{name:'View day',exact:true}).click();
  await expect(page).toHaveURL(/date=2026-10-20/);
});

test('large budget values keep cents together and long group notes remain readable', async ({ page }) => {
  await page.setViewportSize({width:390,height:600});
  await page.goto('./#/12');
  await page.evaluate(() => {
    const key='trip-planner-demo-v1:demo-maya';const state=JSON.parse(localStorage.getItem(key)!);const trip=state.trips[0];
    trip.expenses[0].amount=9999999;trip.budget=12000000;
    trip.prefs.maya.notes='A long shared travel note. '.repeat(80)+'Final instruction: meet at the west entrance.';
    localStorage.setItem(key,JSON.stringify(state));
  });
  await page.reload();
  await expect(page.locator('.budget-stats-wide')).toBeVisible();
  for(const value of await page.locator('.budget-stats strong').all()) {
    expect(await value.evaluate(element=>element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(value).toHaveCSS('white-space','nowrap');
  }
  await page.goto('./#/13');
  await page.getByRole('button',{name:'Read note from Maya Chen',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Note from Maya Chen',exact:true});
  await expect(dialog).toContainText('Final instruction: meet at the west entrance.');
  await dialog.getByRole('button',{name:'Got it',exact:true}).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('button',{name:'Got it',exact:true})).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'Read note from Maya Chen',exact:true})).toBeFocused();
});

test('completed sample receipt collapses controls to reveal editable details', async ({ page }) => {
  await page.setViewportSize({width:390,height:600});
  await page.goto('./#/12');
  await page.getByText('Sample tools',{exact:true}).click();
  await page.getByRole('button',{name:'Try sample receipt',exact:true}).click();
  await page.getByRole('button',{name:'Use sample receipt',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Sample details added');
  await expect(page.locator('.scan-box')).toHaveCount(0);
  await expect(page.getByLabel('Amount (USD)',{exact:true})).toHaveValue('28.00');
  await expect(page.getByLabel('Amount (USD)',{exact:true})).toBeInViewport();
});

test('large groups can read every preference voter and shared note without oversized dialog headings', async ({ page }) => {
  await page.setViewportSize({width:390,height:600});
  await page.goto('./#/13');
  await page.evaluate(()=>{
    const key='trip-planner-demo-v1:demo-maya';const state=JSON.parse(localStorage.getItem(key)!);const trip=state.trips[0];
    for(let i=0;i<20;i++){const id=`stress-${i}`;trip.members.push({id,name:`Traveler ${i} Alexandria Montgomery-Wellington`,role:'Viewer',status:'accepted',days:[]});trip.prefs[id]={...trip.prefs.maya,notes:'A shared note for all twenty travelers.'};}
    localStorage.setItem(key,JSON.stringify(state));
  });
  await page.reload();
  const bubble=page.locator('.dietary-bubble-item').first();await bubble.focus();await page.keyboard.press('Enter');
  let dialog=page.getByRole('dialog');
  await expect(dialog).toContainText('Traveler 19 Alexandria Montgomery-Wellington');
  await dialog.getByRole('button',{name:'Got it',exact:true}).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('button',{name:'Got it',exact:true})).toBeInViewport();
  await expect(bubble.getByRole('tooltip')).not.toBeVisible();
  await page.keyboard.press('Escape');await expect(bubble).toBeFocused();
  await page.getByRole('button',{name:/Read note \d+ from 20 travelers/}).click();
  dialog=page.getByRole('dialog',{name:'Note from 20 travelers',exact:true});
  await expect(dialog).toContainText('A shared note for all twenty travelers.');
  const heading=await dialog.getByRole('heading').boundingBox();expect(heading!.height).toBeLessThan(120);
  await dialog.getByRole('button',{name:'Got it',exact:true}).scrollIntoViewIfNeeded();await expect(dialog.getByRole('button',{name:'Got it',exact:true})).toBeInViewport();
});

test('optional connections can be skipped immediately and phone prototype sections stay reachable', async ({ page }) => {
  await page.setViewportSize({width:390,height:600});
  await page.goto('./#/2');
  await expect(page.getByRole('button',{name:'Skip for now',exact:true})).toBeInViewport();
  await page.getByRole('button',{name:'Skip for now',exact:true}).click();
  await expect(page).toHaveURL(/#\/[45]$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  if (!await page.getByRole("button", { name: "Prototype", exact: true }).isVisible()) await page.getByRole("button", { name: "Open navigation menu", exact: true }).click();
  await page.getByRole('button',{name:'Prototype',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Prototype controls',exact:true});
  await dialog.getByRole('button',{name:'Date & time',exact:true}).click();
  await expect(dialog.getByLabel('Demo date',{exact:true})).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Explore the sample trip',exact:true})).not.toBeVisible();
  await dialog.getByRole('button',{name:'Screens',exact:true}).click();
  await expect(dialog.locator('.screen-index')).toBeVisible();
  await expect(dialog.getByLabel('Demo date',{exact:true})).not.toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Open navigation menu',exact:true}).click();
  await expect(page.getByRole('navigation',{name:'All pages'})).toBeVisible();
  await page.getByRole('dialog').getByRole('button',{name:'Style',exact:true}).click();
  await expect(page).toHaveURL(/#\/18$/);
});

test('short-phone date chooser fits the viewport and supports day keys with focus return', async ({ page }) => {
  await page.setViewportSize({width:390,height:600});
  await page.goto('./#/6?edit=true');
  const opener=page.getByRole('button',{name:'Open calendar for Start date',exact:true});
  await opener.click();
  const calendar=page.getByRole('dialog',{name:'Start date calendar',exact:true});
  await expect(calendar).toBeInViewport({ratio:1});
  await expect(calendar.locator('[data-date="2026-10-15"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(calendar.locator('[data-date="2026-10-16"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(calendar.locator('[data-date="2026-10-23"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(calendar).toHaveCount(0);await expect(opener).toBeFocused();
  await expect(page.getByLabel('Start date',{exact:true})).toHaveValue(/October 23/);
  await opener.click();await page.keyboard.press('Escape');
  await expect(calendar).toHaveCount(0);await expect(opener).toBeFocused();
});

test('invalid event times focus an inline explanation and optional photos stay collapsed', async ({ page }) => {
  await page.setViewportSize({width:390,height:600});
  await page.goto('./#/7?event=museum&date=2026-10-16');
  await expect(page.locator('.event-photo-disclosure')).not.toHaveAttribute('open','');
  await page.getByLabel('End time',{exact:true}).fill('09:00');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(page.locator('.event-time-error')).toBeFocused();
  await expect(page.getByRole('alert')).toContainText('End time must be after start time');
  await expect(page.getByRole('alert')).toBeInViewport();
  const alertBounds=await page.locator('.event-time-error').boundingBox();
  const actionBounds=await page.locator('.event-editor-actions').boundingBox();
  expect(alertBounds!.y).toBeGreaterThanOrEqual(0);
  expect(alertBounds!.y+alertBounds!.height).toBeLessThanOrEqual(actionBounds!.y);
  await page.getByLabel('End time',{exact:true}).fill('12:00');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('demo storage failure remains visible over success feedback and retries the latest edit', async ({ page }) => {
  await page.goto('./#/7?event=museum&date=2026-10-16');
  await page.evaluate(() => {
    const original=Storage.prototype.setItem;
    (window as any).restoreDemoWrites=()=>{Storage.prototype.setItem=original;};
    Storage.prototype.setItem=function(key,value){if(key.startsWith('trip-planner-demo-v1:'))throw new DOMException('Test quota failure','QuotaExceededError');return original.call(this,key,value);};
  });
  await page.getByLabel('Notes (optional)',{exact:true}).fill('Keep this change through storage recovery');
  await page.getByRole('button',{name:'Save changes',exact:true}).click();
  await expect(page.locator('.demo-storage-error')).toContainText('Demo changes will last until this page closes');
  await expect(page.locator('.toast')).toHaveCount(0);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('trip-planner-demo-v1:demo-maya')!).trips[0].events.find((event:any)=>event.id==='museum').notes)).not.toBe('Keep this change through storage recovery');
  await page.evaluate(()=>(window as any).restoreDemoWrites());
  await page.getByRole('button',{name:'Retry browser save',exact:true}).click();
  await expect(page.locator('.demo-storage-error')).toHaveCount(0);
  await page.reload();await page.goto('./#/7?event=museum&date=2026-10-16');
  await expect(page.getByLabel('Notes (optional)',{exact:true})).toHaveValue('Keep this change through storage recovery');
});

test('invalid replacement dates remain visible and cannot silently save an older date', async ({page}) => {
  // Editing this legacy seed resolves its secondary destination on save.
  await page.route('https://photon.komoot.io/**', route => route.fulfill({json: {features: []}}));
  await page.route('https://geocoding-api.open-meteo.com/**', route => route.fulfill({json: {
    results: [{name: 'Bainbridge Island', timezone: 'America/Los_Angeles'}],
  }}));
  await page.goto('./#/6?edit=true');
  const end = page.getByLabel('End date', {exact:true});
  for (const invalid of ['not a date', 'February 30, 2027']) {
    await end.fill(invalid);
    await page.getByLabel('Trip title', {exact:true}).click();
    await expect(end).toHaveValue(invalid);
    await expect(end).toHaveAttribute('aria-invalid', 'true');
    await page.getByRole('button', {name:'Save changes',exact:true}).click();
    await expect(page).toHaveURL(/#\/6\?edit=true$/);
    await expect(end).toBeFocused();
  }
  await end.fill('2026-10-20');
  await page.getByLabel('Trip title', {exact:true}).click();
  await expect(end).toHaveAttribute('aria-invalid', 'false');
  await page.getByRole('button', {name:'Save changes',exact:true}).click();
  await expect(page).toHaveURL(/#\/8$/);
  await page.reload();
  await page.getByRole('button', {name:'Edit trip',exact:true}).click();
  await expect(page.getByLabel('End date', {exact:true})).toHaveValue('October 20, 2026');
});

test('phone confirmation failure exposes recovery without a manual scroll', async ({page}) => {
  await page.setViewportSize({width:390,height:600});
  await page.goto('./#/7');
  await page.getByRole('button',{name:'Use a confirmation',exact:true}).click();
  await page.getByRole('button',{name:'Try extraction failure',exact:true}).click();
  const recovery=page.locator('.extraction-recovery');
  await expect(recovery).toBeFocused();
  await expect(recovery.getByRole('alert')).toBeInViewport();
  await expect(recovery.getByRole('button',{name:'Enter details manually',exact:true})).toBeInViewport();
  const actionBounds=(await recovery.getByRole('button',{name:'Enter details manually',exact:true}).boundingBox())!;
  await expect(page.locator('.mobile-nav')).toBeHidden();
  const actionsBounds=(await page.locator('.event-editor-actions').boundingBox())!;
  expect(actionBounds.y+actionBounds.height).toBeLessThanOrEqual(actionsBounds.y);
  await page.screenshot({path:test.info().outputPath('confirmation-recovery.png')});
  await recovery.getByRole('button',{name:'Enter details manually',exact:true}).click();
  await expect(page.getByLabel('Event name',{exact:true})).toBeVisible();
});

test('optional event photos do not leave broken images or empty image space', async ({page}) => {
  await page.goto('./#/8');
  await page.waitForFunction(()=>!!localStorage.getItem('trip-planner-demo-v1:demo-maya'));
  for (const image of ['', 'https://example.invalid/unavailable-event-photo.png']) {
    await page.route('https://example.invalid/**', route=>route.abort());
    await page.evaluate(image=>{
      const key='trip-planner-demo-v1:demo-maya';const state=JSON.parse(localStorage.getItem(key)!);
      state.trips[0].events.find((event:any)=>event.id==='museum').image=image;
      localStorage.setItem(key,JSON.stringify(state));
    },image);
    await page.reload();
    await page.goto('./#/11?event=museum&date=2026-10-16');
    const card=page.locator('#day-event-museum');
    await expect(card.getByRole('heading',{name:'A morning of art',exact:true})).toBeVisible();
    await expect(card.locator('img')).toHaveCount(0);
  }
});

test('Today exposes reminders near next stop and explains when scheduled events are over', async ({page}) => {
  await page.setViewportSize({width:390,height:600});
  await page.goto('./#/8');
  await page.waitForFunction(()=>!!localStorage.getItem('trip-planner-demo-v1:demo-maya'));
  await page.evaluate(()=>{const key='trip-planner-demo-v1:demo-maya';const s=JSON.parse(localStorage.getItem(key)!);s.date='2026-10-16';s.time='09:00';localStorage.setItem(key,JSON.stringify(s));});
  await page.reload();await page.goto('./#/10');
  await page.getByRole('button',{name:'2 reminders left',exact:true}).click();
  await expect(page.locator('.todo-card')).toBeFocused();
  await expect(page.getByLabel('New to-do',{exact:true})).toBeInViewport();
  await page.evaluate(()=>{const key='trip-planner-demo-v1:demo-maya';const s=JSON.parse(localStorage.getItem(key)!);s.time='18:00';localStorage.setItem(key,JSON.stringify(s));});
  await page.reload();
  await expect(page.getByRole('heading',{name:'No more plans today',exact:true})).toBeVisible();
});

test('long reminders stay readable beside visible actions and preserve check and remove', async ({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto('./#/8');
  await page.waitForFunction(()=>!!localStorage.getItem('trip-planner-demo-v1:demo-maya'));
  await page.evaluate(()=>{const key='trip-planner-demo-v1:demo-maya';const s=JSON.parse(localStorage.getItem(key)!);s.date='2026-10-16';s.time='09:00';localStorage.setItem(key,JSON.stringify(s));});
  await page.reload();await page.goto('./#/10');
  const text='Meet at the museum entrance after collecting everyone’s tickets and checking that the whole group has water and layers for the ferry ride.';
  await page.getByLabel('New to-do',{exact:true}).fill(text);
  await page.getByLabel('New to-do',{exact:true}).press('Enter');
  const row=page.locator('.todo-item').filter({hasText:text});
  await expect(row.locator('label')).toHaveText(text);
  expect((await row.locator('label').boundingBox())!.height).toBeLessThan(200);
  expect((await row.getByRole('button',{name:`Delete reminder: ${text}`,exact:true}).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await row.scrollIntoViewIfNeeded();
  await page.screenshot({path:test.info().outputPath('long-reminder-desktop.png')});
  await row.getByRole('checkbox',{name:text,exact:true}).check();
  await page.reload();
  await expect(row.getByRole('checkbox',{name:text,exact:true})).toBeChecked();
  await page.setViewportSize({width:390,height:600});
  await row.scrollIntoViewIfNeeded();
  await page.screenshot({path:test.info().outputPath('long-reminder-phone.png')});
  await row.getByRole('button',{name:`Delete reminder: ${text}`,exact:true}).click();
  await expect(row).toHaveCount(0);
  await page.reload();
  await expect(row).toHaveCount(0);
});

test('added sample ideas link to their saved event and survive reload', async ({ page }) => {
  await page.goto('./#/9');
  await expect(page.getByText('Sample ideas for your trip. Check venue details before you go.')).toBeVisible();
  await page.getByRole('button', {name:'Choose a time'}).first().click();
  await page.getByRole('button', {name:'Add to itinerary',exact:true}).click();
  await expect(page).toHaveURL(/#\/9$/);
  await page.reload();
  const added=page.locator('.suggestion-card').filter({hasText:'A stop for local art'});
  await expect(added.getByText(/^Added:/)).toBeVisible();
  await expect(added.getByRole('button',{name:'Choose a time'})).toHaveCount(0);
  await added.getByRole('button',{name:'View added plan'}).click();
  await expect(page).toHaveURL(/#\/11\?.*event=/);
  await expect(page.getByRole('heading',{name:'A stop for local art',exact:true})).toBeVisible();
});

test('phone event editor keeps one action bar and restores trip navigation after saving', async ({ page, isMobile }) => {
  test.skip(!isMobile,'Phone action placement');
  await page.setViewportSize({width:390,height:600});
  await page.goto('./#/7?event=museum&date=2026-10-16');
  const save=page.getByRole('button',{name:'Save changes',exact:true});
  await expect(save).toBeVisible();
  await expect(page.locator('.mobile-nav')).toBeHidden();
  await expect(page.getByRole('button',{name:'Open navigation menu',exact:true})).toBeVisible();
  const button=await save.boundingBox();
  expect(button!.y).toBeGreaterThan(96);
  expect(button!.y+button!.height).toBeLessThanOrEqual(600);
  await page.getByLabel('Event name',{exact:true}).fill('A renamed museum visit');
  await save.click();
  await expect(page).not.toHaveURL(/#\/7/);
  await expect(page.locator('.mobile-nav')).toBeVisible();
  await page.reload();
  await expect(page.getByText('A renamed museum visit').first()).toBeVisible();
});

test('receipt failure offers one manual recovery and direct demo dates open the time tab', async ({ page }) => {
  await page.goto('./#/12');
  await page.getByText('Sample tools',{exact:true}).click();
  await page.getByRole('button',{name:'Try sample receipt'}).click();
  await page.getByRole('button',{name:'Try scan failure'}).click();
  await expect(page.getByRole('alert')).toContainText('scan didn’t work');
  await expect(page.getByRole('button',{name:/Enter.*manually/})).toHaveCount(1);
  await page.getByRole('button',{name:'Enter expense manually'}).click();
  await expect(page.getByLabel('What was it for?')).toBeVisible();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.goto('./#/10');
  await page.getByRole('button',{name:'Change demo date'}).click();
  await expect(page.getByLabel('Demo date',{exact:true})).toBeVisible();
});


test('deleting a freshly recorded expense replaces outdated success feedback', async ({ page }) => {
  await page.goto('./#/12');
  await page.getByRole('button',{name:'Add expense',exact:true}).click();
  await page.getByLabel('What was it for?',{exact:true}).fill('Temporary lunch');
  await page.getByLabel('Amount (USD)',{exact:true}).fill('15');
  await page.getByRole('button',{name:'Save expense',exact:true}).click();
  const row=page.locator('.expense-row').filter({hasText:'Temporary lunch'});
  await row.getByRole('button',{name:'Edit',exact:true}).click();
  await page.getByRole('button',{name:'Delete expense',exact:true}).click();
  await page.getByRole('dialog',{name:'Delete this expense?'}).getByRole('button',{name:'Delete expense',exact:true}).click();
  await expect(row).toHaveCount(0);
  await expect(page.getByRole('status').filter({hasText:'Expense deleted.'})).toBeVisible();
  await expect(page.getByText(/Expense recorded\./)).toHaveCount(0);
});

test('demo exit keeps explicit wording and a clear target on narrow phones', async ({ page }) => {
  for(const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:844});
    await page.goto('./#/8');
    const exit=page.getByRole('button',{name:'Exit demo',exact:true});
    await expect(exit).toHaveText('Exit demo');
    const box=await exit.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  await page.getByRole('button',{name:'Exit demo',exact:true}).click();
  await expect(page.getByRole('button',{name:'Log in',exact:true})).toBeVisible();
});

test('trip picker distinguishes years and searches large collections without losing Budget context', async ({ page }) => {
  await page.goto('./#/12');
  await expect(page.getByRole('heading', { name: 'Budget', exact: true })).toBeVisible();
  await page.evaluate(() => {
    const key='trip-planner-demo-v1:demo-maya', saved=JSON.parse(localStorage.getItem(key)!);
    const original=saved.trips[0];
    for(let index=0;index<6;index++) {
      const trip=structuredClone(original);
      trip.id=`winter-${index}`;trip.title=index<2?'Winter getaway':`Other trip ${index}`;
      trip.start=`${2026+index}-12-30`;trip.end=`${2027+index}-01-03`;
      trip.destinations=[index===1?'Kyoto':'Seattle'];trip.events=[];
      saved.trips.push(trip);
    }
    localStorage.setItem(key,JSON.stringify(saved));
  });
  await page.reload();
  const openPicker=()=>page.locator('.mobile-trip-context:visible,.trip-switch:visible').click();
  await openPicker();
  const dialog=page.getByRole('dialog',{name:'Choose a trip'});
  const initialTripCount=await dialog.locator('.trip-picker > button').count();
  const winters=dialog.locator('.trip-picker > button').filter({hasText:'Winter getaway'});
  await expect(winters.nth(0)).toContainText('Dec 30, 2026 – Jan 3, 2027');
  await expect(winters.nth(1)).toContainText('Dec 30, 2027 – Jan 3, 2028');
  await dialog.getByLabel('Find a trip',{exact:true}).fill('Kyoto');
  await expect(dialog.locator('.trip-picker > button')).toHaveCount(1);
  await dialog.locator('.trip-picker > button').click();
  await expect(page).toHaveURL(/#\/12$/);
  await openPicker();
  await expect(dialog.locator('[aria-current="true"]')).toContainText('Kyoto');
  await dialog.getByLabel('Find a trip',{exact:true}).fill('no matching destination');
  await expect(dialog.getByRole('heading',{name:'No matching trips'})).toBeVisible();
  await dialog.getByRole('button',{name:'Clear search',exact:true}).click();
  await expect(dialog.locator('.trip-picker > button')).toHaveCount(initialTripCount);
  await page.keyboard.press('Escape');
  await page.goto('./#/5');
  const winterCards=page.locator('.trip-card').filter({hasText:'Winter getaway'});
  await expect(winterCards.nth(0)).toContainText('2026');
  await expect(winterCards.nth(1)).toContainText('2028');
});

test('phone keyboard fields and time errors remain above fixed actions', async ({page}) => {
  for (const height of [600,844]) {
    await page.setViewportSize({width:390,height});
    await page.goto('./#/7?event=museum&date=2026-10-16');
    await page.getByLabel('Event name',{exact:true}).focus();
    for (let index=0;index<7;index++) {
      await page.keyboard.press('Tab');
      await expect.poll(async()=>page.evaluate(()=>{
        const field=document.activeElement as HTMLElement;
        if(!field.matches('input,textarea,select'))return true;
        const rect=field.getBoundingClientRect(), bar=document.querySelector('.event-editor-actions')!.getBoundingClientRect();
        return rect.top>=96 && rect.bottom<=bar.top-10;
      })).toBe(true);
    }
    await page.getByLabel('End time',{exact:true}).fill('09:00');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await expect(page.locator('.event-time-error')).toBeFocused();
    const error=await page.locator('.event-time-error').boundingBox(),bar=await page.locator('.event-editor-actions').boundingBox();
    expect(error!.y).toBeGreaterThanOrEqual(96);expect(error!.y+error!.height).toBeLessThanOrEqual(bar!.y);
  }
});

test('suggested event puts scheduling first and Nearby recognizes an existing plan', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('./#/9');
  await page.getByRole('button',{name:'Choose a time'}).first().click();
  await expect(page.getByLabel('Start time',{exact:true})).toBeInViewport();
  await expect(page.getByLabel('Event name',{exact:true})).not.toBeVisible();
  await page.locator('.suggested-event-details > summary').click();
  await expect(page.getByLabel('Event name',{exact:true})).toHaveValue('A stop for local art');
  await page.getByRole('button',{name:'Add to itinerary',exact:true}).click();
  await page.evaluate(()=>{const key='trip-planner-demo-v1:demo-maya',s=JSON.parse(localStorage.getItem(key)!);s.date='2026-10-16';s.noticeDismissed=false;localStorage.setItem(key,JSON.stringify(s));});
  await page.reload();await page.goto('./#/10');
  await page.getByRole('button',{name:'Discover nearby',exact:true}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog).toContainText('Cedar Gallery is already in your itinerary');
  await dialog.getByRole('button',{name:'View your plan',exact:true}).click();
  await expect(page.getByRole('heading',{name:'A stop for local art',exact:true})).toBeVisible();
});

test('a viewer daily itinerary has no permission-dead-end Add action', async ({page}) => {
  await page.goto('./#/11?date=2026-10-16');
  await page.evaluate(()=>{const key='trip-planner-demo-v1:demo-maya',s=JSON.parse(localStorage.getItem(key)!);s.trips.forEach((trip:any)=>trip.members.forEach((member:any)=>{if(member.id===s.userId)member.role='Viewer';}));localStorage.setItem(key,JSON.stringify(s));});
  await page.reload();
  await expect(page.getByRole('button',{name:'Add event',exact:true})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'A morning of art',exact:true})).toBeVisible();
});

test('long repayment descriptions keep amounts and completed labels intact', async ({page}) => {
  await page.goto('./#/12');
  await page.evaluate(()=>{const key='trip-planner-demo-v1:demo-maya',s=JSON.parse(localStorage.getItem(key)!);const t=s.trips.find((trip:any)=>trip.id===s.tripId);const other=t.members.find((member:any)=>member.id!==s.userId&&member.status==='accepted').id;t.expenses.push({id:'long-repayment',purpose:'Reviewer shared lunch with a longer description to check wrapping and readability',amount:9999,category:'Food',payer:s.userId,shares:{[s.userId]:6666,[other]:3333},date:s.date,source:'Manual',settled:[other]});localStorage.setItem(key,JSON.stringify(s));});
  await page.reload();await page.getByRole('button',{name:/^Repayments/}).click();
  await page.locator('.repayment-group').first().locator('summary').click();
  const row=page.locator('.debt-row').filter({hasText:'Reviewer shared lunch'});
  await expect(row).toBeVisible();
  for(const selector of ['strong','.badge']) {
    expect(await row.locator(selector).evaluate(el=>{
      const range=document.createRange();range.selectNodeContents(el);
      return new Set([...range.getClientRects()].map(rect=>Math.round(rect.top))).size;
    })).toBe(1);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('phone group category jump and current survey breadcrumb remain reachable', async ({page}) => {
  await page.setViewportSize({width:390,height:600});
  await page.goto('./#/13');
  await page.getByLabel('Jump to a preference').selectOption({label:'Tickets and notes'});
  const category=page.locator('.preference-tile').filter({has:page.getByRole('heading',{name:'Tickets and notes',exact:true})});
  await expect(category).toBeFocused();
  await expect(category.getByRole('heading',{name:'Tickets and notes',exact:true})).toBeInViewport();
  await page.goto('./#/15');
  const current=page.locator('.breadcrumbs [aria-current="page"]');
  await expect(current).toHaveText('My preferences');
  const bounds=await current.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(390);
});


test('invalid suggested identity reopens its disclosure and focuses the missing field', async ({page}) => {
  await page.setViewportSize({width:390,height:600});
  await page.goto('./#/9');await page.getByRole('button',{name:'Choose a time'}).first().click();
  const disclosure=page.locator('.suggested-event-details');
  await disclosure.locator('summary').click();
  await page.getByLabel('Event name',{exact:true}).fill('');
  await disclosure.locator('summary').click();
  await page.getByRole('button',{name:'Add to itinerary',exact:true}).click();
  await expect(disclosure).toHaveAttribute('open','');
  const field=page.getByLabel('Event name',{exact:true});
  await expect(field).toBeFocused();
  await expect.poll(async()=>{const box=await field.boundingBox(),bar=await page.locator('.event-editor-actions').boundingBox();return box!.y>=96&&box!.y+box!.height<bar!.y;}).toBe(true);
  await field.fill('A named gallery visit');await page.getByRole('button',{name:'Add to itinerary',exact:true}).click();
  await expect(page).toHaveURL(/#\/9$/);
  await page.goto('./#/8?view=list');await expect(page.getByText('A named gallery visit',{exact:true})).toBeVisible();
});


test('Today trip picker distinguishes inactive trips from an empty collection', async ({page}) => {
  await page.goto('./#/10');
  await page.locator('.mobile-trip-context:visible,.trip-switch:visible').click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('heading',{name:'No trips on this date'})).toBeVisible();
  await expect(dialog).toContainText('October 14, 2026');
  await dialog.getByRole('button',{name:'View all trips',exact:true}).click();
  await expect(page).toHaveURL(/#\/5$/);await expect(page.locator('.trip-card').first()).toBeVisible();
});

test('connection feedback stays outside the expense ledger after navigation', async ({page}) => {
  await page.goto('./#/3?service=Instagram');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Connection canceled.'})).toBeVisible();
  await page.goto('./#/12');
  await expect(page.getByRole('heading',{name:'Budget',exact:true})).toBeVisible();
  await expect(page.getByText('Connection canceled. No new access granted.',{exact:true})).toHaveCount(0);
  await expect(page.locator('.budget-feedback')).toHaveCount(0);
});

test('an untouched empty date stays quiet until form submission', async ({page}) => {
  await page.goto('./#/6');
  await page.getByLabel('Trip title',{exact:true}).fill('Date exploration');
  await page.getByLabel('Start date',{exact:true}).click();
  await page.keyboard.press('Escape');
  await page.getByPlaceholder('Add email addresses').focus();
  await expect(page.locator('.date-range-error')).toHaveCount(0);
  await page.getByRole('button',{name:'Create trip',exact:true}).click();
  await expect(page.getByText('Choose a date.',{exact:true}).first()).toBeVisible();
  await expect(page.getByLabel('Start date',{exact:true})).toBeFocused();
});

test('saving later-day plans returns to the exact event across itinerary pages', async ({page}) => {
  await page.goto('./#/8');
  await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem('trip-planner-demo-v1:demo-maya')))).toBe(true);
  await page.evaluate(()=>{const key='trip-planner-demo-v1:demo-maya',s=JSON.parse(localStorage.getItem(key)!);s.trips.find((t:any)=>t.id===s.tripId).end='2026-10-26';localStorage.setItem(key,JSON.stringify(s));});
  await page.reload();
  for (const date of ['2026-10-18','2026-10-23']) {
    await page.goto(`./#/7?date=${date}`);
    await page.getByLabel('Event name',{exact:true}).fill(`Plan on ${date}`);
    await page.getByRole('combobox',{name:'Where',exact:true}).fill('Seattle meeting point');
    await page.keyboard.press('Escape');
    await page.getByLabel('Start time',{exact:true}).fill('09:00');
    await page.getByLabel('End time',{exact:true}).fill('10:00');
    await page.getByRole('button',{name:'Add to itinerary',exact:true}).click();
    await expect(page).toHaveURL(new RegExp(`#/8\\?date=${date}&event=[^&]+&view=list$`));
    const event=page.locator('[id^="itinerary-event-"]').filter({hasText:`Plan on ${date}`});
    await expect(event).toBeFocused();
    await expect(event).toBeInViewport();
    await expect(page.getByRole('button',{name:'List',exact:true})).toHaveAttribute('aria-pressed','true');
    await expect(page.getByLabel('Days to show',{exact:true})).toHaveValue('7');
    await expect(page.getByRole('navigation',{name:'Itinerary day pages',exact:true})).toContainText(date==='2026-10-23'?'Days 8–12 of 12':'Days 1–7 of 12');
    // Changing the page size must keep the route's exact saved event in view.
    for (const size of [10,20]) {
      await page.getByLabel('Days to show',{exact:true}).selectOption(String(size));
      await expect(page.getByRole('navigation',{name:'Itinerary day pages',exact:true})).toContainText(`Days 1–${Math.min(size,12)} of 12`);
      await expect(event).toBeFocused();
      await expect(event).toBeInViewport();
      await page.reload();
      await expect(page.getByLabel('Days to show',{exact:true})).toHaveValue(String(size));
      await expect(event).toBeFocused();
      await expect(event).toBeInViewport();
    }
    await page.getByLabel('Days to show',{exact:true}).selectOption('7');
    await expect(event).toBeFocused();
    await expect(event).toBeInViewport();
  }
});

test('changing the list page size retains the viewed day on later pages', async ({ page }) => {
  await page.goto('./#/8?view=list');
  await expect.poll(() => page.evaluate(() => Boolean(localStorage.getItem('trip-planner-demo-v1:demo-maya')))).toBe(true);
  await page.evaluate(() => {
    const key = 'trip-planner-demo-v1:demo-maya';
    const state = JSON.parse(localStorage.getItem(key)!);
    state.trips.find((trip: { id: string }) => trip.id === state.tripId).end = '2026-11-05';
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  const pager = page.getByRole('navigation', { name: 'Itinerary day pages', exact: true });
  await pager.getByRole('button', { name: 'Next days', exact: true }).click();
  await expect(pager).toContainText('Days 8–14 of 22');
  await page.getByLabel('Days to show', { exact: true }).selectOption('10');
  await expect(pager).toContainText('Days 1–10 of 22');
  await expect(page.locator('#day-2026-10-22')).toBeFocused();
  await expect(page.locator('#day-2026-10-22')).toBeInViewport();
  await pager.getByRole('button', { name: 'Next days', exact: true }).click();
  await pager.getByRole('button', { name: 'Next days', exact: true }).click();
  await expect(pager).toContainText('Days 21–22 of 22');
  await page.getByLabel('Days to show', { exact: true }).selectOption('7');
  await expect(pager).toContainText('Days 15–21 of 22');
  await expect(page.locator('#day-2026-11-04')).toBeFocused();
  await expect(page.locator('#day-2026-11-04')).toBeInViewport();
  const bottomPager = page.getByRole('navigation', {name: 'Day list pages', exact: true});
  await bottomPager.getByRole('button', {name: 'Previous days', exact: true}).click();
  await expect(page.locator('#day-2026-10-22')).toBeFocused();
  await expect(page.locator('#day-2026-10-22')).toBeInViewport();
});

test('trip cancellation prompts for pending edits and preserves an untouched trip without a prompt', async ({ page }, info) => {
  if(info.project.name==='mobile') await page.setViewportSize({width:390,height:600});
  const phone=page.viewportSize()!.width<=760;
  await page.goto('./#/6?edit=true');
  await expect(page.getByRole('navigation',{name:'Mobile navigation',exact:true})).not.toBeVisible();
  if(phone) await expect(page.getByRole('button',{name:'Save changes',exact:true})).toBeInViewport({ratio:1});
  await page.screenshot({path:test.info().outputPath('trip-editor-single-actions.png')});
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page).toHaveURL(/#\/8$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  if(phone) await expect(page.getByRole('navigation',{name:'Mobile navigation',exact:true})).toBeVisible();
  await page.getByRole('button', { name: 'Edit trip', exact: true }).click();
  await page.getByLabel('Trip title', { exact: true }).fill('A changed trip title');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Discard trip changes?' });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Keep editing', exact: true }).click();
  await expect(page).toHaveURL(/#\/6\?edit=true$/);
  await expect(page.getByLabel('Trip title', { exact: true })).toHaveValue('A changed trip title');
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await page.goto('./#/6');
  await page.getByLabel('Start date', { exact: true }).fill('2027-05-01');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page).toHaveURL(/#\/6$/);
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await expect(page).toHaveURL(/#\/4$/);
});

test('a new manual event starts in a free hour while explicit and existing times remain intact', async ({page}) => {
  await page.route('https://photon.komoot.io/**', route => route.fulfill({json:{features:[]}}));
  await page.goto('./#/8');
  await page.getByRole('button',{name:'Add event',exact:true}).click();
  await page.getByLabel('Event name',{exact:true}).fill('A free hour for coffee');
  await page.getByRole('combobox',{name:'Where',exact:true}).fill('Local café');
  await page.getByRole('button',{name:'Add to itinerary',exact:true}).click();
  await expect(page).toHaveURL(/#\/8\?/);
  const saved = await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem('trip-planner-demo-v1:demo-maya')!);
    const trip = state.trips.find((t:any) => t.id === state.tripId);
    const event = trip.events.find((e:any) => e.name === 'A free hour for coffee');
    return {event, conflicts:trip.events.filter((e:any) => e.id !== event.id && e.date === event.date && e.start < event.end && e.end > event.start).length};
  });
  expect(saved.conflicts).toBe(0);
  await page.goto(`./#/7?event=${saved.event.id}&date=${saved.event.date}`);
  await expect(page.getByLabel('Start time',{exact:true})).toHaveValue(saved.event.start);
  await expect(page.getByLabel('End time',{exact:true})).toHaveValue(saved.event.end);
  await page.goto('./#/7?date=2026-10-15&start=18:30&end=19:15');
  await expect(page.getByLabel('Start time',{exact:true})).toHaveValue('18:30');
  await expect(page.getByLabel('End time',{exact:true})).toHaveValue('19:15');
  await page.evaluate(() => {
    const key = 'trip-planner-demo-v1:demo-maya';
    const state = JSON.parse(localStorage.getItem(key)!);
    const trip = state.trips.find((t:any) => t.id === state.tripId);
    trip.events.push({...trip.events[0], id:'fully-booked-day', date:trip.start, start:'09:00', end:'18:00'});
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.goto('./#/7');
  await page.reload();
  await expect(page.getByLabel('Start time',{exact:true})).toHaveValue('');
  await expect(page.getByLabel('End time',{exact:true})).toHaveValue('');
});

test('sample confirmation chooses a free slot instead of colliding with the hotel', async ({page}) => {
  await page.goto('./#/7?date=2026-10-15');
  await page.getByRole('button',{name:'Use a confirmation',exact:true}).click();
  await page.getByRole('button',{name:'Try a sample confirmation',exact:true}).click();
  await expect(page.getByLabel('Event name',{exact:true})).toHaveValue('A visit to the gallery');
  await page.getByRole('button',{name:'Add to itinerary',exact:true}).click();
  await expect(page).toHaveURL(/#\/8\?date=2026-10-15&event=[^&]+&view=list$/);
  await expect(page.locator('[id^="itinerary-event-"]').filter({hasText:'A visit to the gallery'})).toBeFocused();
});

test('phone location suggestions remain above the fixed editor actions', async ({page}) => {
  await page.setViewportSize({width:390,height:600});
  await page.route('https://geocoding-api.open-meteo.com/**',r=>r.fulfill({json:{results:[{name:'Seattle',latitude:47.6,longitude:-122.3}]}}));
  await page.route('https://photon.komoot.io/**',r=>r.fulfill({json:{features:[{geometry:{coordinates:[-122.3,47.6]},properties:{osm_type:'W',osm_id:9,name:'Seattle Art Museum',housenumber:'1300',street:'1st Avenue',city:'Seattle',country:'United States'}}]}}));
  await page.goto('./#/7');
  await page.getByRole('combobox',{name:'Where',exact:true}).fill('Seattle Art');
  await expect(page.getByRole('option').filter({hasText:'Seattle Art Museum'})).toBeVisible();
  await expect.poll(async()=>{const popup=await page.locator('.event-location-menu').boundingBox(), actions=await page.locator('.event-editor-actions').boundingBox();return !!popup&&!!actions&&popup.y+popup.height<=actions.y-7;}).toBe(true);
  await page.screenshot({path:test.info().outputPath('short-location-menu.png')});
  await page.getByRole('option').filter({hasText:'Seattle Art Museum'}).click();
  await expect(page.getByRole('combobox',{name:'Where',exact:true})).toHaveValue(/Seattle Art Museum/);
});

test('dismissed suggestions can be restored while an added plan remains visible', async ({page}) => {
  await page.goto('./#/9');
  await page.getByRole('button', {name:'Choose a time'}).first().click();
  await page.getByRole('button', {name:'Add to itinerary',exact:true}).click();
  await expect(page.getByRole('button', {name:'View added plan'})).toHaveCount(1);
  const before = await page.evaluate(() => { const s=JSON.parse(localStorage.getItem('trip-planner-demo-v1:demo-maya')!);return s.trips.find((trip:any)=>trip.id===s.tripId).events.length; });
  while (await page.getByRole('button', {name:'Not this time',exact:true}).count()) {
    await page.getByRole('button', {name:'Not this time',exact:true}).first().click();
  }
  await page.reload();
  await page.getByRole('button', {name:'Show suggestions again',exact:true}).click();
  await expect(page.getByRole('button', {name:'Choose a time'})).toHaveCount(2);
  await expect(page.getByRole('button', {name:'View added plan'})).toHaveCount(1);
  expect(await page.evaluate(() => { const s=JSON.parse(localStorage.getItem('trip-planner-demo-v1:demo-maya')!);return s.trips.find((trip:any)=>trip.id===s.tripId).events.length; })).toBe(before);
});

test('suggestions use future free time and never fall back to a past trip day', async ({ page }) => {
  await page.goto('./#/9');
  await page.waitForFunction(() => !!localStorage.getItem('trip-planner-demo-v1:demo-maya'));
  await page.evaluate(() => {
    const key = 'trip-planner-demo-v1:demo-maya', state = JSON.parse(localStorage.getItem(key)!);
    state.date = '2026-10-16'; state.time = '14:30';
    const trip = state.trips.find((t: { id: string }) => t.id === 'seattle');
    trip.events = [{ ...trip.events[0], id: 'afternoon-booking', date: state.date, start: '15:00', end: '16:00' }];
    localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Choose a time', exact: true }).first().click();
  await expect(page.getByLabel('Start time', { exact: true })).toHaveValue('16:00');
  await expect(page.getByLabel('End time', { exact: true })).toHaveValue('17:00');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.evaluate(() => {
    const key = 'trip-planner-demo-v1:demo-maya', state = JSON.parse(localStorage.getItem(key)!);
    state.time = '17:30'; localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Choose a time', exact: true }).first().click();
  await expect(page).toHaveURL(/date=2026-10-17/);
  await expect(page.getByLabel('Start time', { exact: true })).toHaveValue('09:00');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.evaluate(() => {
    const key = 'trip-planner-demo-v1:demo-maya', state = JSON.parse(localStorage.getItem(key)!);
    state.date = '2026-10-19'; localStorage.setItem(key, JSON.stringify(state));
  });
  await page.reload();
  await expect(page.getByText('There are no upcoming one-hour slots on your editable days.')).toBeVisible();
  for (const button of await page.getByRole('button', { name: 'Choose a time', exact: true }).all()) await expect(button).toBeDisabled();
  await page.getByRole('button', { name: 'Review your itinerary', exact: false }).click();
  await expect(page).toHaveURL(/#\/8$/);
});

test('an idea hidden in Suggestions stays hidden in Nearby until restored', async ({ page }) => {
  await page.goto('./#/9');
  await page.waitForFunction(() => !!localStorage.getItem('trip-planner-demo-v1:demo-maya'));
  await page.evaluate(() => {
    const key='trip-planner-demo-v1:demo-maya', state=JSON.parse(localStorage.getItem(key)!);
    state.date='2026-10-16'; state.time='14:30'; state.noticeDismissed=false;
    localStorage.setItem(key,JSON.stringify(state));
  });
  await page.reload();
  await page.locator('.suggestion-card').filter({hasText:'A stop for local art'}).getByRole('button',{name:'Not this time',exact:true}).click();
  await page.reload();
  await page.getByRole('button',{name:'Today',exact:true}).filter({visible:true}).click();
  await page.getByRole('button',{name:'Discover nearby',exact:true}).click();
  await expect(page.getByText('This idea is hidden in Suggestions. Trip editors can restore it there.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Review suggestions',exact:true}).click();
  await page.getByRole('button',{name:'Show suggestions again',exact:true}).click();
  await page.goto('./#/10');
  await page.getByRole('button',{name:'Discover nearby',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Cedar Gallery',exact:true})).toBeVisible();
});

test('Nearby schedules its shown idea directly and cancel returns without creating a plan', async ({page}, info) => {
  await page.setViewportSize({width:info.project.name==='mobile'?390:1440,height:info.project.name==='mobile'?600:900});
  await page.goto('./#/10');
  await page.waitForFunction(()=>!!localStorage.getItem('trip-planner-demo-v1:demo-maya'));
  await page.evaluate(()=>{const key='trip-planner-demo-v1:demo-maya',s=JSON.parse(localStorage.getItem(key)!);s.date='2026-10-16';s.time='14:30';s.noticeDismissed=false;s.location=true;localStorage.setItem(key,JSON.stringify(s));});
  await page.reload();
  const savedCount=()=>page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('trip-planner-demo-v1:demo-maya')!);return s.trips.find((t:any)=>t.id===s.tripId).events.length;});
  const before=await savedCount();
  await page.getByRole('button',{name:'Discover nearby',exact:true}).click();
  let dialog=page.getByRole('dialog');
  await expect(dialog).toContainText('A SAMPLE MATCH FOR YOU');
  await expect(dialog).toContainText('About 1 hour · Est. $40');
  await page.screenshot({path:test.info().outputPath('nearby-direct-scheduling.png')});
  await dialog.getByRole('button',{name:'Choose a time',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Choose a time.',exact:true})).toBeVisible();
  await expect(page.locator('.suggested-event-summary')).toContainText('Cedar Gallery');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('heading',{name:'Cedar Gallery',exact:true})).toBeVisible();
  expect(await savedCount()).toBe(before);
  await dialog.getByRole('button',{name:'Choose a time',exact:true}).click();
  await page.getByRole('button',{name:'Add to itinerary',exact:true}).click();
  await expect(dialog).toContainText('Cedar Gallery is already in your itinerary');
  expect(await savedCount()).toBe(before+1);
  await page.reload();
  await expect(dialog).toContainText('Cedar Gallery is already in your itinerary');
  await dialog.getByRole('button',{name:'View your plan',exact:true}).click();
  await expect(page).toHaveURL(/#\/11\?event=.*date=2026-10-16/);
  await expect(page.locator('[id^="day-event-"]').filter({has:page.getByRole('heading',{name:'A stop for local art',exact:true})})).toBeFocused();
});

test('Nearby keeps exploration available when the traveler cannot schedule a free hour', async ({page}) => {
  await page.setViewportSize({width:390,height:600});
  await page.goto('./#/10');
  await page.waitForFunction(()=>!!localStorage.getItem('trip-planner-demo-v1:demo-maya'));
  for(const role of ['Viewer','Owner']){
    await page.evaluate(role=>{const key='trip-planner-demo-v1:demo-maya',s=JSON.parse(localStorage.getItem(key)!);const t=s.trips.find((t:any)=>t.id===s.tripId);t.members.find((m:any)=>m.id===s.userId).role=role;s.date=role==='Viewer'?'2026-10-16':t.end;s.time=role==='Viewer'?'14:30':'18:30';s.noticeDismissed=false;s.location=true;localStorage.setItem(key,JSON.stringify(s));},role);
    await page.reload();
    await page.getByRole('button',{name:'Today',exact:true}).filter({visible:true}).click();
    await page.getByRole('button',{name:'Discover nearby',exact:true}).click();
    const dialog=page.getByRole('dialog');
    await expect(dialog.getByRole('button',{name:'Choose a time',exact:true})).toHaveCount(0);
    await expect(dialog.getByText(role==='Viewer' ? 'You have view-only access. Ask a trip editor to add this idea.' : 'No upcoming one-hour slot is free on your editable days.',{exact:true})).toBeInViewport({ratio:1});
    await expect(dialog.getByRole('button',{name:'Explore ideas',exact:true})).toBeInViewport({ratio:1});
    await dialog.locator('.nearby-details summary').click();
    await expect(dialog.getByRole('button',{name:'Explore ideas',exact:true})).toBeInViewport({ratio:1});
    await page.screenshot({path:test.info().outputPath(`nearby-unavailable-${role}.png`)});
    await dialog.getByRole('button',{name:'Explore ideas',exact:true}).click();
    await expect(page).toHaveURL(/#\/9$/);
    for(const button of await page.getByRole('button',{name:'Choose a time',exact:true}).all())await expect(button).toBeDisabled();
  }
});

test('compact empty dates keep direct view and add actions with viewer permissions', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 600 });
  await page.route('https://photon.komoot.io/**', route => route.fulfill({json:{features:[]}}));
  await page.goto('./#/8?view=list');
  await expect(page.getByRole('button',{name:'Add event',exact:true})).toBeVisible();
  await page.evaluate(() => {
    const key='trip-planner-demo-v1:demo-maya', state=JSON.parse(localStorage.getItem(key)!);
    state.trips.find((t:any) => t.id===state.tripId).events=[];
    localStorage.setItem(key,JSON.stringify(state));
  });
  await page.reload();
  const day=page.locator('#day-2026-10-16');
  await expect(day).toContainText('Friday · 0 plans');
  expect((await day.boundingBox())!.height).toBeLessThan(90);
  await day.scrollIntoViewIfNeeded();
  await page.screenshot({path:test.info().outputPath('compact-empty-days.png')});
  await day.getByRole('button',{name:/Day 2/}).click();
  await expect(page).toHaveURL(/#\/11\?date=2026-10-16$/);
  await page.goto('./#/8?view=list');
  await day.getByRole('button',{name:'Add event to this day',exact:true}).click();
  await expect(page.getByLabel('Day',{exact:true})).toHaveValue('2026-10-16');
  await page.getByLabel('Event name',{exact:true}).fill('First plan on Friday');
  await page.getByRole('combobox',{name:'Where',exact:true}).fill('Local meeting point');
  await page.getByRole('button',{name:'Add to itinerary',exact:true}).click();
  await expect(day).toContainText('First plan on Friday');
  await page.reload();
  await expect(day).toContainText('First plan on Friday');
  await page.evaluate(() => {
    const key='trip-planner-demo-v1:demo-maya', state=JSON.parse(localStorage.getItem(key)!);
    state.trips.find((t:any) => t.id===state.tripId).members.find((m:any) => m.id===state.userId).role='Viewer';
    localStorage.setItem(key,JSON.stringify(state));
  });
  await page.reload();
  const empty=page.locator('#day-2026-10-17');
  await expect(empty.getByRole('button',{name:'Add event to this day',exact:true})).toHaveCount(0);
  await empty.getByRole('button',{name:/Day 3/}).click();
  await expect(page).toHaveURL(/#\/11\?date=2026-10-17$/);
});
