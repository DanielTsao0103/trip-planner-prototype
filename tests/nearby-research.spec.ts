import { expect, test, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { seed } from "../src/data.ts";
import { blankPrefs } from "../src/domain.ts";

test("nearby entry points share a responsive context popup without fictional research", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("trip-planner-demo-session", "active"));
  await page.route("https://maps.googleapis.com/**", r => r.abort());
  for (const [route, button] of [["8", "Nearby suggestions"], ["17", "Nearby suggestion"], ["9", "Nearby suggestions"], ["11", "Find something nearby"]]) {
    await page.goto(`./#/${route}`);
    await page.getByRole("button", { name: button, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Nearby suggestions" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Nearby research is available on account trips.", {exact:true})).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Find nearby suggestions", exact: true })).toBeDisabled();
    await dialog.getByText("Planning details used", { exact: true }).click();
    await expect(dialog).toContainText("Dietary needs");
    await expect(dialog).not.toContainText("Cedar Gallery");
    expect(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`nearby-${route}.png`) });
    await page.keyboard.press("Escape");
  }
});

async function account(page: Page, generation: (request: Record<string, unknown>) => { status?: number; json: unknown }, role: "Owner" | "Day Editor" = "Owner", anchorPlace = "", blockedFirstDay = false, hasSavedPlace = false) {
  await page.route("https://places.googleapis.com/**", route => route.fulfill({json:{places:[]}}));
  const owner = { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated", email: "qa@example.com", user_metadata: { name: "QA Traveler" }, app_metadata: { provider: "email" } };
  const trip = seed().trips[0];
  trip.members = [{ id: owner.id, name: "QA Traveler", email: owner.email, role, status: "accepted", days: role === "Day Editor" ? ["2027-05-02"] : [], ...(role === "Day Editor" ? {accountId:owner.id} : {}) }];
  trip.start = "2027-05-01"; trip.end = "2027-05-03"; trip.events = anchorPlace ? [{ ...trip.events[0], id:"anchor", name:"Earlier planned stop", place:anchorPlace, date:trip.start, start:"09:00", end:"10:00", cost:0, attendees:[], image:"", notes:"" }] : []; trip.prefs = role === "Day Editor" ? {[owner.id]:blankPrefs()} : {};
  trip.savedPlaces = hasSavedPlace ? [{id:"saved-cafe",name:"Saved cafe",place:"123 Example St, Seattle",notes:""}] : [];
  if (blockedFirstDay) trip.events = [{...seed().trips[0].events[0], date:trip.start, start:"09:00",end:"21:00"}];
  const row = { tripID: "22222222-2222-4222-8222-222222222222", owner_id: owner.id, created_by: owner.id, trip_name: "Research trip", destination: "Seattle", destinations: ["Seattle"], start_date: trip.start, end_date: trip.end, timezone: "America/Los_Angeles", revision: 1, content_version: 1, content: trip };
  await page.route("https://*.supabase.co/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/token")) return route.fulfill({ json: { user: owner, access_token: "test-token", refresh_token: "test-refresh", token_type: "bearer", expires_in: 3600 } });
    if (url.pathname.endsWith("/user")) return route.fulfill({ json: owner });
    if (url.pathname.endsWith("/load_trip_bundles")) return route.fulfill({ json: [row] });
    if (url.pathname.endsWith("/save_account_trip")) {
      const data = route.request().postDataJSON().p_data;
      row.content = data; row.revision += 1;
      return route.fulfill({json:row});
    }
    if (url.pathname.endsWith("/nearby-suggestions")) return route.fulfill(generation(route.request().postDataJSON()));
    return route.fulfill({ json: [] });
  });
  await page.goto("./");
  await page.getByLabel("Email", { exact: true }).fill(owner.email);
  await page.getByLabel("Password", { exact: true }).fill("qa-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page).toHaveURL(/#\/4/);
  await page.goto("./#/5");
  await page.getByRole("button", { name: "Research trip", exact: true }).click();
  await page.goto("./#/9");
  await page.getByRole("button", { name: "Nearby suggestions", exact: true }).click();
}

test("account popup displays sourced review candidates, resets stale results and sends only request identifiers", async ({ page }) => {
  const requests: Record<string, unknown>[] = [];
  await account(page, request => {
    requests.push(request);
    return { json: { results: [{ name: "Fixture venue for UI testing", address: "Test address", reason: "Found during research for this trip day. Review the source excerpts and confirm suitability before scheduling.", durationMinutes: 60, pricePerPersonCents: null, currency: null, facts: [{ topic: "Menu", detail: "Test source fact", sourceUrl: "https://example.com/menu" }], concerns: ["Confirm access and dietary needs"], conflicts: [], status: "review", proposedTime: { start: "12:00", end: "13:00" } }] } };
  });
  const dialog = page.getByRole("dialog", { name: "Nearby suggestions" });
  await dialog.getByRole("button", { name: "Find nearby suggestions", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Places to eat" })).toBeVisible();
  await expect(dialog.locator(".nearby-more")).not.toHaveAttribute("open", "");
  await expect(dialog).not.toContainText("Found during research for this trip day");
  await dialog.getByText("More to consider", { exact: true }).click();
  await expect(dialog.getByRole("link", { name: "https://example.com/menu" })).toHaveAttribute("href", "https://example.com/menu");
  await expect(dialog.getByRole("link", { name: "View on Google Maps", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("link", { name: "Search on Google", exact: true })).toHaveAttribute("href", "https://www.google.com/search?q=Fixture+venue+for+UI+testing+Test+address");
  await expect(dialog.getByRole("link", { name: "View on Yelp", exact: true })).toHaveAttribute("href", /https:\/\/www.yelp.com\/search\?/);
  await expect(dialog.getByRole("link", { name: "View on Yelp", exact: true })).toHaveAttribute("target", "_blank");
  expect(requests).toHaveLength(1); expect(requests[0]).not.toHaveProperty("preferences");
  expect(requests[0]).toMatchObject({ date: "2027-05-01", revision: 1, intent: "lunch" });

  await expect(dialog).toContainText("Confirm access and dietary needs");
  await dialog.getByLabel("Find", { exact: true }).selectOption("dinner");
  await expect(dialog.getByRole("heading", { name: "Places to eat" })).toHaveCount(0);
  expect(requests).toHaveLength(1);
});
test("suggestions do not substitute a city photo when the exact venue search fails", async ({ page }) => {
  const queries: string[] = [];
  await account(page, () => ({ json: { results: [{ name: "Photo fallback venue", address: "Seattle", reason: "A researched option", durationMinutes: 60, pricePerPersonCents: null, currency: null, facts: [{ topic: "Venue", detail: "Test source fact", sourceUrl: "https://example.com/venue" }], concerns: [], conflicts: [], status: "review", proposedTime: { start: "12:00", end: "13:00" } }] } }));
  await page.route("**/functions/v1/unsplash-search**", route => {
    queries.push(new URL(route.request().url()).searchParams.get("query") || "");
    return route.fulfill({ status: 503, json: { message: "Photo service unavailable" } });
  });
  const dialog = page.getByRole("dialog", { name: "Nearby suggestions" });
  await dialog.getByRole("button", { name: "Find nearby suggestions", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Photo fallback venue", exact: true })).toBeVisible();
  await expect.poll(() => queries.length).toBe(1);
  expect(queries[0]).toContain("Photo fallback venue");
  await expect(dialog.locator(".nearby-result-photo")).toHaveCount(0);
  await expect(dialog.locator(".nearby-photo-credit")).toHaveCount(0);
  expect(queries).not.toContain("Seattle city landscape");
  await expect(dialog).not.toContainText(/Illustrative photo|Area photo/);
});

test("city guide fallback offers source exploration without an unrelated photo, scheduling or fit claims", async ({ page }) => {
  const source = "https://tourism.example/seattle/things-to-do";
  await account(page, () => ({ json: { results: [{ name: "Explore Seattle and the surrounding region", address: "Seattle", kind: "guide", reason: "Explore this city guide for broader activity ideas.", fitNote: "This source can help you find an activity to review with your group.", durationMinutes: 60, pricePerPersonCents: null, currency: null, facts: [{ topic: "City guide", detail: "Discover local attractions, parks, and cultural activities.", sourceUrl: source }], concerns: ["Choose a specific activity and confirm travel time, accessibility and cost before scheduling."], conflicts: [], status: "review", proposedTime: null }] } }));
  const dialog = page.getByRole("dialog", { name: "Nearby suggestions" });
  await dialog.getByRole("button", { name: "Find nearby suggestions", exact: true }).click();
  const card = dialog.locator(".nearby-result");
  await expect(card.getByRole("heading", { name: "Seattle", exact: true })).toBeVisible();
  await card.getByText("More to consider",{exact:true}).click();
  const explore = card.getByRole("link", { name: "Explore city and region ideas", exact: true });
  await explore.scrollIntoViewIfNeeded();
  await expect(explore).toHaveAttribute("href", source);
  await expect(explore).toHaveAttribute("target", "_blank");
  await expect(card.getByRole("button", { name: "Add to itinerary", exact: true })).toBeDisabled();
  await expect(card).toContainText("Proposed time");
  await expect(card).toContainText("Price not confirmed");
  await expect(card).not.toContainText(/provisional gap|No suitable time gap found|per person|within.*budget/i);
  await expect(card.locator(".nearby-result-photo")).toHaveCount(0);
  await expect(card.locator(".nearby-photo-credit")).toHaveCount(0);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("city-guide.png") });
});

test("a sourced Yelp business page opens directly without implementation diagnostics", async ({ page }) => {
  const source = "https://www.yelp.com/biz/fixture-venue-seattle";
  await account(page, () => ({ json: { results: [{ name: "Fixture venue", address: "Address needs confirmation from the venue", reason: "Fixture", durationMinutes: 60, pricePerPersonCents: null, currency: null, facts: [{ topic: "Menu", detail: "Fixture Yelp excerpt", sourceUrl: source }], concerns: ["Confirm with venue"], conflicts: [], status: "review", proposedTime: null }], diagnostics: { sourcesFound: 2, sourcesUsed: 2, candidatesReturned: 1, rejected: {}, yelpStatus: "found", yelpSourcesUsed: 1 } } }));
  const dialog = page.getByRole("dialog", { name: "Nearby suggestions" });
  await dialog.getByRole("button", { name: "Find nearby suggestions", exact: true }).click();
  await dialog.getByText("More to consider", { exact: true }).click();
  await expect(dialog.getByRole("link", { name: "View on Yelp", exact: true })).toHaveAttribute("href", source);
  await expect(dialog.getByRole("link", { name: source, exact: true })).toHaveAttribute("href", source);
  await expect(dialog.getByText("Search details", {exact:true})).toHaveCount(0);
  expect(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
});

test("daily quota errors are visible and do not automatically retry", async ({ page }) => {
  let calls = 0;
  await account(page, () => { calls++; return { status: 429, json: { message: "Daily user limit reached. Try again after midnight UTC." } }; });
  const dialog = page.getByRole("dialog", { name: "Nearby suggestions" });
  await dialog.getByRole("button", { name: "Find nearby suggestions", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Daily user limit reached");
  expect(calls).toBe(1);
});
test("empty research shows a specific cause and recovery without implementation diagnostics", async ({ page }) => {
  await account(page, () => ({ json: { results: [], emptyReason: "evidence", diagnostics: { sourcesFound: 4, sourcesUsed: 3, candidatesReturned: 2, rejected: { evidence: 2 } } } }));
  const dialog = page.getByRole("dialog", { name: "Nearby suggestions" });
  await dialog.getByRole("button", { name: "Find nearby suggestions", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Not enough supporting evidence", exact: true })).toBeVisible();
  await expect(dialog).toContainText("more precise event address");
  await expect(dialog.getByText("Search details", {exact:true})).toHaveCount(0);
  await expect(dialog).not.toContainText("No sourced options passed");
  await dialog.getByLabel("Find", { exact: true }).selectOption("activity");
  await expect(dialog.getByText("Search details", { exact: true })).toHaveCount(0);
});

const candidate = { name: "Research fixture garden", address: "123 Garden Way, Seattle", addressVerified:true, recommendationType:"place", reason: "A quiet break", durationMinutes: 60, pricePerPersonCents: null, currency: null, facts: [{topic:"Hours",detail:"Check the current hours",sourceUrl:"https://example.com/garden"}], concerns:["Confirm access"], conflicts:[], status:"review", proposedTime:{start:"12:00",end:"13:00"} };

test("located ideas add once with precise addresses and distinct linked notes", async ({page})=>{
  const writes: any[]=[];
  page.on('request',request=>{if(request.url().endsWith('/save_account_trip')) writes.push(request.postDataJSON().p_data);});
  const options=[{...candidate,name:"Seattle Waterfront Park",address:"1401 Alaskan Way, Seattle",facts:[{topic:"Venue",detail:"The waterfront has public piers.",sourceUrl:"https://example.com/waterfront"}]},{...candidate,name:"Seattle Garden",address:"1075 Lake Washington Blvd E, Seattle",facts:[{topic:"Venue",detail:"The gardens have seasonal flowers.",sourceUrl:"https://example.com/gardens"}]}];
  await account(page,()=>({json:{results:options}}));
  const dialog=page.getByRole('dialog',{name:'Nearby suggestions'});
  await dialog.getByRole('button',{name:'Find nearby suggestions',exact:true}).click();
  const cards=dialog.locator('.nearby-result');
  await expect(cards).toHaveCount(2);
  await cards.first().getByRole('button',{name:'Save for later',exact:true}).click();
  await expect(cards.first().getByRole('button',{name:'Already in your plans',exact:true})).toBeDisabled();
  await cards.first().getByRole('button',{name:'Add to itinerary',exact:true}).click();
  await expect(cards.first().getByRole('button',{name:'Added to itinerary',exact:true})).toBeDisabled();
  await expect(cards.first().getByRole('button',{name:'Review and add to this day',exact:true})).toBeDisabled();
  await cards.nth(1).getByRole('button',{name:'Add to itinerary',exact:true}).click();
  await expect(cards.nth(1).getByRole('button',{name:'Added to itinerary',exact:true})).toBeDisabled();
  await expect.poll(()=>writes.at(-1)?.events.length).toBe(2);
  const events=writes.at(-1).events;
  expect(writes.at(-1).savedPlaces).toHaveLength(0);
  expect(events.map((event:any)=>event.name)).toEqual(options.map(option=>option.name));
  expect(events.map((event:any)=>event.place)).toEqual(options.map(option=>option.address));
  expect(events[0].notes).toContain('https://example.com/waterfront'); expect(events[1].notes).toContain('https://example.com/gardens');
  expect(events[0].notes).not.toEqual(events[1].notes);
  expect(events[1].start).toBe('11:00');
  await page.reload();
  expect(writes.at(-1).events).toHaveLength(2);
});

test("recommendation facts precede More to consider and sourced Maps links open the named place", async ({ page }) => {
  const maps = "https://www.google.com/maps/place/Meiji+Shrine/";
  await account(page, () => ({json:{results:[{...candidate,name:"Meiji Shrine",address:"Tokyo, Japan",fitNote:"A peaceful stop among the trees.",facts:[{topic:"Venue",detail:"Meiji Shrine in Tokyo",sourceUrl:maps}]}]}}), "Owner", "McDonald's, Seattle");
  const dialog=page.getByRole("dialog",{name:"Nearby suggestions"});
  await dialog.getByRole("button",{name:"Find nearby suggestions",exact:true}).click();
  const card=dialog.locator(".nearby-result");
  await expect(card.locator(".nearby-planning-details")).toContainText("Tokyo, Japan");
  expect(await card.evaluate(element=>{
    const note=element.querySelector('.nearby-fit-note')!, facts=element.querySelector('.nearby-planning-details')!, more=element.querySelector('.nearby-more')!;
    return !!(note.compareDocumentPosition(facts)&Node.DOCUMENT_POSITION_FOLLOWING) && !!(facts.compareDocumentPosition(more)&Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);
  await expect(card.getByRole("link",{name:"View on Google Maps",exact:true})).not.toBeVisible();
  await card.getByText("More to consider",{exact:true}).click();
  const link=card.getByRole("link",{name:"View on Google Maps",exact:true});
  await expect(link).toHaveAttribute("href",maps);
  await expect(link).toHaveAttribute("rel","noopener noreferrer");
  await expect(card.getByRole("link",{name:maps,exact:true})).toBeVisible();
  await card.getByText("More to consider",{exact:true}).click();
  await card.getByText("More to consider",{exact:true}).focus();
  await page.keyboard.press('Enter');
  await expect(link).toBeVisible();
  const finePrintSize = await card.locator('.nearby-considerations p').first().evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  const factsSize = await card.locator('.nearby-planning-details dd').first().evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  expect(finePrintSize).toBeLessThan(factsSize);
  expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({path:test.info().outputPath('nearby-more-open.png')});
  await card.getByText("More to consider",{exact:true}).click();
  await page.screenshot({path:test.info().outputPath('nearby-more-closed.png')});
});

test("shrine suggestions reject anchor and generic shrine photos and carry only the exact venue image into the event", async ({ page }) => {
  await account(page, () => ({json:{results:[{...candidate,name:"Hikawa Shrine",address:"123 Shrine Way, Seattle"}]}}), "Owner", "McDonald's, Seattle");
  const queries: string[]=[];
  const photo=(id:string,description:string)=>({id,width:1200,height:800,alt_description:description,urls:{regular:`https://images.unsplash.com/${id}`},links:{html:`https://unsplash.com/photos/${id}`,download_location:`https://api.unsplash.com/photos/${id}/download`},user:{name:"Photo fixture",links:{html:"https://unsplash.com/@fixture"}}});
  await page.route('**/functions/v1/unsplash-search?**',route=>{
    const query=new URL(route.request().url()).searchParams.get('query')||'';queries.push(query);
    const photos=[photo('mcdonalds',"McDonald's restaurant and burger sign"),photo('generic-shrine','A Shinto shrine with traditional gates in Seattle'),photo('wrong-city','Hikawa Shrine in Tokyo'),photo('shrine','Hikawa Shrine in Seattle')];
    return route.fulfill({json:{results:photos}});
  });
  await page.route('https://images.unsplash.com/**',route=>route.fulfill({path:fileURLToPath(new URL('../public/images/city.jpg',import.meta.url)),contentType:'image/jpeg'}));
  const dialog=page.getByRole('dialog',{name:'Nearby suggestions'});
  await dialog.getByRole('button',{name:'Find nearby suggestions',exact:true}).click();
  const image=dialog.locator('.nearby-result-photo');
  await expect(image).toHaveAttribute('src','https://images.unsplash.com/shrine');
  await expect.poll(()=>image.evaluate(image=>(image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(queries).toEqual(['Hikawa Shrine Seattle']);
  expect(queries.join(' ')).not.toMatch(/McDonald|Address needs confirmation/);
  await dialog.getByRole('button',{name:'Review and add to this day',exact:true}).click();
  await expect(page).toHaveURL(/#\/7/);
  await expect(page.locator('.upload-preview')).toHaveAttribute('src','https://images.unsplash.com/shrine');
});
test('researched places save once with sources, survive reload and schedule on the selected day',async({page})=>{
  await account(page,()=>({json:{results:[candidate]}}));
  const dialog=page.getByRole('dialog',{name:'Nearby suggestions'});
  await dialog.getByRole('button',{name:'Find nearby suggestions',exact:true}).click();
  await dialog.getByRole('button',{name:'Save for later',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'Already in your plans',exact:true})).toBeDisabled();
  await expect(page.locator('.save-state-banner')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.locator('.saved-place-row')).toContainText(candidate.name);
  await expect(page.locator('.saved-place-row')).toContainText('https://example.com/garden');
  await expect(page.locator('.saved-place-row')).toContainText('Confirm: Confirm access');
  await expect(page.getByRole('status').filter({hasText:'Changes saved'})).toBeVisible();
  await page.reload();
  await expect(page.locator('.saved-place-row')).toHaveCount(1);
  await page.getByLabel('Planning day',{exact:true}).selectOption('2027-05-03');
  await page.locator('.saved-place-row').getByRole('button',{name:'Schedule',exact:true}).click();
  await expect(page.getByLabel('Day',{exact:true})).toHaveValue('2027-05-03');
});

test('Nearby opens the editor directly and retains the Suggestions return day',async({page})=>{
  await account(page,()=>({json:{results:[candidate]}}));
  const dialog=page.getByRole('dialog',{name:'Nearby suggestions'});
  await dialog.getByLabel('Trip day',{exact:true}).selectOption('2027-05-03');
  await dialog.getByRole('button',{name:'Find nearby suggestions',exact:true}).click();
  await dialog.getByRole('button',{name:'Review and add to this day',exact:true}).click();
  await expect(page.getByLabel('Day',{exact:true})).toHaveValue('2027-05-03');
  await expect(page.getByLabel('Notes (optional)',{exact:true})).toContainText('https://example.com/garden');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await expect(page).toHaveURL(/#\/9\?date=2027-05-03/);
});

test('Nearby permits Day Editors to research other days but only schedule assigned dates',async({page})=>{
  await account(page,()=>({json:{results:[candidate]}}),'Day Editor');
  const dialog=page.getByRole('dialog',{name:'Nearby suggestions'});
  await dialog.getByRole('button',{name:'Find nearby suggestions',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'Review and add to this day',exact:true})).toBeDisabled();
  await expect(dialog.getByRole('button',{name:'Save for later',exact:true})).toHaveCount(0);
  await expect(dialog.getByRole('button',{name:'Add to itinerary',exact:true})).toBeDisabled();
  await dialog.getByLabel('Trip day',{exact:true}).selectOption('2027-05-02');
  await dialog.getByRole('button',{name:'Find nearby suggestions',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'Review and add to this day',exact:true})).toBeEnabled();
});

for (const operation of ['review','add']) test(`slow photo attribution does not block ${operation} or cause a duplicate later`,async({page})=>{
  await account(page,()=>({json:{results:[candidate]}}));
  const photo = {id:'fixture-photo',alt_description:'Research fixture garden in Seattle',width:1200,height:800,urls:{regular:'https://images.unsplash.com/fixture'},links:{html:'https://unsplash.com/photos/fixture',download_location:'https://api.unsplash.com/photos/fixture/download'},user:{name:'Fixture photographer',links:{html:'https://unsplash.com/@fixture'}}};
  await page.route('**/functions/v1/unsplash-search?**',r=>r.fulfill({json:{results:[photo,{...photo,id:'fixture-photo-2'}]}}));
  await page.route('https://images.unsplash.com/**',r=>r.fulfill({path:fileURLToPath(new URL('../public/images/food.jpg',import.meta.url)),contentType:'image/jpeg'}));
  let release!:()=>void, started=false, saves=0;
  page.on('request',request=>{if(request.url().endsWith('/save_account_trip'))saves++;});
  const held=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/functions/v1/unsplash-track',async r=>{started=true;await held;await r.fulfill({json:{success:true}});});
  const dialog=page.getByRole('dialog',{name:'Nearby suggestions'});
  await dialog.getByRole('button',{name:'Find nearby suggestions',exact:true}).click();
  await expect(dialog.locator('.nearby-photo-credit')).toContainText('Fixture photographer');
  const response=page.waitForResponse(r=>r.url().endsWith('/unsplash-track'));
  await dialog.getByRole('button',{name:operation==='review'?'Review and add to this day':'Add to itinerary',exact:true}).click();
  await expect.poll(()=>started).toBe(true);
  if(operation==='review')await expect(page).toHaveURL(/#\/7/);
  else await expect(dialog.getByRole('button',{name:'Added to itinerary',exact:true})).toBeDisabled();
  release(); await (await response).finished();
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  expect(saves).toBe(operation==='add'?1:0);
});


test("account suggestions prioritize usable research and saved places", async ({page}) => {
  await account(page, () => ({json:{results:[]}}));
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", {name:"Find your next stop",exact:true})).toBeVisible();
  await expect(page.getByRole("heading", {name:"Sample inspiration",exact:true})).toHaveCount(0);
  const research=page.getByRole("region",{name:"Nearby suggestions"});
  await expect(research.getByRole("button",{name:"Find nearby suggestions",exact:true})).toBeVisible();
  await research.getByRole("button",{name:"Find nearby suggestions",exact:true}).click();
  await expect(research.locator('.nearby-results')).toBeVisible();
  await expect(page.getByRole("dialog", {name:"Nearby suggestions"})).toHaveCount(0);
});


test("account event entry excludes simulated confirmation extraction", async ({page}) => {
  await account(page, () => ({json:{results:[]}}));
  await page.keyboard.press("Escape");
  await page.goto("./#/7?date=2027-05-01");
  await expect(page.getByLabel("Event name", {exact:true})).toBeVisible();
  await expect(page.getByRole("button", {name:"Use a confirmation",exact:true})).toHaveCount(0);
  await expect(page.getByLabel("Upload confirmation image", {exact:true})).toHaveCount(0);
  await page.getByText("Event photo", {exact:false}).first().click();
  await expect(page.getByRole("button", {name:"Find with Unsplash",exact:true})).toBeVisible();
});


test("Nearby remains searchable without a gap and offers the next day without changing selection", async ({page}) => {
  await account(page, () => ({json:{results:[]}}), "Owner", "", true);
  const dialog = page.getByRole("dialog", {name:"Nearby suggestions"});
  await expect(dialog.getByLabel("Trip day", {exact:true})).toHaveValue("2027-05-01");
  await expect(dialog.getByRole("button", {name:"Find nearby suggestions",exact:true})).toBeEnabled();
  await expect(dialog.getByText(/No open time block is available/)).toBeVisible();
  await dialog.getByRole("button", {name:"Try May 2",exact:true}).click();
  await expect(dialog.getByLabel("Trip day", {exact:true})).toHaveValue("2027-05-02");
  await expect(dialog.getByRole("button", {name:"Find nearby suggestions",exact:true})).toBeEnabled();
});

const googleFixture = {id:'ChIJfixtureCafe',displayName:{text:'Fixture Cafe'},formattedAddress:'123 Example Street, Seattle, WA 98101',location:{latitude:47.61,longitude:-122.33},businessStatus:'OPERATIONAL',googleMapsUri:'https://www.google.com/maps/search/?api=1&query=Fixture+Cafe&query_place_id=ChIJfixtureCafe',regularOpeningHours:{weekdayDescriptions:['Saturday: 9:00 AM–5:00 PM']},websiteUri:'https://example.com/cafe'};

test('Google place results appear without AI waiting and direct add retains complete location after reload',async({page})=>{
 let researchCalls=0;const writes:any[]=[];
 page.on('request',request=>{if(request.url().endsWith('/save_account_trip'))writes.push(request.postDataJSON().p_data);});
 await account(page,()=>{researchCalls++;return {json:{results:[]}};});
 await page.route('https://places.googleapis.com/v1/places:searchText',route=>route.fulfill({json:{places:[googleFixture]}}));
 const dialog=page.getByRole('dialog',{name:'Nearby suggestions'});
 await dialog.getByRole('button',{name:'Find nearby suggestions',exact:true}).click();
 const card=dialog.locator('.nearby-result');
 await expect(card.getByRole('heading',{name:'Fixture Cafe',exact:true})).toBeVisible();
 await expect(card).toContainText(googleFixture.formattedAddress);
 await expect(card).toContainText('Saturday: 9:00 AM–5:00 PM');
 expect(researchCalls).toBe(0);
 await card.getByRole('button',{name:'Add to itinerary',exact:true}).click();
 await expect(card.getByRole('button',{name:'Added to itinerary',exact:true})).toBeDisabled();
 await expect.poll(()=>writes.at(-1)?.events.length).toBe(1);
 expect(writes.at(-1).events[0]).toMatchObject({name:'Fixture Cafe',place:googleFixture.formattedAddress,point:{lat:47.61,lng:-122.33},googlePlaceId:googleFixture.id});
 await page.reload();await page.goto('./#/11?date=2027-05-01');
 await expect(page.getByText('Fixture Cafe',{exact:true}).first()).toBeVisible();
 await expect(page.getByText(googleFixture.formattedAddress,{exact:true}).first()).toBeVisible();
});

test('review editor receives exact coordinates and Google identity and changing location clears both',async({page})=>{
 const writes:any[]=[];page.on('request',request=>{if(request.url().endsWith('/save_account_trip'))writes.push(request.postDataJSON().p_data);});
 await account(page,()=>({json:{results:[]}}));
 await page.route('https://places.googleapis.com/v1/places:searchText',route=>route.fulfill({json:{places:[googleFixture]}}));
 const dialog=page.getByRole('dialog',{name:'Nearby suggestions'});
 await dialog.getByRole('button',{name:'Find nearby suggestions',exact:true}).click();
 await dialog.getByRole('button',{name:'Review and add to this day',exact:true}).click();
 await expect(page).toHaveURL(/googlePlaceId=ChIJfixtureCafe/);
 await page.getByText('Edit name or location',{exact:true}).click();
 await expect(page.getByLabel('Where',{exact:true})).toHaveValue(googleFixture.formattedAddress);
 await page.getByRole('button',{name:'Add to itinerary',exact:true}).click();
 await expect.poll(()=>writes.at(-1)?.events.length).toBe(1);
 expect(writes.at(-1).events[0]).toMatchObject({point:{lat:47.61,lng:-122.33},googlePlaceId:googleFixture.id});
 const id=writes.at(-1).events[0].id;
 await page.goto(`./#/7?event=${id}&date=2027-05-01`);
 await page.getByLabel('Where',{exact:true}).fill('456 Changed Street, Seattle');
 await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await expect.poll(()=>writes.at(-1)?.events[0]?.place).toBe('456 Changed Street, Seattle');
 expect(writes.at(-1).events[0].point).toBeNull();
 expect(writes.at(-1).events[0].googlePlaceId).toBeNull();
});

test('current-location search uses the requested coordinates and is shared with the Suggestions page',async({page,context})=>{
 await context.grantPermissions(['geolocation']);await context.setGeolocation({latitude:25.03,longitude:121.56});
 let web=0;const providerRequests:any[]=[];
 await account(page,()=>{web++;return {json:{results:[]}};});
 await page.keyboard.press('Escape');
 await page.route('https://places.googleapis.com/v1/places:searchNearby',route=>{providerRequests.push(route.request().postDataJSON());return route.fulfill({json:{places:[{...googleFixture,formattedAddress:'10 Xinyi Road, Taipei',location:{latitude:25.03,longitude:121.56}}]}});});
 const research=page.getByRole('region',{name:'Nearby suggestions'});
 await research.getByRole('button',{name:'Use my location',exact:true}).click();
 await expect(research.locator('.nearby-context-panel strong')).toHaveText('Current location');
 await research.getByRole('button',{name:'Find nearby suggestions',exact:true}).click();
 await expect(research.locator('.nearby-result')).toContainText('10 Xinyi Road, Taipei');
 expect(providerRequests[0].locationRestriction.circle.center).toEqual({latitude:25.03,longitude:121.56});expect(web).toBe(0);
});

test('missing addresses cannot be added until a real autocomplete place is selected',async({page})=>{
 const writes:any[]=[];page.on('request',request=>{if(request.url().endsWith('/save_account_trip'))writes.push(request.postDataJSON().p_data);});
 await account(page,()=>({json:{results:[{...candidate,address:'',addressVerified:false}]}}));
 const dialog=page.getByRole('dialog',{name:'Nearby suggestions'});
 await dialog.getByRole('button',{name:'Find nearby suggestions',exact:true}).click();
 const add=dialog.getByRole('button',{name:'Add to itinerary',exact:true});await expect(add).toBeDisabled();
 await page.route('https://places.googleapis.com/v1/places:autocomplete',route=>route.fulfill({json:{suggestions:[{placePrediction:{placeId:'ChIJverifiedGarden',text:{text:'Verified Garden, 100 Garden Road, Seattle'},structuredFormat:{mainText:{text:'Verified Garden'},secondaryText:{text:'100 Garden Road, Seattle'}}}}]}}));
 const location=dialog.getByRole('combobox',{name:'Location for Research fixture garden',exact:true});await location.fill('Verified Garden');
 await dialog.getByRole('option',{name:/Verified Garden/}).click();await expect(add).toBeEnabled();
 await add.click();await expect.poll(()=>writes.at(-1)?.events.length).toBe(1);
 expect(writes.at(-1).events[0]).toMatchObject({place:'Verified Garden, 100 Garden Road, Seattle',googlePlaceId:'ChIJverifiedGarden'});
});

test('stale place results are discarded when the selected day changes',async({page})=>{
 await account(page,()=>({json:{results:[]}}));let release!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;});
 await page.route('https://places.googleapis.com/v1/places:searchText',async route=>{await held;await route.fulfill({json:{places:[googleFixture]}}).catch(()=>{});});
 const dialog=page.getByRole('dialog',{name:'Nearby suggestions'});
 await dialog.getByRole('button',{name:'Find nearby suggestions',exact:true}).click();
 await dialog.getByLabel('Trip day',{exact:true}).selectOption('2027-05-02');release();
 await expect(dialog.locator('.nearby-result')).toHaveCount(0);
 await expect(dialog.getByRole('button',{name:'Find nearby suggestions',exact:true})).toBeEnabled();
});

test('regular opening periods prevent closed-time scheduling and move activities to an open gap',async({page})=>{
 await account(page,()=>({json:{results:[]}}));
 const venue={...googleFixture,displayName:{text:'Evening Gallery'},timeZone:{id:'America/Los_Angeles'},regularOpeningHours:{weekdayDescriptions:['Saturday: 5:00 PM–8:00 PM'],periods:[{open:{day:6,hour:17,minute:0},close:{day:6,hour:20,minute:0}}]}};
 await page.route('https://places.googleapis.com/v1/places:searchText',route=>route.fulfill({json:{places:[venue]}}));
 const dialog=page.getByRole('dialog',{name:'Nearby suggestions'});
 await dialog.getByRole('button',{name:'Find nearby suggestions',exact:true}).click();
 await expect(dialog.locator('.nearby-result')).toContainText('Regular hours do not fit this day’s free time');
 await expect(dialog.getByRole('button',{name:'Add to itinerary',exact:true})).toBeDisabled();
 await expect(dialog.locator('.nearby-planning-details')).toContainText('Saturday: 5:00 PM–8:00 PM');
 await dialog.getByLabel('Find',{exact:true}).selectOption('activity');
 await dialog.getByRole('button',{name:'Find nearby suggestions',exact:true}).click();
 await expect(dialog.locator('.nearby-planning-details')).toContainText('5:00 PM–6:00 PM');
 await expect(dialog.getByRole('button',{name:'Add to itinerary',exact:true})).toBeEnabled();
 await dialog.getByRole('button',{name:'Review and add to this day',exact:true}).click();
 await expect(page.getByLabel('Start time',{exact:true})).toHaveValue('17:00');
 await expect(page.getByLabel('End time',{exact:true})).toHaveValue('18:00');
});

test('long provider names remain addable with full venue name in notes',async({page})=>{
 const fullName='The Long Named Waterfront Restaurant and Community Gathering Place with Rooftop Views and Seasonal Pacific Northwest Dining';
 const writes:any[]=[];page.on('request',request=>{if(request.url().endsWith('/save_account_trip'))writes.push(request.postDataJSON().p_data);});
 await account(page,()=>({json:{results:[]}}));
 await page.route('https://places.googleapis.com/v1/places:searchText',route=>route.fulfill({json:{places:[{...googleFixture,displayName:{text:fullName}}]}}));
 const dialog=page.getByRole('dialog',{name:'Nearby suggestions'});
 await dialog.getByRole('button',{name:'Find nearby suggestions',exact:true}).click();
 await expect(dialog.getByRole('heading',{name:fullName,exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'Add to itinerary',exact:true}).click();
 await expect.poll(()=>writes.at(-1)?.events.length,{timeout:3000}).toBe(1);
 expect(writes.at(-1).events[0].name.length).toBeLessThanOrEqual(100);
 expect(writes.at(-1).events[0].notes).toContain(fullName);
 expect(writes.at(-1).events[0].googlePlaceId).toBe(googleFixture.id);
});

for(const populated of [false,true]) test(`Suggestions discovery order follows saved collection state (${populated ? 'populated' : 'empty'})`,async({page})=>{
 await account(page,()=>({json:{results:[]}}),'Owner','',false,populated);await page.keyboard.press('Escape');
 const research=page.getByRole('region',{name:'Nearby suggestions'}),saved=page.getByRole('region',{name:'Saved places'});
 await expect(research).toBeVisible();await expect(saved).toBeVisible();
 const order=await page.evaluate(()=>{const discovery=document.querySelector('.suggestion-research')!;const collection=document.querySelector('[aria-label="Saved places"]')!;return !!(discovery.compareDocumentPosition(collection)&Node.DOCUMENT_POSITION_FOLLOWING);});
 expect(order).toBe(!populated);
 if(populated)await expect(saved).toContainText('Saved cafe');
});

test('overnight event draft keeps suggestion location identity and end day together',async({page})=>{
 const writes:any[]=[];page.on('request',request=>{if(request.url().endsWith('/save_account_trip'))writes.push(request.postDataJSON().p_data);});
 await account(page,()=>({json:{results:[]}}));await page.keyboard.press('Escape');
 const params=new URLSearchParams({suggestion:'Late dinner',place:googleFixture.formattedAddress,lat:'47.61',lng:'-122.33',googlePlaceId:googleFixture.id,date:'2027-05-01',endDate:'2027-05-02',start:'23:00',end:'01:00'});
 await page.goto('./#/7?'+params);await expect(page.getByLabel('End day',{exact:true})).toHaveValue('2027-05-02');
 await page.getByRole('button',{name:'Add to itinerary',exact:true}).click();await expect.poll(()=>writes.at(-1)?.events.length).toBe(1);
 expect(writes.at(-1).events[0]).toMatchObject({name:'Late dinner',place:googleFixture.formattedAddress,date:'2027-05-01',endDate:'2027-05-02',start:'23:00',end:'01:00',point:{lat:47.61,lng:-122.33},googlePlaceId:googleFixture.id});
});

test('embedded next-day recovery synchronizes the planning day before saving',async({page})=>{
 const writes:any[]=[];page.on('request',request=>{if(request.url().endsWith('/save_account_trip'))writes.push(request.postDataJSON().p_data);});
 await account(page,()=>({json:{results:[]}}),'Owner','',true);await page.keyboard.press('Escape');
 await page.route('https://places.googleapis.com/v1/places:searchText',route=>route.fulfill({json:{places:[googleFixture]}}));
 const research=page.getByRole('region',{name:'Nearby suggestions'});
 await expect(page.getByLabel('Planning day',{exact:true})).toHaveValue('2027-05-01');
 await research.getByRole('button',{name:/Try May 2/}).click();
 await expect(page.getByLabel('Planning day',{exact:true})).toHaveValue('2027-05-02');
 await research.getByRole('button',{name:'Find nearby suggestions',exact:true}).click();
 await research.getByRole('button',{name:'Add to itinerary',exact:true}).click();
 await expect.poll(()=>writes.at(-1)?.events.length).toBe(2);
 expect(writes.at(-1).events.at(-1).date).toBe('2027-05-02');
 await page.getByRole('button',{name:'View this day',exact:true}).click();await expect(page).toHaveURL(/date=2027-05-02/);
});

for (const failure of ['no-photo','media-error','image-error']) test(`Google ${failure} never substitutes generic city or Unsplash imagery`,async({page})=>{
 let detailsCalls=0,unsplashCalls=0;
 await account(page,()=>({json:{results:[]}}));
 await page.route('https://places.googleapis.com/v1/places:searchText',route=>route.fulfill({json:{places:[{...googleFixture,photos:[{name:`places/${googleFixture.id}/photos/exact-photo`}]}]}}));
 await page.route(`https://places.googleapis.com/v1/places/${googleFixture.id}`,route=>{detailsCalls++;return route.fulfill({json:{id:googleFixture.id,photos:failure==='no-photo'?[]:[{name:`places/${googleFixture.id}/photos/exact-photo`,authorAttributions:[]}]}});});
 await page.route(`https://places.googleapis.com/v1/places/${googleFixture.id}/photos/exact-photo/media?**`,route=>failure==='media-error'?route.fulfill({status:503,json:{error:{message:'Photo temporarily unavailable'}}}):route.fulfill({json:{name:`places/${googleFixture.id}/photos/exact-photo/media`,photoUri:'https://lh3.googleusercontent.com/places/unavailable-exact-photo'}}));
 await page.route('https://lh3.googleusercontent.com/places/unavailable-exact-photo',route=>route.abort());
 await page.route('**/functions/v1/unsplash-search**',route=>{unsplashCalls++;return route.fulfill({json:{results:[]}});});
 const dialog=page.getByRole('dialog',{name:'Nearby suggestions'});
 await dialog.getByRole('button',{name:'Find nearby suggestions',exact:true}).click();
 const card=dialog.locator('.nearby-result');await expect(card.getByRole('heading',{name:'Fixture Cafe',exact:true})).toBeVisible();
 await expect.poll(()=>detailsCalls).toBe(1);
 if(failure==='image-error')await expect.poll(()=>page.evaluate(()=>performance.getEntriesByType('resource').some(entry=>entry.name.includes('unavailable-exact-photo')))).toBe(true);
 await expect(card.locator('.nearby-result-photo')).toHaveCount(0);
 await expect(card.locator('.nearby-photo-credit')).toHaveCount(0);
 await expect(card.getByRole('button',{name:'Add to itinerary',exact:true})).toBeEnabled();
 expect(unsplashCalls).toBe(0);
 await expect(card).not.toContainText(/Illustrative photo|Area photo/);
});

for(const operation of ['direct','review']) test(`exact Google photo fixture shows author credit but its expiring URL is not saved through ${operation} add`,async({page})=>{
 const writes:any[]=[];const photoRequests:{url:string;mask:string|undefined}[]=[];
 page.on('request',request=>{if(request.url().endsWith('/save_account_trip'))writes.push(request.postDataJSON().p_data);});
 await account(page,()=>({json:{results:[]}}));
 await page.route('https://places.googleapis.com/v1/places:searchText',route=>route.fulfill({json:{places:[{...googleFixture,photos:[{name:`places/${googleFixture.id}/photos/exact-photo`}]}]}}));
 const authorUrl='https://maps.google.com/maps/contrib/123456789';
 await page.route(`https://places.googleapis.com/v1/places/${googleFixture.id}`,route=>{photoRequests.push({url:route.request().url(),mask:route.request().headers()['x-goog-fieldmask']});return route.fulfill({json:{id:googleFixture.id,photos:[{name:`places/${googleFixture.id}/photos/exact-photo`,authorAttributions:[{displayName:'Exact venue photographer',uri:authorUrl}]}]}});});
 const photoUrl='https://lh3.googleusercontent.com/places/exact-fixture-cafe';
 await page.route(`https://places.googleapis.com/v1/places/${googleFixture.id}/photos/exact-photo/media?**`,route=>route.fulfill({json:{name:`places/${googleFixture.id}/photos/exact-photo/media`,photoUri:photoUrl}}));
 await page.route(photoUrl,route=>route.fulfill({path:fileURLToPath(new URL('../public/images/food.jpg',import.meta.url)),contentType:'image/jpeg'}));
 const dialog=page.getByRole('dialog',{name:'Nearby suggestions'});await dialog.getByRole('button',{name:'Find nearby suggestions',exact:true}).click();
 const card=dialog.locator('.nearby-result'),image=card.locator('.nearby-result-photo');
 await expect(image).toHaveAttribute('src',photoUrl);await image.scrollIntoViewIfNeeded();await expect.poll(()=>image.evaluate(element=>(element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
 await expect(card.locator('.nearby-photo-credit')).toContainText('Google Maps photo');
 await expect(card.getByRole('link',{name:'Exact venue photographer',exact:true})).toHaveAttribute('href',authorUrl);
 expect(photoRequests).toEqual([{url:`https://places.googleapis.com/v1/places/${googleFixture.id}`,mask:'id,photos'}]);
 if(operation==='review'){
  await card.getByRole('button',{name:'Review and add to this day',exact:true}).click();
  await expect(page).toHaveURL(/googlePlaceId=ChIJfixtureCafe/);expect(page.url()).not.toContain(encodeURIComponent(photoUrl));
  await expect(page.locator('.upload-preview')).toHaveCount(0);
  await page.getByRole('button',{name:'Add to itinerary',exact:true}).click();
 }else await card.getByRole('button',{name:'Add to itinerary',exact:true}).click();
 await expect.poll(()=>writes.at(-1)?.events.length).toBe(1);
 expect(writes.at(-1).events[0]).toMatchObject({name:'Fixture Cafe',place:googleFixture.formattedAddress,googlePlaceId:googleFixture.id,image:''});
 expect(JSON.stringify(writes.at(-1).events[0])).not.toContain(photoUrl);
});

test('Google search failure with empty web fallback shows an actionable retry error',async({page})=>{
 await account(page,()=>({json:{results:[]}}));
 let providerCalls=0;
 await page.route('https://places.googleapis.com/v1/places:searchText',route=>{providerCalls++;return route.fulfill({status:503,json:{error:{message:'Temporary provider failure'}}});});
 const dialog=page.getByRole('dialog',{name:'Nearby suggestions'});await dialog.getByRole('button',{name:'Find nearby suggestions',exact:true}).click();
 await expect(dialog.getByRole('alert')).toContainText('Place search is temporarily unavailable. Please try again.');
 await expect(dialog.getByRole('alert')).toContainText('Additional research found no alternatives.');
 await expect(dialog).not.toContainText('No source-backed options found');
 await expect(dialog.getByRole('button',{name:'Find nearby suggestions',exact:true})).toBeEnabled();expect(providerCalls).toBe(1);
});


test('Google results without photo metadata make no photo lookup or Unsplash fallback',async({page})=>{
 let detailsCalls=0,unsplashCalls=0;
 await account(page,()=>({json:{results:[]}}));
 await page.route('https://places.googleapis.com/v1/places:searchText',route=>route.fulfill({json:{places:[googleFixture]}}));
 await page.route(`https://places.googleapis.com/v1/places/${googleFixture.id}**`,route=>{detailsCalls++;return route.fulfill({json:{id:googleFixture.id}});});
 await page.route('**/functions/v1/unsplash-search**',route=>{unsplashCalls++;return route.fulfill({json:{results:[]}});});
 const dialog=page.getByRole('dialog',{name:'Nearby suggestions'});await dialog.getByRole('button',{name:'Find nearby suggestions',exact:true}).click();
 const card=dialog.locator('.nearby-result');await expect(card.getByRole('heading',{name:'Fixture Cafe',exact:true})).toBeVisible();
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 await expect(card.locator('.nearby-result-photo')).toHaveCount(0);await expect(card.locator('.nearby-photo-credit')).toHaveCount(0);
 expect(detailsCalls).toBe(0);expect(unsplashCalls).toBe(0);
 await card.getByText('More to consider',{exact:true}).click();
 await expect(card.getByRole('link',{name:'View on Google Maps',exact:true})).toHaveAttribute('href',googleFixture.googleMapsUri);
 await expect(card.getByRole('button',{name:'Add to itinerary',exact:true})).toBeEnabled();
});
