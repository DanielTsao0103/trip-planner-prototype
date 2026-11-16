import { test } from "node:test";
import assert from "node:assert/strict";
import {
  days,
  splitCents,
  canEdit,
  eventError,
  eventSegments,
  eventDates,
  eventInterval,
  eventOccursOn,
  canEditEvent,
  itineraryDay,
  orderedEvents,
  isActive,
  spent,
  type Trip,
  type Event,
} from "./domain.ts";
const trip = (): Trip => ({
  id: "t",
  title: "Test",
  destinations: ["Seattle"],
  start: "2026-10-15",
  end: "2026-10-18",
  zone: "America/Los_Angeles",
  image: "",
  members: [
    {
      id: "owner",
      name: "Owner",
      email: "a@example.com",
      role: "Owner",
      days: [],
      status: "accepted",
    },
    {
      id: "limited",
      name: "Limited",
      email: "b@example.com",
      role: "Day Editor",
      days: ["2026-10-17"],
      status: "accepted",
    },
    {
      id: "viewer",
      name: "Viewer",
      email: "c@example.com",
      role: "Viewer",
      days: [],
      status: "accepted",
    },
  ],
  events: [],
  prefs: {},
  expenses: [],
  budget: 100000,
  budgetMode: "group",
  individual: {},
  todos: [],
  dismissed: [],
});
const event = (date = "2026-10-17", start = "10:00", end = "11:00"): Event => ({
  id: "e",
  name: "Art",
  place: "Gallery",
  date,
  start,
  end,
  cost: 1000,
  attendees: ["owner"],
  image: "",
  notes: "",
});
test("inclusive dates handle month and leap-year boundaries", () => {
  assert.deepEqual(days("2028-02-28", "2028-03-01"), [
    "2028-02-28",
    "2028-02-29",
    "2028-03-01",
  ]);
  assert.equal(isActive(trip(), "2026-10-18"), true);
  assert.equal(isActive(trip(), "2026-10-19"), false);
});
test("equal shares reconcile every cent", () => {
  const split = splitCents(1001, ["a", "b", "c"]);
  assert.deepEqual(split, { a: 334, b: 334, c: 333 });
  assert.equal(
    Object.values(split).reduce((a, b) => a + b, 0),
    1001,
  );
});
test("viewer, removed member, and day limits are enforced", () => {
  const t = trip();
  assert.equal(canEdit(t, "viewer", "2026-10-17"), false);
  assert.equal(canEdit(t, "removed", "2026-10-17"), false);
  assert.equal(canEdit(t, "limited", "2026-10-17"), true);
  assert.equal(canEdit(t, "limited", "2026-10-16"), false);
  assert.match(eventError(t, "limited", event("2026-10-16")), /permission/);
});
test("a shared account uses its accepted membership even if its account ID matches an unlinked guest", () => {
  const t = trip();
  t.persistence = "account";
  t.members.push({ ...t.members[1], id: "account-id", role: "Editor" });
  const invited = t.members[2];
  invited.accountId = "account-id";
  assert.equal(canEdit(t, "account-id", t.start), false);
  invited.role = "Editor";
  assert.equal(canEdit(t, "account-id", t.start), true);
  invited.status = "removed";
  assert.equal(canEdit(t, "account-id", t.start), false);
});
test("address edits allow 2,048 characters and preserve longer saved locations", () => {
  const t = trip();
  const atLimit = { ...event(), place: "A".repeat(2048) };
  const legacy = { ...atLimit, place: atLimit.place + "B" };
  assert.equal(eventError(t, "owner", atLimit), "");
  assert.match(eventError(t, "owner", legacy), /2,048/);
  assert.match(eventError(t, "owner", legacy, atLimit), /2,048/);
  assert.equal(eventError(t, "owner", { ...legacy, notes: "Meet outside" }, legacy), "");
});
test("moving an event requires source and destination permission", () => {
  const t = trip();
  assert.match(
    eventError(t, "limited", event("2026-10-17"), event("2026-10-16")),
    /permission/,
  );
});
test("overlap blocked, adjacent event allowed, overnight validated", () => {
  const t = trip();
  t.events = [event()];
  assert.match(
    eventError(t, "owner", {
      ...event("2026-10-17", "10:30", "11:30"),
      id: "new",
    }),
    /overlaps/,
  );
  assert.equal(
    eventError(t, "owner", {
      ...event("2026-10-17", "11:00", "12:00"),
      id: "new",
    }),
    "",
  );
  assert.match(
    eventError(t, "owner", event("2026-10-17", "23:00", "01:00")),
    /overnight/,
  );
});
test("reimbursement status does not create spending", () => {
  const t = trip();
  t.expenses = [
    {
      id: "x",
      purpose: "Dinner",
      amount: 1001,
      category: "Food",
      payer: "owner",
      shares: splitCents(1001, ["owner", "limited", "viewer"]),
      date: t.start,
      source: "Manual",
      settled: [],
    },
  ];
  assert.equal(spent(t), 1001);
  assert.equal(spent(t, "limited"), 334);
  t.expenses[0].settled.push("limited");
  assert.equal(spent(t), 1001);
});


test("overnight intervals project across midnight without duplicating stored identity or costs", () => {
  const overnight = {...event(), start:"23:30", end:"01:15", endDate:"2026-10-18"};
  const t=trip(); t.events=[overnight];
  assert.equal(eventError(t,"owner",overnight), "");
  const segments=eventSegments(overnight);
  assert.deepEqual(segments.map(s=>[s.date,s.startMinute,s.endMinute]), [["2026-10-17",1410,1440],["2026-10-18",0,75]]);
  assert.equal(segments[0].event, overnight);
  assert.equal(segments[1].event, overnight);
  assert.equal(eventInterval(overnight).end-eventInterval(overnight).start,105);
  assert.equal(t.events.reduce((sum,e)=>sum+e.cost,0),1000);
  assert.equal(orderedEvents(t).length,1);
  assert.equal(orderedEvents(t,"2026-10-18")[0],overnight);
  assert.equal(itineraryDay(t,overnight.id,"2026-10-18",t.start),"2026-10-18");
});
test("midnight is exclusive and multi-day intervals retain full intermediate days",()=>{
  const overnight={...event("2026-10-16"),start:"20:00",end:"00:00",endDate:"2026-10-18"};
  assert.deepEqual(eventDates(overnight),["2026-10-16","2026-10-17"]);
  assert.equal(eventOccursOn(overnight,"2026-10-18"),false);
  assert.deepEqual(eventSegments(overnight).map(s=>[s.startMinute,s.endMinute]),[[1200,1440],[0,1440]]);
  assert.deepEqual(eventSegments({...overnight,endDate:overnight.date}),[]);
});
test("overnight conflicts and day grants cover all old and new occupied dates",()=>{
  const t=trip(), overnight={...event(),start:"23:30",end:"01:15",endDate:"2026-10-18"};
  assert.equal(canEditEvent(t,"limited",overnight),false);
  assert.match(eventError(t,"limited",overnight),/permission/);
  t.members[1].days.push("2026-10-18");
  assert.equal(eventError(t,"limited",overnight),"");
  t.events=[{...event("2026-10-18","00:30","02:00"),id:"other"}];
  assert.match(eventError(t,"owner",overnight),/overlaps/);
  t.events=[{...event("2026-10-18","01:15","02:00"),id:"other"}];
  assert.equal(eventError(t,"owner",overnight),"");
  t.members[1].days=["2026-10-17"];
  assert.match(eventError(t,"limited",event(),overnight),/permission/);
  assert.match(eventError(t,"owner",{...overnight,endDate:"2026-10-19"}),/within/);
  assert.match(eventError(t,"owner",{...overnight,endDate:"2026-02-30"}),/valid/);
});
test("calendar-date projection handles New Year and leap day without device timezone offsets",()=>{
  assert.deepEqual(eventDates({...event("2027-12-31"),endDate:"2028-01-01",start:"23:00",end:"01:00"}),["2027-12-31","2028-01-01"]);
  assert.deepEqual(eventDates({...event("2028-02-28"),endDate:"2028-03-01",start:"23:00",end:"01:00"}),["2028-02-28","2028-02-29","2028-03-01"]);
});
