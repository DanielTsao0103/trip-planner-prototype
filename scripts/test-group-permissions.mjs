/** Exercise the hosted RPCs with real authenticated clients from test-trip-invites.mjs. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

export async function verifyGroupPermissions({ owner, guest, outsider, draft, initial, travelerId }) {
  let row = initial;
  const firstDay = draft.start;
  const secondDay = draft.end;
  const check = (response) => {
    assert.ifError(response.error && Error(response.error.message));
    return response.data;
  };
  const payload = (change) => {
    const data = { ...structuredClone(draft), ...structuredClone(row.content) };
    change(data);
    return data;
  };
  const write = (client, data, { revision = row.revision, id = randomUUID(), ownerSave = false } = {}) =>
    client.rpc(ownerSave ? "save_trip_bundle" : "save_shared_trip_changes", {
      p_trip_id: draft.id, p_expected_revision: revision, p_request_id: id, p_data: data,
    });
  const deny = async (label, change, client = guest) => {
    const response = await write(client, payload(change));
    assert.equal(response.error?.code, "42501", label + ": " + JSON.stringify(response.error));
  };
  const ownerChange = async (change) => {
    row = check(await write(owner, payload(change), { ownerSave: true }));
  };
  const sharedChange = async (change) => {
    row = check(await write(guest, payload(change)));
  };
  const grant = async (role, days = []) => {
    await ownerChange((data) => Object.assign(data.members.find((m) => m.id === travelerId), { role, days }));
    assert.equal(row.content.members.find((m) => m.id === travelerId).role, role);
  };

  const editEvent = (data) => { data.events[0].notes = "Traveler's update"; };
  await deny("A Viewer cannot edit events", editEvent);
  await deny("The invited mailbox no longer has this traveler's account rights", editEvent, outsider);
  await deny("A forged Editor role cannot grant edits", (data) => {
    data.members.find((m) => m.id === travelerId).role = "Editor";
    editEvent(data);
  });
  await deny("A Viewer cannot dismiss group suggestions", (data) => data.dismissed.push("gallery"));
  const bypass = await write(guest, payload(editEvent), { ownerSave: true });
  assert.equal(bypass.error?.code, "42501", "The owner save route rejects a guest");
  // A table policy can deny writes by returning zero rows, without an HTTP error.
  const rawEdit = await guest.from("event").update({ title: "Direct table edit" })
    .eq("eventID", row.content.events[0].id).select("eventID");
  assert.ok(rawEdit.error || rawEdit.data.length === 0, "Viewers cannot edit through the event table");
  const rawMembership = await guest.from("trip_member").update({ status: "removed" })
    .eq("tripID", draft.id).eq("planner_id", row.owner_id).select("planner_id");
  assert.ok(rawMembership.error || rawMembership.data.length === 0, "Viewers cannot remove the owner");
  assert.deepEqual(check(await owner.rpc("read_invited_trip", { p_trip: draft.id })), row);

  // An invited account can be linked to a different planner ID. Personal records use the planner ID.
  const expenseId = randomUUID();
  await ownerChange((data) => { data.budgetMode = "individual"; });
  await sharedChange((data) => {
    data.individual[travelerId] = 25000;
    data.expenses.push({
      id: expenseId, purpose: "Tickets", amount: 1000, category: "Activities", payer: travelerId,
      date: firstDay, source: "Manual", shares: { [travelerId]: 500, [row.owner_id]: 500 }, settled: [],
    });
  });
  assert.equal(row.content.individual[travelerId], 25000);
  assert.equal(row.content.expenses.find((e) => e.id === expenseId).payer, travelerId);
  await deny("A Viewer cannot change someone else's budget", (data) => { data.individual[row.owner_id] = 1; });
  await deny("A Viewer cannot reassign the payer", (data) => { data.expenses[0].payer = row.owner_id; });
  await sharedChange((data) => { data.expenses[0].settled.push(row.owner_id); });
  const settledEdit = await write(guest, payload((data) => { data.expenses[0].amount *= 2; }));
  assert.ok(settledEdit.error, "A completed repayment protects its expense");

  await grant("Day Editor", [secondDay]);
  const unassignedId = row.content.events[0].id;
  const assignedId = randomUUID();
  const todoId = randomUUID();
  await sharedChange((data) => {
    data.events.push({ ...data.events[0], id: assignedId, date: secondDay, notes: "Assigned event" });
    data.todos.push({ id: todoId, text: "Bring tickets", done: false, date: secondDay });
  });
  const assigned = (data) => data.events.find((e) => e.id === assignedId);
  const unassigned = (data) => data.events.find((e) => e.id === unassignedId);
  await deny("Day Editor cannot pull an event from another day", (data) => { unassigned(data).date = secondDay; });
  await deny("Day Editor cannot push an event onto another day", (data) => { assigned(data).date = firstDay; });
  await deny("Day Editor cannot remove another day's event", (data) => { data.events = [assigned(data)]; });
  await deny("An authorized change cannot smuggle in an unauthorized one", (data) => {
    assigned(data).name = "Allowed rename";
    unassigned(data).point = { lat: 0, lng: 0 };
  });
  await deny("Day Editor cannot move a reminder to another day", (data) => { data.todos[0].date = firstDay; });
  const ownerRead = check(await owner.rpc("read_invited_trip", { p_trip: draft.id }));
  assert.deepEqual(ownerRead, row, "Denied writes leave every saved row and its revision intact");
  await sharedChange((data) => {
    assigned(data).notes = "Day editor confirmed";
    data.todos[0].done = true;
  });
  assert.equal(assigned(row.content).notes, "Day editor confirmed");

  await grant("Editor");
  await deny("Even an Editor cannot rename the trip", (data) => { data.title = "Changed settings"; });
  await deny("Even an Editor cannot promote themselves", (data) => {
    data.members.find((m) => m.id === travelerId).role = "Owner";
  });
  const priorRevision = row.revision;
  const edit = payload((data) => {
    unassigned(data).date = secondDay;
    unassigned(data).start = "13:00";
    unassigned(data).end = "14:00";
    data.events = [unassigned(data)];
    data.todos = [];
    data.dismissed.push("gallery");
  });
  const requestId = randomUUID();
  row = check(await write(guest, edit, { id: requestId }));
  assert.equal(row.content.events[0].date, secondDay);
  assert.deepEqual(row.content.dismissed, ["gallery"]);
  const retry = check(await write(guest, edit, { id: requestId, revision: priorRevision }));
  assert.equal(retry.revision, row.revision, "Replaying a successful edit is idempotent");
  const stale = await write(guest, payload(editEvent), { revision: priorRevision });
  assert.equal(stale.error?.code, "PT409");
  await grant("Viewer");
  await deny("A demoted Editor cannot save with their existing session", editEvent);
  console.log("Verified hosted group roles, revocation, assigned-day boundaries, own expenses, retries, and forgery rejection.");
  return row;
}

/** Opt-in verification against the deployed app (or its local production preview). */
export async function verifyGroupPermissionScreens({ base, title, event, ownerLogin, guestLogin }) {
  const { chromium, devices, expect } = await import("@playwright/test");
  const browser = await chromium.launch();
  try {
    const ownerPage = await browser.newPage({ viewport: { width: 1280, height: 850 } });
    const guestPage = await browser.newPage(devices["iPhone 13"]);
    async function openTrip(page, login) {
      await page.goto(base);
      await page.getByLabel("Email", { exact: true }).fill(login.email);
      await page.getByLabel("Password", { exact: true }).fill(login.password);
      await page.getByRole("button", { name: "Log in", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Home", exact: true })).toBeVisible({ timeout: 15000 });
      await page.goto(base + "#/5");
      await page.getByRole("button", { name: title, exact: true }).click();
      await page.goto(base + "#/13");
    }
    await Promise.all([openTrip(ownerPage, ownerLogin), openTrip(guestPage, guestLogin)]);
    const changeRole = async (role) => {
      await ownerPage.goto(base + "#/13");
      await ownerPage.getByRole("button", { name: "Change permissions for Invited Traveler" }).click();
      await ownerPage.getByLabel("Role", { exact: true }).selectOption(role);
      await ownerPage.getByRole("button", { name: "Save permissions" }).click();
      await expect(ownerPage.getByRole("dialog")).toHaveCount(0, { timeout: 15000 });
    };
    // The membership email may be the original invitation address when a different account accepts.
    const guestRow = guestPage.locator(".collaborator-row").filter({ hasText: "Invited Traveler (you)" });
    await expect(guestRow).toContainText("Viewer");
    await expect(guestPage.getByRole("button", { name: /Change permissions/ })).toHaveCount(0);
    await changeRole("Editor");
    await guestPage.bringToFront();
    await expect(guestRow).toContainText("Editor", { timeout: 15000 });
    const daily = base + "#/11?date=" + event.date + "&event=" + event.id;
    await guestPage.goto(daily);
    const eventCard = guestPage.getByRole("article", { name: event.name, exact: true });
    await eventCard.getByRole("button", { name: "Edit event" }).click();
    await guestPage.getByLabel("Notes (optional)").fill("Confirmed from a separate traveler session");
    await guestPage.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(eventCard).toContainText("Confirmed from a separate traveler session");
    await ownerPage.bringToFront();
    await ownerPage.goto(daily);
    await expect(ownerPage.getByRole("article", { name: event.name, exact: true }))
      .toContainText("Confirmed from a separate traveler session", { timeout: 15000 });
    await guestPage.goto(base + "#/13");
    await changeRole("Viewer");
    await guestPage.bringToFront();
    await expect(guestRow).toContainText("Viewer", { timeout: 15000 });
    await guestPage.goto(daily);
    await eventCard.getByRole("button", { name: "Edit event" }).click();
    await expect(guestPage.getByRole("dialog")).toContainText("You do not have permission to edit this event.");
    await guestPage.getByRole("dialog").getByRole("button", { name: "Got it" }).click();
    await guestPage.goto(base + "#/7?event=" + event.id + "&date=" + event.date);
    await expect(guestPage.getByText("You do not have permission to edit this event.", { exact: true })).toBeVisible();
    await expect(guestPage.getByLabel("Notes (optional)")).toHaveCount(0);
    console.log("Verified separate desktop owner and mobile traveler sessions, role updates, persisted edits, and viewer denial.");
  } finally {
    await browser.close();
  }
}
