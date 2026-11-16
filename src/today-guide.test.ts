import { test } from "node:test";
import assert from "node:assert/strict";
import { dayProgress, departureAdvice, navigationUrl, parseEstimate, tripClock, itineraryInstant, routeWaypoint } from "./today-guide.ts";
import type { Event } from "./domain.ts";
const event = (id: string, start: string, end: string, date = "2026-11-14"): Event => ({ id, start, end, date, name: id, place: id, notes: "", image: "", cost: 0, attendees: [] });

test("Today separates ongoing from next, detects nested overlaps, and ignores other days", () => {
  const events = [event("long", "09:00", "12:00"), event("short", "09:30", "10:00"), event("next", "11:00", "11:30"), event("tomorrow", "09:00", "10:00", "2026-11-15")];
  const result = dayProgress(events, "2026-11-14", "10:30");
  assert.deepEqual(result.ongoing.map(item => item.id), ["long"]);
  assert.equal(result.next?.id, "next");
  assert.equal(result.previous?.id, "long");
  assert.deepEqual(result.overlaps.map(pair => pair.map(item => item.id)), [["long", "next"]]);
  assert.equal(dayProgress(events, "2026-11-14", "12:00").next, undefined);
  assert.equal(dayProgress(events, "2026-11-14", "12:00").ongoing.length, 0);
});
test("departure accounts for prior activity end, actual lateness, buffer and midnight", () => {
  assert.deepEqual(departureAdvice("10:00", "09:00", 20), { leave: 570, lateBy: 0, bufferShortBy: 0 });
  assert.deepEqual(departureAdvice("10:00", "09:00", 20, "09:50"), { leave: 570, lateBy: 10, bufferShortBy: 20 });
  assert.equal(departureAdvice("00:10", "00:00", 20).leave, -20);
  assert.equal(departureAdvice("10:00", "09:35", 20).lateBy, 0);
});
test("provider data must contain a valid nonnegative duration and distance", () => {
  for (const data of [{}, { routes: [] }, { routes: [{ duration: "oops", distanceMeters: 20 }] }, { routes: [{ duration: "60s" }] }, { routes: [{ duration: "-60s", distanceMeters: 20 }] }]) assert.equal(parseEstimate(data, "WALK"), null);
  assert.deepEqual(parseEstimate({ routes: [{ duration: "61.5s", distanceMeters: 80, warnings: ["Cross carefully", 7] }] }, "WALK"), { mode: "WALK", minutes: 2, meters: 80, warnings: ["Cross carefully"] });
});
test("navigation respects chosen origin, mode, precise place IDs and adjusted pins", () => {
  const url = new URL(navigationUrl({ label: "Museum & garden", googlePlaceId: "xyz" }, "TRANSIT", { label: "My hotel" }));
  assert.equal(url.searchParams.get("travelmode"), "transit");
  assert.equal(url.searchParams.get("origin"), "My hotel");
  assert.equal(url.searchParams.get("destination_place_id"), "xyz");
  const pin = { label: "Museum", googlePlaceId: "xyz", point: { lat: 1, lng: 2 } };
  assert.equal(new URL(navigationUrl(pin, "WALK")).searchParams.has("destination_place_id"), false);
  assert.deepEqual(routeWaypoint(pin), { location: { latLng: { latitude: 1, longitude: 2 } } });
});
test("trip clock and transit times handle timezone boundaries and daylight saving", () => {
  assert.deepEqual(tripClock(new Date("2026-11-15T06:30:00Z"), "America/Los_Angeles"), { date: "2026-11-14", time: "22:30" });
  assert.deepEqual(tripClock(new Date("2026-11-14T17:30:00Z"), "Asia/Taipei"), { date: "2026-11-15", time: "01:30" });
  assert.equal(itineraryInstant("2026-11-14", "10:00", "America/Los_Angeles").toISOString(), "2026-11-14T18:00:00.000Z");
  assert.equal(itineraryInstant("2026-07-14", "10:00", "America/Los_Angeles").toISOString(), "2026-07-14T17:00:00.000Z");
});

test("an incoming journey keeps the same identity after its destination starts", async () => {
  const { incomingJourneyId, previousStop } = await import('./today-guide.ts');
  const first = event('museum', '10:00', '12:00'), last = event('lunch', '13:00', '14:00');
  assert.equal(incomingJourneyId([first, last], last), '2026-11-14:museum:lunch');
  assert.equal(previousStop([first, last], last)?.id, 'museum');
  assert.equal(incomingJourneyId([first, last], first), '2026-11-14:start:museum');
});

test('overnight travel remains current on the arrival day and ends at its actual time', async () => {
  const { endMinutesOn } = await import('./today-guide.ts');
  const overnight = {...event('night train', '23:00', '07:30'), endDate:'2026-11-15'};
  const breakfast = event('breakfast', '08:00', '09:00', '2026-11-15');
  const before = dayProgress([overnight, breakfast], '2026-11-14', '23:30');
  assert.deepEqual(before.ongoing.map(item=>item.id), ['night train']);
  const arrival = dayProgress([overnight, breakfast], '2026-11-15', '07:00');
  assert.deepEqual(arrival.ongoing.map(item=>item.id), ['night train']);
  assert.equal(arrival.next?.id, 'breakfast');
  assert.equal(arrival.previous?.id, 'night train');
  assert.equal(endMinutesOn(overnight, '2026-11-15'), 450);
  assert.equal(dayProgress([overnight], '2026-11-15', '07:30').ongoing.length, 0);
  assert.equal(dayProgress([{...overnight,end:'00:00'}], '2026-11-15', '00:00').today.length, 0);
});

test('a conflicting overnight predecessor retains its day offset in departure advice', () => {
  assert.deepEqual(departureAdvice('22:00','20:00',30,1440+450),{leave:1280,lateBy:600,bufferShortBy:610});
});
