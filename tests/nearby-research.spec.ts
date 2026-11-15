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
    await expect(dialog.getByText(/Sample trip: you can explore/)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Find nearby suggestions", exact: true })).toBeDisabled();
    await dialog.getByText("Planning details used", { exact: true }).click();
    await expect(dialog).toContainText("Dietary needs");
    await expect(dialog).not.toContainText("Cedar Gallery");
    expect(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`nearby-${route}.png`) });
    await page.keyboard.press("Escape");
  }
});

async function account(page: Page, generation: (request: Record<string, unknown>) => { status?: number; json: unknown }, role: "Owner" | "Day Editor" = "Owner", anchorPlace = "") {
  const owner = { id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated", email: "qa@example.com", user_metadata: { name: "QA Traveler" }, app_metadata: { provider: "email" } };
  const trip = seed().trips[0];
  trip.members = [{ id: owner.id, name: "QA Traveler", email: owner.email, role, status: "accepted", days: role === "Day Editor" ? ["2027-05-02"] : [], ...(role === "Day Editor" ? {accountId:owner.id} : {}) }];
  trip.start = "2027-05-01"; trip.end = "2027-05-03"; trip.events = anchorPlace ? [{ ...trip.events[0], id:"anchor", name:"Earlier planned stop", place:anchorPlace, date:trip.start, start:"09:00", end:"10:00", cost:0, attendees:[], image:"", notes:"" }] : []; trip.prefs = role === "Day Editor" ? {[owner.id]:blankPrefs()} : {};
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
  await expect(dialog.getByRole("heading", { name: "Options to review" })).toBeVisible();
  await expect(dialog.locator(".nearby-more")).not.toHaveAttribute("open", "");
  await expect(dialog).not.toContainText("Found during research for this trip day");
  await dialog.getByText("More to consider", { exact: true }).click();
  await expect(dialog.getByRole("link", { name: "Source 1" })).toHaveAttribute("href", "https://example.com/menu");
  await expect(dialog.getByRole("link", { name: "View on Google Maps", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("link", { name: "Search on Google", exact: true })).toHaveAttribute("href", "https://www.google.com/search?q=Fixture+venue+for+UI+testing+Test+address");
  await expect(dialog.getByRole("link", { name: "View on Yelp", exact: true })).toHaveAttribute("href", /https:\/\/www.yelp.com\/search\?/);
  await expect(dialog.getByRole("link", { name: "View on Yelp", exact: true })).toHaveAttribute("target", "_blank");
  expect(requests).toHaveLength(1); expect(requests[0]).not.toHaveProperty("preferences");
  expect(requests[0]).toMatchObject({ date: "2027-05-01", revision: 1, intent: "lunch" });

  await expect(dialog).toContainText("Confirm access and dietary needs");
  await dialog.getByLabel("Find", { exact: true }).selectOption("dinner");
  await expect(dialog.getByRole("heading", { name: "Options to review" })).toHaveCount(0);
  expect(requests).toHaveLength(1);
});
test("suggestions retain a loaded illustrative photo when venue and area searches fail", async ({ page }) => {
  const queries: string[] = [];
  await page.route("**/images/seattle.jpg", route => route.abort());
  await account(page, () => ({ json: { results: [{ name: "Photo fallback venue", address: "Seattle", reason: "A researched option", durationMinutes: 60, pricePerPersonCents: null, currency: null, facts: [{ topic: "Venue", detail: "Test source fact", sourceUrl: "https://example.com/venue" }], concerns: [], conflicts: [], status: "review", proposedTime: { start: "12:00", end: "13:00" } }] } }));
  await page.route("**/functions/v1/unsplash-search**", route => {
    queries.push(new URL(route.request().url()).searchParams.get("query") || "");
    return route.fulfill({ status: 503, json: { message: "Photo service unavailable" } });
  });
  const dialog = page.getByRole("dialog", { name: "Nearby suggestions" });
  await dialog.getByRole("button", { name: "Find nearby suggestions", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Photo fallback venue", exact: true })).toBeVisible();
  const photo = dialog.locator(".nearby-result-photo");
  await photo.scrollIntoViewIfNeeded();
  await expect(photo).toHaveAttribute("src", /\/images\/city\.jpg$/);
  await expect.poll(() => photo.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  await expect(dialog).toContainText("Illustrative photo · not the suggested venue");
  await expect.poll(() => queries.length).toBe(2);
  expect(queries[0]).toContain("Photo fallback venue");
  expect(queries[1]).toBe("Seattle city landscape");
  await expect(dialog.locator(".nearby-photo-credit")).not.toContainText("Unsplash");
});

test("city guide fallback displays a photo and source exploration without scheduling or fit claims", async ({ page }) => {
  const source = "https://tourism.example/seattle/things-to-do";
  await account(page, () => ({ json: { results: [{ name: "Explore Seattle and the surrounding region", address: "Seattle", kind: "guide", reason: "Explore this city guide for broader activity ideas.", fitNote: "This source can help you find an activity to review with your group.", durationMinutes: 60, pricePerPersonCents: null, currency: null, facts: [{ topic: "City guide", detail: "Discover local attractions, parks, and cultural activities.", sourceUrl: source }], concerns: ["Choose a specific activity and confirm travel time, accessibility and cost before scheduling."], conflicts: [], status: "review", proposedTime: null }] } }));
  const dialog = page.getByRole("dialog", { name: "Nearby suggestions" });
  await dialog.getByRole("button", { name: "Find nearby suggestions", exact: true }).click();
  const card = dialog.locator(".nearby-result");
  await expect(card.getByRole("heading", { name: "Explore Seattle and the surrounding region", exact: true })).toBeVisible();
  const explore = card.getByRole("link", { name: "Explore city and region ideas", exact: true });
  await explore.scrollIntoViewIfNeeded();
  await expect(explore).toHaveAttribute("href", source);
  await expect(explore).toHaveAttribute("target", "_blank");
  await expect(card.getByRole("button", { name: "Review and add to this day", exact: true })).toHaveCount(0);
  await expect(card).toContainText("Explore activities before choosing a time");
  await expect(card).toContainText("Price not confirmed");
  await expect(card).not.toContainText(/provisional gap|No suitable time gap found|per person|within.*budget/i);
  const image = card.locator(".nearby-result-photo");
  await image.scrollIntoViewIfNeeded();
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("city-guide.png") });
});

test("a sourced Yelp business page opens directly and supplemental availability is explained", async ({ page }) => {
  const source = "https://www.yelp.com/biz/fixture-venue-seattle";
  await account(page, () => ({ json: { results: [{ name: "Fixture venue", address: "Address needs confirmation from the venue", reason: "Fixture", durationMinutes: 60, pricePerPersonCents: null, currency: null, facts: [{ topic: "Menu", detail: "Fixture Yelp excerpt", sourceUrl: source }], concerns: ["Confirm with venue"], conflicts: [], status: "review", proposedTime: null }], diagnostics: { sourcesFound: 2, sourcesUsed: 2, candidatesReturned: 1, rejected: {}, yelpStatus: "found", yelpSourcesUsed: 1 } } }));
  const dialog = page.getByRole("dialog", { name: "Nearby suggestions" });
  await dialog.getByRole("button", { name: "Find nearby suggestions", exact: true }).click();
  await dialog.getByText("More to consider", { exact: true }).click();
  await expect(dialog.getByRole("link", { name: "View on Yelp", exact: true })).toHaveAttribute("href", source);
  await expect(dialog.getByRole("link", { name: "Yelp source", exact: true })).toHaveAttribute("href", source);
  await dialog.getByText("Search details", { exact: true }).click();
  await expect(dialog).toContainText("Public Yelp results were found");
  await expect(dialog).toContainText("1 Yelp excerpt used");
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
test("empty research shows the specific cause and rejection counts", async ({ page }) => {
  await account(page, () => ({ json: { results: [], emptyReason: "evidence", diagnostics: { sourcesFound: 4, sourcesUsed: 3, candidatesReturned: 2, rejected: { evidence: 2 } } } }));
  const dialog = page.getByRole("dialog", { name: "Nearby suggestions" });
  await dialog.getByRole("button", { name: "Find nearby suggestions", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Not enough supporting evidence", exact: true })).toBeVisible();
  await expect(dialog).toContainText("more precise event address");
  await dialog.getByText("Search details", { exact: true }).click();
  await expect(dialog).toContainText("4 sources found"); await expect(dialog).toContainText("2 removed: insufficient source evidence");
  await expect(dialog).not.toContainText("No sourced options passed");
  await dialog.getByLabel("Find", { exact: true }).selectOption("activity");
  await expect(dialog.getByText("Search details", { exact: true })).toHaveCount(0);
});

const candidate = { name: "Research fixture garden", address: "Seattle garden", reason: "A quiet break", durationMinutes: 60, pricePerPersonCents: null, currency: null, facts: [{topic:"Hours",detail:"Check the current hours",sourceUrl:"https://example.com/garden"}], concerns:["Confirm access"], conflicts:[], status:"review", proposedTime:{start:"12:00",end:"13:00"} };

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
  await expect(card.getByRole("link",{name:"Source 1",exact:true})).toBeVisible();
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

test("shrine suggestions reject anchor photos and carry the relevant image into the event", async ({ page }) => {
  await account(page, () => ({json:{results:[{...candidate,name:"Shinto Shrine",address:"Address needs confirmation from the venue"}]}}), "Owner", "McDonald's, Seattle");
  const queries: string[]=[];
  const photo=(id:string,description:string)=>({id,width:1200,height:800,alt_description:description,urls:{regular:`https://images.unsplash.com/${id}`},links:{html:`https://unsplash.com/photos/${id}`,download_location:`https://api.unsplash.com/photos/${id}/download`},user:{name:"Photo fixture",links:{html:"https://unsplash.com/@fixture"}}});
  await page.route('**/functions/v1/unsplash-search?**',route=>{
    const query=new URL(route.request().url()).searchParams.get('query')||'';queries.push(query);
    const photos=query.startsWith('temple shrine') ? [photo('shrine','A Shinto shrine with traditional gates'),photo('shrine-2','A Buddhist temple')] : [photo('mcdonalds',"McDonald's restaurant and burger sign"),photo('mcdonalds-2','Fast food restaurant')];
    return route.fulfill({json:{results:photos}});
  });
  await page.route('https://images.unsplash.com/**',route=>route.fulfill({path:fileURLToPath(new URL('../public/images/city.jpg',import.meta.url)),contentType:'image/jpeg'}));
  const dialog=page.getByRole('dialog',{name:'Nearby suggestions'});
  await dialog.getByRole('button',{name:'Find nearby suggestions',exact:true}).click();
  const image=dialog.locator('.nearby-result-photo');
  await expect(image).toHaveAttribute('src','https://images.unsplash.com/shrine');
  await expect.poll(()=>image.evaluate(image=>(image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(queries).toEqual(['Shinto Shrine Seattle','temple shrine Seattle']);
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
  await dialog.getByLabel('Trip day',{exact:true}).selectOption('2027-05-02');
  await dialog.getByRole('button',{name:'Find nearby suggestions',exact:true}).click();
  await expect(dialog.getByRole('button',{name:'Review and add to this day',exact:true})).toBeEnabled();
});

for (const action of ['close','change day']) test(`late photo attribution cannot navigate after Nearby ${action}`,async({page})=>{
  await account(page,()=>({json:{results:[candidate]}}));
  const photo = {id:'fixture-photo',alt_description:'A peaceful garden',width:1200,height:800,urls:{regular:'https://images.unsplash.com/fixture'},links:{html:'https://unsplash.com/photos/fixture',download_location:'https://api.unsplash.com/photos/fixture/download'},user:{name:'Fixture photographer',links:{html:'https://unsplash.com/@fixture'}}};
  await page.route('**/functions/v1/unsplash-search?**',r=>r.fulfill({json:{results:[photo,{...photo,id:'fixture-photo-2'}]}}));
  await page.route('https://images.unsplash.com/**',r=>r.fulfill({path:fileURLToPath(new URL('../public/images/food.jpg',import.meta.url)),contentType:'image/jpeg'}));
  let release!:()=>void, started=false;
  const held=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/functions/v1/unsplash-track',async r=>{started=true;await held;await r.fulfill({json:{success:true}});});
  const dialog=page.getByRole('dialog',{name:'Nearby suggestions'});
  await dialog.getByRole('button',{name:'Find nearby suggestions',exact:true}).click();
  await expect(dialog.locator('.nearby-result-photo')).toHaveCount(1);
  await expect(dialog.locator('.nearby-photo-credit')).toContainText('Fixture photographer');
  const response=page.waitForResponse(r=>r.url().endsWith('/unsplash-track'));
  await dialog.getByRole('button',{name:'Review and add to this day',exact:true}).click();
  await expect.poll(()=>started).toBe(true);
  if(action==='close') await page.keyboard.press('Escape');
  else await dialog.getByLabel('Trip day',{exact:true}).selectOption('2027-05-02');
  release(); await (await response).finished();
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await expect(page).toHaveURL(/#\/9$/);
  if(action==='change day') await expect(dialog.getByLabel('Trip day',{exact:true})).toHaveValue('2027-05-02');
});
