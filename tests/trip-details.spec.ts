import { test, expect, type Page } from "@playwright/test";
import { detailJourney, saved } from "../scripts/trip-detail-browser-flow.mjs";
const owner = {
  id: "22222222-2222-4222-8222-222222222222",
  email: "detail-owner@example.com",
  aud: "authenticated",
  role: "authenticated",
  user_metadata: { name: "QA Traveler" },
  app_metadata: { provider: "email" },
  created_at: "2026-01-01T00:00:00Z",
};
async function backend(page: Page) {
  const rows: any[] = [];
  let fail = false;
  let held: Promise<void> | undefined;
  await page.route("https://*.supabase.co/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    if (path === "/rest/v1/forwarded_booking")
      return route.fulfill({ json: [] });
    if (path === "/rest/v1/user_style")
      return route.fulfill({ json: [] });
    if (path.endsWith("/token"))
      return route.fulfill({
        json: {
          user: owner,
          access_token: "qa-token",
          refresh_token: "qa-refresh",
          expires_in: 3600,
          token_type: "bearer",
        },
      });
    if (path.endsWith("/user")) return route.fulfill({ json: owner });
    if (path.endsWith("/load_trip_bundles"))
      return route.fulfill({ json: rows });
    if (path === "/rest/v1/trip_photo_credit" && req.method() === "GET")
      return route.fulfill({ json: [] });
    if (path.endsWith("/resolve_trip_emails")) return route.fulfill({ json: { "guest@example.test": "Guest Traveler" } });
    if (path.endsWith("/share_trip_recipient")) {
      const { p_email, p_trip, p_delivered } = req.postDataJSON();
      if (p_delivered) return route.fulfill({ json: "sent" });
      if (p_email !== "guest@example.test") return route.fulfill({ json: "needs_email" });
      const row = rows.find(t => t.tripID === p_trip);
      const id = "33333333-3333-4333-8333-333333333333";
      if (!row.content.members.some((m: {id: string}) => m.id === id)) {
        row.content.members.push({ id, accountId: id, name: "Guest Traveler", email: p_email, role: "Viewer", days: [], status: "accepted" });
        row.revision++;
      }
      return route.fulfill({ json: "shared" });
    }
    if (path.endsWith("/read_invited_trip")) return route.fulfill({ json: rows.find(t => t.tripID === req.postDataJSON().p_trip) });
    if (path.endsWith("/save_trip_bundle")) {
      if (held) await held;
      if (fail) return route.abort("failed");
      const { p_data: d, p_expected_revision: r } = req.postDataJSON();
      const old = rows.find((x) => x.tripID === d.id);
      if (old && r !== old.revision)
        return route.fulfill({
          status: 409,
          json: { code: "PT409", message: "This trip changed in another tab." },
        });
      const row = {
        tripID: d.id,
        owner_id: owner.id,
        created_by: owner.id,
        trip_name: d.title,
        destinations: d.destinations,
        start_date: d.start,
        end_date: d.end,
        timezone: d.zone,
        revision: (old?.revision ?? 0) + 1,
        content_version: 1,
        content: {
          image: d.image,
          members: d.members,
          events: d.events,
          expenses: d.expenses,
          prefs: d.prefs,
          budget: d.budget,
          budgetMode: d.budgetMode,
          individual: d.individual,
          todos: d.todos,
          dismissed: d.dismissed,
        },
      };
      if (old) rows[rows.indexOf(old)] = row;
      else rows.push(row);
      return route.fulfill({ json: row });
    }
    throw new Error(`Unexpected API ${path}`);
  });
  await page.goto("./");
  await page.getByLabel("Email", { exact: true }).fill(owner.email);
  await page.getByLabel("Password", { exact: true }).fill("qa-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Home" }),
  ).toBeVisible();
  return {
    rows,
    holdSave: () => {
      let release!: () => void;
      held = new Promise<void>((resolve) => {
        release = resolve;
      });
      return () => {
        held = undefined;
        release();
      };
    },
    setFail: (value: boolean) => {
      fail = value;
    },
  };
}
test("all detail screens persist changes and preserve financial history", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(90000);
  const api = await backend(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const { today } = await detailJourney(page, baseURL!, "guest@example.test");
  const row = api.rows[0],
    c = row.content;
  expect(c.events[0]).toMatchObject({
    name: "Museum visit",
    notes: "Bring printed tickets",
    cost: 1007,
    date: today,
  });
  expect(c.events[0].attendees).toHaveLength(2);
  expect(c.members[1]).toMatchObject({
    role: "Viewer",
    status: "removed",
    days: [],
  });
  expect(c.prefs[owner.id]).toMatchObject({
    diet: ["Vegetarian"],
    atmosphere: "Quiet",
    access: ["Step-free access"],
    walk: 1500,
    notes: "A slower pace",
    destinations: "Old town",
  });
  expect(c).toMatchObject({
    budget: 100001,
    budgetMode: "individual",
    individual: { [owner.id]: 60002 },
  });
  expect(c.expenses).toHaveLength(1);
  expect(c.expenses[0]).toMatchObject({
    amount: 1001,
    purpose: "Shared lunch edited",
  });
  expect(c.expenses[0].settled).toHaveLength(1);
  expect(c.todos).toHaveLength(1);
  expect(c.todos[0]).toMatchObject({ text: "Pack tickets", done: true });
  const local = await page.evaluate(
    (id) => ({
      store: JSON.parse(localStorage.getItem(`trip-planner-demo-v1:${id}`)!),
      recovery: localStorage.getItem(`trip-planner-pending-v1:${id}`),
    }),
    owner.id,
  );
  expect(local.store.trips.some((t: any) => t.id === row.tripID)).toBe(false);
  expect(local.recovery).toBeNull();
  await page.goto(`./#/7?event=${c.events[0].id}`);
  await expect(
    page.getByLabel("Notes (optional)", { exact: true }),
  ).toHaveValue("Bring printed tickets");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete event", exact: true }).click();
  await saved(page);
  expect(api.rows[0].content.events).toEqual([]);
  await expect(
    page.locator(".budget-peek").getByRole("heading", { name: "Your budget" }),
  ).toBeVisible();
  const remaining = (60002 - c.expenses[0].shares[owner.id]) / 100;
  await expect(page.locator(".budget-peek > strong")).toHaveText(
    `$${remaining.toFixed(2)}`,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("saved-details.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("failed detail saves recover after reload and can be retried without losing edits", async ({
  page,
}) => {
  const api = await backend(page);
  await page.goto("./#/6");
  await page.getByLabel("Trip title", { exact: true }).fill("Offline recovery");
  await page.getByLabel("Where are you going?", { exact: true }).fill("Taipei");
  await page.getByLabel("Start date", { exact: true }).fill("2027-05-01");
  await page.getByLabel("End date", { exact: true }).fill("2027-05-04");
  await page.getByRole("button", { name: "Create trip", exact: true }).click();
  await page
    .getByRole("button", { name: "Offline recovery", exact: true })
    .click();
  await saved(page);
  api.setFail(true);
  await page.goto("./#/7");
  await page.getByLabel("Event name", { exact: true }).fill("Offline museum");
  await page.getByLabel("Where", { exact: true }).fill("Museum");
  await page
    .getByRole("button", { name: "Add to itinerary", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Not saved:");
  await expect(page.getByText("Changes saved", { exact: true })).toHaveCount(0);
  expect(api.rows[0].content.events).toEqual([]);
  await page.reload();
  await expect(page.getByRole("alert")).toContainText(
    "Recovered unsaved changes",
  );
  await expect(
    page.getByRole("button", { name: /Offline museum/ }).first(),
  ).toBeVisible();
  api.setFail(false);
  await page.getByRole("button", { name: "Retry save", exact: true }).click();
  await saved(page);
  expect(api.rows[0].content.events[0].name).toBe("Offline museum");
  await page.reload();
  await saved(page);
  await expect(
    page.getByRole("button", { name: /Offline museum/ }).first(),
  ).toBeVisible();
});

test("legacy browser trip details import once into the owned database trip", async ({
  page,
}) => {
  const api = await backend(page);
  const id = "44444444-4444-4444-8444-444444444444";
  const draft = {
    id,
    title: "Imported local plan",
    destinations: ["Taipei"],
    start: "2027-05-01",
    end: "2027-05-04",
    zone: "Asia/Taipei",
    image: "/image.jpg",
    persistence: "account",
    revision: 1,
    members: [
      {
        id: owner.id,
        name: "QA Traveler",
        email: owner.email,
        role: "Owner",
        days: [],
        status: "accepted",
      },
      {
        id: "legacy-guest",
        name: "Legacy guest",
        email: "legacy@example.com",
        role: "Viewer",
        days: [],
        status: "accepted",
      },
    ],
    events: [
      {
        id: "legacy-event",
        name: "Legacy museum",
        place: "Museum",
        date: "2027-05-01",
        start: "10:00",
        end: "11:00",
        cost: 100,
        notes: "Keep my old plan",
        image: "/image.jpg",
        attendees: [owner.id, "legacy-guest"],
      },
    ],
    expenses: [],
    prefs: {},
    budget: null,
    budgetMode: "group",
    individual: {},
    todos: [],
    dismissed: [],
  };
  api.rows.push({
    tripID: id,
    owner_id: owner.id,
    trip_name: draft.title,
    destinations: draft.destinations,
    start_date: draft.start,
    end_date: draft.end,
    timezone: draft.zone,
    revision: 1,
    content_version: 0,
  });
  await page.evaluate(
    ({ draft, owner }) => {
      const key = `trip-planner-demo-v1:${owner.id}`;
      const store = JSON.parse(localStorage.getItem(key)!);
      store.trips.push(draft);
      store.tripId = draft.id;
      localStorage.setItem(key, JSON.stringify(store));
    },
    { draft, owner },
  );
  await page.reload();
  await saved(page);
  await expect.poll(() => api.rows[0].content_version).toBe(1);
  expect(api.rows[0].content.events[0].notes).toBe("Keep my old plan");
  expect(api.rows[0].content.members[1].id).not.toBe("legacy-guest");
  expect(api.rows[0].content.events[0].attendees).toContain(
    api.rows[0].content.members[1].id,
  );
  const revision = api.rows[0].revision;
  await page.reload();
  await saved(page);
  expect(api.rows[0].revision).toBe(revision);
});

test("save popup waits for confirmation, sits bottom-right, then disappears", async ({
  page,
}) => {
  const api = await backend(page);
  await expect(page.locator(".account-save-banner")).toHaveCount(0);
  await expect(page.getByText("Changes saved", { exact: true })).toHaveCount(0);
  await page.goto("./#/6");
  await page.getByLabel("Trip title", { exact: true }).fill("Save feedback");
  await page.getByLabel("Where are you going?", { exact: true }).fill("Taipei");
  await page.getByLabel("Start date", { exact: true }).fill("2027-05-01");
  await page.getByLabel("End date", { exact: true }).fill("2027-05-04");
  const release = api.holdSave();
  await page.getByRole("button", { name: "Create trip", exact: true }).click();
  await expect(page.locator(".account-save-banner")).toContainText(
    "Saving trip changes",
  );
  await expect(page.getByText("Changes saved", { exact: true })).toHaveCount(0);
  release();
  const toast = page.getByText("Changes saved", { exact: true });
  await expect(toast).toBeVisible();
  await expect(page.locator(".account-save-banner")).toHaveCount(0);
  const box = await toast.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.x).toBeGreaterThan(viewport.width / 2);
  expect(box!.y).toBeGreaterThan(viewport.height / 2);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width - 15);
  await page.screenshot({ path: test.info().outputPath("changes-saved.png") });
  await expect(toast).toHaveCount(0, { timeout: 5000 });
  await page.reload();
  await saved(page);
  await expect(toast).toHaveCount(0);
});

test('weekly calendar reschedules through the save API, reloads, and recovers failed writes', async ({page}, testInfo) => {
  const api = await backend(page);
  const id='55555555-5555-4555-8555-555555555555';
  const event={id:'66666666-6666-4666-8666-666666666666',name:'Calendar museum',place:'City museum',date:'2027-06-01',start:'10:00',end:'11:30',cost:1250,attendees:[owner.id],notes:'Keep these notes',image:''};
  api.rows.push({tripID:id,owner_id:owner.id,created_by:owner.id,trip_name:'Calendar test',destinations:['Seattle'],start_date:'2027-06-01',end_date:'2027-06-20',timezone:'America/Los_Angeles',revision:1,content_version:1,content:{image:'',members:[{id:owner.id,name:'QA Traveler',email:owner.email,role:'Owner',status:'accepted',days:[]}],events:[event],expenses:[],prefs:{},budget:null,budgetMode:'group',individual:{},todos:[],dismissed:[]}});
  await page.goto('./#/5'); await page.reload();
  await page.getByRole('button',{name:'Open itinerary',exact:true}).click();
  await page.getByRole('button',{name:'Calendar',exact:true}).click();
  await expect(page.getByRole('region',{name:'Scrollable seven-day calendar'})).toBeVisible();
  await expect(page.locator('.itcal-day-header')).toHaveCount(7);
  await page.getByRole('button',{name:'Next seven days',exact:true}).click();
  await expect(page.locator('.itcal-day-header').first()).toContainText('Jun 8');
  await page.getByRole('button',{name:'Previous seven days',exact:true}).click();
  await page.getByRole('button',{name:'Move Calendar museum',exact:true}).click();
  await page.getByLabel('New event date',{exact:true}).fill('2027-06-02');
  await page.getByLabel('New start time',{exact:true}).fill('13:00');
  await page.getByRole('button',{name:'Move event',exact:true}).click();
  await expect.poll(()=>api.rows[0].content.events[0].date).toBe('2027-06-02');
  await saved(page);
  expect(api.rows[0].content.events[0]).toMatchObject({...event,date:'2027-06-02',start:'13:00',end:'14:30'});
  await page.reload();
  await expect(page.locator('[data-calendar-date="2027-06-02"] .itcal-event')).toContainText('Calendar museum');
  if(testInfo.project.name==='desktop') {
    await page.locator('.itcal-event').dragTo(page.locator('[data-calendar-date="2027-06-03"]'), {targetPosition:{x:50,y:450}});
    await expect.poll(()=>api.rows[0].content.events[0].date).toBe('2027-06-03');
    expect(api.rows[0].content.events[0].end).toBe('14:30');
  }
  api.setFail(true);
  await page.getByRole('button',{name:'Move Calendar museum',exact:true}).click();
  await page.getByLabel('New event date',{exact:true}).fill('2027-06-04');
  await page.getByRole('button',{name:'Move event',exact:true}).click();
  await expect(page.getByRole('button',{name:'Retry save',exact:true})).toBeVisible();
  expect(api.rows[0].content.events[0].date).not.toBe('2027-06-04');
  api.setFail(false);
  await page.getByRole('button',{name:'Retry save',exact:true}).click();
  await expect.poll(()=>api.rows[0].content.events[0].date).toBe('2027-06-04');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1)).toBe(true);
});

test('event location autocomplete selects a worldwide landmark, saves, reloads, and keeps manual entry on outage',async({page})=>{
 const api=await backend(page);
 await page.route('https://photon.komoot.io/api/**',route=>route.fulfill({json:{features:[{geometry:{coordinates:[2.29448,48.85837]},properties:{osm_type:'W',osm_id:1,name:'Eiffel Tower',housenumber:'5',street:'Avenue Anatole France',city:'Paris',country:'France'}}]}}));
 const id='77777777-7777-4777-8777-777777777777';
 api.rows.push({tripID:id,owner_id:owner.id,created_by:owner.id,trip_name:'Location test',destinations:['Paris, France'],start_date:'2027-06-01',end_date:'2027-06-03',timezone:'Europe/Paris',revision:1,content_version:1,content:{image:'',members:[{id:owner.id,name:'QA Traveler',email:owner.email,role:'Owner',status:'accepted',days:[]}],events:[],expenses:[],prefs:{},budget:null,budgetMode:'group',individual:{},todos:[],dismissed:[]}});
 await page.goto('./#/5');await page.reload();await page.getByRole('button',{name:'Open itinerary',exact:true}).click();await page.getByRole('button',{name:'Add event',exact:true}).click();
 await page.getByLabel('Event name',{exact:true}).fill('Eiffel visit');
 const input=page.getByRole('combobox',{name:'Where',exact:true});
 await input.fill('Eiffe');await expect(page.getByRole('option',{name:/Eiffel Tower/})).toBeVisible();
 await input.press('ArrowDown');await input.press('Enter');
 const label='Eiffel Tower, 5 Avenue Anatole France, Paris, France';await expect(input).toHaveValue(label);
 const popularTimes=page.getByRole('link',{name:/Check popular times on Google Maps/});
 await expect(popularTimes).toHaveAttribute('href',`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label)}`);
 await expect(popularTimes).toHaveAttribute('target','_blank');
 await expect(page.locator('.crowd-card,.crowd-bars')).toHaveCount(0);
 await input.fill('');await expect(popularTimes).toHaveCount(0);await input.fill('Eiffe');await page.getByRole('option',{name:/Eiffel Tower/}).click();

 expect(api.rows[0].content.events).toHaveLength(0);
 await page.getByRole('button',{name:'Add to itinerary',exact:true}).click();
 await expect.poll(()=>api.rows[0].content.events[0]?.place).toBe(label);
 const event=api.rows[0].content.events[0];
 expect(event.point).toEqual({lat:48.85837,lng:2.29448});
 await page.goto(`./#/7?event=${event.id}`);await page.reload();await expect(page.getByLabel('Where',{exact:true})).toHaveValue(label);
 await page.unroute('https://photon.komoot.io/api/**');await page.route('https://photon.komoot.io/api/**',route=>route.abort('failed'));
 await page.getByLabel('Where',{exact:true}).fill('Our hotel lobby');await expect(page.getByText('Search unavailable',{exact:true})).toBeVisible();
 await page.getByLabel('Where',{exact:true}).press('Escape');await page.getByRole('button',{name:'Save changes',exact:true}).click();
 await expect.poll(()=>api.rows[0].content.events[0]?.place).toBe('Our hotel lobby');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('location suggestions prioritize the selected trip stop and retain worldwide search',async({page})=>{
 const api=await backend(page);
 const stops=['San Clemente, California, United States','Paris, France'];
 const requests:URL[]=[];
 await page.route('https://photon.komoot.io/api/**',route=>{
  const url=new URL(route.request().url());requests.push(url);
  const q=url.searchParams.get('q');
  const feature=(name:string,city:string,coordinates:number[])=>({properties:{name,city,country:city==='San Clemente'?'United States':'France',type:'city'},geometry:{coordinates}});
  const features=q===stops[0]?[feature('San Clemente','San Clemente',[-117.61,33.42])]:q===stops[1]?[feature('Paris','Paris',[2.35,48.85])]:[feature('T Street','Paris',[2.35,48.85]),feature('T Street Beach','San Clemente',[-117.61,33.42])];
  return route.fulfill({json:{features}});
 });
 api.rows.push({tripID:'88888888-8888-4888-8888-888888888888',owner_id:owner.id,created_by:owner.id,trip_name:'Nearby locations',destinations:stops,start_date:'2027-06-01',end_date:'2027-06-03',timezone:'America/Los_Angeles',revision:1,content_version:1,content:{image:'',members:[{id:owner.id,name:'QA Traveler',email:owner.email,role:'Owner',status:'accepted',days:[]}],events:[],expenses:[],prefs:{},budget:null,budgetMode:'group',individual:{},todos:[],dismissed:[]}});
 await page.goto('./#/5');await page.reload();await page.getByRole('button',{name:'Open itinerary',exact:true}).click();await page.getByRole('button',{name:'Add event',exact:true}).click();
 await page.getByLabel('Event name',{exact:true}).fill('Beach walk');
 const input=page.getByRole('combobox',{name:'Where',exact:true});
 const near=page.getByRole('combobox',{name:'Prioritize locations near'});
 await input.fill('T Street');
 await expect(page.locator('[role="listbox"] [role="option"]').first()).toContainText('T Street Beach');
 await near.selectOption(stops[1]);
 await expect(page.locator('[role="listbox"] [role="option"]').first()).toContainText('Paris');
 await near.selectOption('');
 await expect.poll(()=>requests.filter(r=>r.searchParams.get('q')==='T Street').at(-1)?.searchParams.has('lat')).toBe(false);
 await near.selectOption(stops[0]);
 await expect(page.locator('[role="listbox"] [role="option"]').first()).toContainText('T Street Beach');
 await page.screenshot({path:test.info().outputPath('nearby-location-suggestions.png'),fullPage:true});
 await page.getByRole('option',{name:/T Street Beach/}).click();
 await page.getByRole('button',{name:'Add to itinerary',exact:true}).click();
 await expect.poll(()=>api.rows[0].content.events[0]?.place).toBe('T Street Beach, San Clemente, United States');
 const event=api.rows[0].content.events[0];
 await page.goto(`./#/7?event=${event.id}`);await page.reload();await expect(page.getByLabel('Where',{exact:true})).toHaveValue(event.place);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test("a mixed invite keeps only failed addresses and retries without creating another trip", async ({ page }) => {
  const api = await backend(page);
  let attempts = 0;
  await page.route("**/auth/v1/otp**", route => {
    expect(route.request().postDataJSON().email).toBe("new@example.test");
    const callback = new URL(new URL(route.request().url()).searchParams.get("redirect_to")!);
    expect(callback.searchParams.get("trip_invite")).toBe(api.rows[0].tripID);
    attempts++;
    return route.fulfill(attempts > 1 ? {json:{}} : {status:429,json:{message:"Rate limit reached"}});
  });
  await page.goto("./#/6");
  await page.getByLabel("Trip title", {exact:true}).fill("Shared trip");
  await page.getByLabel("Where are you going?", {exact:true}).fill("Taipei");
  await page.getByLabel("Start date", {exact:true}).fill("2027-03-01");
  await page.getByLabel("End date", {exact:true}).fill("2027-03-03");
  const field = page.getByLabel("Invite by email (optional)");
  await field.fill("guest@example.test; NEW@example.test, guest@example.test");
  await field.press("Enter");
  await expect(page.locator(".recipient-chip")).toHaveText(["Guest Traveler", "new@example.test"]);
  await page.getByRole("button", {name:"Create trip",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText("Email sending is temporarily limited");
  await expect(page.locator(".recipient-chip")).toHaveText(["new@example.test"]);
  await page.getByRole("button", {name:"Retry invitations"}).click();
  await expect(page.getByRole("button", {name:"Shared trip",exact:true})).toBeVisible();
  expect(api.rows).toHaveLength(1);
  expect(attempts).toBe(2);
});
