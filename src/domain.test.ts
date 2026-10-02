import { test } from "node:test";
import assert from "node:assert/strict";
import {
  days,
  splitCents,
  canEdit,
  eventError,
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
