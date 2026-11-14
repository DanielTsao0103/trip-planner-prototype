import type { Event, MapPoint } from "./domain.ts";

export type TravelMode = "WALK" | "TRANSIT" | "DRIVE";
export const TRAVEL_MODES: TravelMode[] = ["WALK", "TRANSIT", "DRIVE"];
export const MODE_LABELS: Record<TravelMode, string> = { WALK: "Walk", TRANSIT: "Transit", DRIVE: "Drive" };
export type RouteLocation = { label: string; point?: MapPoint | null; googlePlaceId?: string | null; place?: string };
export type TravelEstimate = { mode: TravelMode; minutes: number; meters: number; warnings: string[] };
export const ARRIVAL_BUFFER = 10;
export const minutesOfDay = (time: string): number => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
export const clockTime = (minutes: number): string => {
  const value = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
};

/** Intl keeps the travel-day clock independent of the device's timezone. */
export function tripClock(now: Date, zone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (name: string) => parts.find(part => part.type === name)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

/** Convert a local itinerary time to an instant for transit departure requests. */
export function itineraryInstant(date: string, time: string, zone: string): Date {
  const target = Date.parse(`${date}T${time}:00Z`);
  let instant = target;
  for (let i = 0; i < 4; i++) {
    const local = tripClock(new Date(instant), zone);
    const delta = target - Date.parse(`${local.date}T${local.time}:00Z`);
    if (!delta) break;
    instant += delta;
  }
  return new Date(instant);
}

/** Ongoing events stay distinct from a future destination; no completed stop is revived. */
export function dayProgress(events: Event[], date: string, time: string) {
  const today = events.filter(event => event.date === date).sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  const ongoing = today.filter(event => event.start <= time && event.end > time);
  const next = today.find(event => event.start > time);
  const previous = next ? today.filter(event => event.id !== next.id && event.start <= next.start)
    .sort((a, b) => b.end.localeCompare(a.end))[0] : undefined;
  const overlaps: [Event, Event][] = [];
  for (let i = 0; i < today.length; i++) {
    for (let j = i + 1; j < today.length && today[j].start < today[i].end; j++) {
      if (today[j].end > time) overlaps.push([today[i], today[j]]);
    }
  }
  return { today, ongoing, next, previous, overlaps };
}

export function eventLocation(event: Event): RouteLocation | undefined {
  return event.place.trim() || event.point || event.googlePlaceId
    ? { label: event.place.trim() || event.name, place: event.place.trim(), point: event.point, googlePlaceId: event.googlePlaceId }
    : undefined;
}

/** Only a provider duration can produce a leave-by time; straight-line distance cannot. */
export function departureAdvice(start: string, now: string, duration: number, availableAt = now) {
  const leave = minutesOfDay(start) - duration - ARRIVAL_BUFFER;
  const earliest = Math.max(minutesOfDay(now), minutesOfDay(availableAt));
  return { leave, lateBy: Math.max(0, earliest + duration - minutesOfDay(start)), bufferShortBy: Math.max(0, earliest - leave) };
}

export function navigationUrl(destination: RouteLocation, mode: TravelMode, origin?: RouteLocation): string {
  const query = new URLSearchParams({ api: "1", destination: locationText(destination), travelmode: { WALK: "walking", TRANSIT: "transit", DRIVE: "driving" }[mode] });
  if (destination.googlePlaceId && !destination.point) query.set("destination_place_id", destination.googlePlaceId);
  if (origin) {
    query.set("origin", locationText(origin));
    if (origin.googlePlaceId && !origin.point) query.set("origin_place_id", origin.googlePlaceId);
  }
  return `https://www.google.com/maps/dir/?${query}`;
}
function locationText(location: RouteLocation): string {
  return location.point ? `${location.point.lat},${location.point.lng}` : location.place || location.label;
}
export function routeWaypoint(location: RouteLocation) {
  // User-adjusted pins take precedence over the original provider place ID.
  if (location.point) return { location: { latLng: { latitude: location.point.lat, longitude: location.point.lng } } };
  if (location.googlePlaceId) return { placeId: location.googlePlaceId };
  return { address: location.place || location.label };
}

/** Provider payloads are untrusted; missing/invalid durations are never zero-minute routes. */
export function parseEstimate(payload: unknown, mode: TravelMode): TravelEstimate | null {
  const route = (payload as { routes?: { duration?: unknown; distanceMeters?: unknown; warnings?: unknown }[] })?.routes?.[0];
  if (!route || typeof route.duration !== "string" || !/^\d+(?:\.\d+)?s$/.test(route.duration)) return null;
  const seconds = Number(route.duration.slice(0, -1));
  if (!Number.isFinite(seconds) || seconds < 0 || typeof route.distanceMeters !== "number" || !Number.isFinite(route.distanceMeters) || route.distanceMeters < 0) return null;
  return { mode, minutes: Math.ceil(seconds / 60), meters: route.distanceMeters, warnings: Array.isArray(route.warnings) ? route.warnings.filter((value): value is string => typeof value === "string") : [] };
}
