export type MapPoint = { lat: number; lng: number };
import { TEXT_LIMITS, MONEY_LIMITS, textError } from "./limits.ts";
/** Domain rules shared by every screen. Amounts are stored in cents. */
export type Role = "Owner" | "Editor" | "Viewer" | "Day Editor";
export type Member = {
  signupPending?: boolean;
  accountId?: string | null;
  id: string;
  name: string;
  email: string;
  role: Role;
  days: string[];
  status: "accepted" | "pending" | "removed";
};
export type Preference = {
  diet: string[];
  food: string;
  spending: string;
  dining: string;
  atmosphere: string;
  access: string[];
  walk: number;
  interests: string[];
  destinations: string;
  tickets: string;
  notes: string;
};
export type Event = {
  id: string;
  name: string;
  date: string;
  /** Omitted legacy values end on the start date. */
  endDate?: string;
  start: string;
  end: string;
  cost: number;
  attendees: string[];
  image: string;
  notes: string;
  place: string;
  point?: MapPoint | null;
  googlePlaceId?: string | null;
};
/** Calendar intervals use trip-local wall time, independent of the device zone. */
export const eventEndDate = (event: Pick<Event, "date" | "endDate">): string => event.endDate || event.date;
export const eventTimestamp = (date: string, time: string): number => Date.parse(`${date}T${time}:00Z`) / 60000;
export function eventInterval(event: Pick<Event, "date" | "endDate" | "start" | "end">) {
  return { start: eventTimestamp(event.date, event.start), end: eventTimestamp(eventEndDate(event), event.end) };
}
export function eventOccursOn(event: Pick<Event, "date" | "endDate" | "start" | "end">, date: string): boolean {
  const interval = eventInterval(event), midnight = eventTimestamp(date, "00:00");
  return interval.start < midnight + 1440 && interval.end > midnight;
}
/** Display projections never enter the trip's canonical event collection. */
export type EventDaySegment = { event: Event; date: string; startMinute: number; endMinute: number; continuesBefore: boolean; continuesAfter: boolean; key: string };
export function eventSegments(event: Event, date?: string): EventDaySegment[] {
  const interval = eventInterval(event);
  if (!Number.isFinite(interval.start) || !Number.isFinite(interval.end) || interval.end <= interval.start) return [];
  return (date ? [date] : days(event.date, eventEndDate(event))).filter(day => eventOccursOn(event, day)).map(day => {
    const midnight = eventTimestamp(day, "00:00");
    return { event, date: day, startMinute: Math.max(0, interval.start - midnight), endMinute: Math.min(1440, interval.end - midnight),
      continuesBefore: interval.start < midnight, continuesAfter: interval.end > midnight + 1440, key: `${event.id}:${day}` };
  });
}
export const eventDates = (event: Event): string[] => eventSegments(event).map(segment => segment.date);
export const canEditEvent = (trip: Trip, user: string | null, event: Event): boolean => {
  const occupied = eventDates(event);
  return occupied.length > 0 && occupied.every(date => canEdit(trip, user, date));
};
export const eventTimeRange = (event: Event): string => eventEndDate(event) === event.date
  ? `${timeText(event.start)} – ${timeText(event.end)}`
  : `${dateText(event.date, true)}, ${timeText(event.start)} – ${dateText(eventEndDate(event), true)}, ${timeText(event.end)}`;

/** A researched place can be collected before choosing a day or time. */
export type SavedPlace = {
  id: string;
  name: string;
  place: string;
  notes: string;
  point?: MapPoint | null;
  googlePlaceId?: string | null;
};
/** Compare content without depending on PostgreSQL JSONB object-key order. */
export function savedPlaceVersion(place?: SavedPlace): string {
  return place ? JSON.stringify([place.id, place.name, place.place, place.notes,
    place.point?.lat ?? null, place.point?.lng ?? null, place.googlePlaceId ?? null]) : "";
}
export type RepaymentEntry = {
  id: string;
  debtor: string;
  status: "paid" | "unpaid";
  reason: string;
  actor: string;
  /** Supplied by the server for account history; absent while the save is pending. */
  recordedAt?: string;
};
export type Expense = {
  id: string;
  purpose: string;
  amount: number;
  category: string;
  payer: string;
  shares: Record<string, number>;
  date: string;
  source: string;
  /** Ever-paid participants; retained permanently to lock the original expense. */
  settled: string[];
  repaymentHistory?: RepaymentEntry[];
};
export type Trip = {
  /** Account trips reload all structured planning details from Supabase. */
  persistence?: "account";
  revision?: number;
  contentVersion?: number;
  id: string;
  title: string;
  destinations: string[];
  /** IANA time zones aligned by index with destinations. */
  destinationTimezones?: (string | null)[];
  start: string;
  end: string;
  zone: string;
  image: string;
  imageCredit?: { name: string; profileUrl: string; photoUrl: string };
  imageSource?: "unsplash" | "upload";
  sample?: boolean;
  members: Member[];
  events: Event[];
  savedPlaces?: SavedPlace[];
  prefs: Record<string, Preference>;
  expenses: Expense[];
  budget: number | null;
  budgetMode: "group" | "individual";
  individual: Record<string, number>;
  todos: { id: string; text: string; date: string; done: boolean }[];
  dismissed: string[];
};
export type User = {
  id: string;
  name: string;
  email: string;
  connections: Record<string, string[]>;
};
export type Store = {
  version: number;
  users: User[];
  userId: string | null;
  trips: Trip[];
  tripId: string | null;
  date: string;
  time: string;
  location: boolean;
  noticeDismissed: boolean;
  /** Keep the tester's workspace available while previewing the fictional group. */
  sampleReturn?: { userId: string; tripId: string | null };
};
export const uid = () => crypto.randomUUID();
export const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
export const days = (start: string, end: string): string[] => {
  const result: string[] = [];
  const d = new Date(start + "T12:00:00Z");
  for (
    let i = 0;
    d.toISOString().slice(0, 10) <= end && i < 366;
    i++, d.setUTCDate(d.getUTCDate() + 1)
  )
    result.push(d.toISOString().slice(0, 10));
  return result;
};
export const dateText = (date: string, short = false) =>
  new Date(date + "T12:00:00").toLocaleDateString(
    "en-US",
    short
      ? { month: "short", day: "numeric" }
      : { month: "long", day: "numeric", year: "numeric" },
  );
/** Keep same-name trips distinguishable, including ranges that cross New Year. */
export const tripDateRange = (start: string, end: string): string => {
  const startYear = start.slice(0, 4), endYear = end.slice(0, 4);
  return `${dateText(start, true)}${startYear !== endYear ? `, ${startYear}` : ""} – ${dateText(end, true)}, ${endYear}`;
};
export const timeText = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};
export const durationText = (start: string, end: string) => {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm);
  if (!(mins > 0)) return "";
  const h = Math.floor(mins / 60),
    m = mins % 60;
  return [h ? `${h} hr` : "", m ? `${m} min` : ""].filter(Boolean).join(" ");
};
const ZONE_LABELS: Record<string, string> = {
  "America/Los_Angeles": "Pacific Time",
  "America/Denver": "Mountain Time",
  "America/Chicago": "Central Time",
  "America/New_York": "Eastern Time",
  "Europe/London": "London · United Kingdom",
  "Europe/Paris": "Paris · Central Europe",
  "Asia/Taipei": "Taipei · Taiwan",
  "Asia/Tokyo": "Tokyo · Japan",
  "Australia/Sydney": "Sydney · Australia",
};
export const zoneText = (zone: string) =>
  ZONE_LABELS[zone] ||
  zone.split("/").pop()!.replace(/_/g, " ");
export const EVENT_PERMISSION_MESSAGE = "You do not have permission to edit this event.";
export const member = (trip: Trip, user: string | null) =>
  trip.members.find((m) => !!user && m.status === "accepted" && (
    trip.persistence === "account" && m.role !== "Owner"
      ? m.accountId === user
      : m.id === user
  ));
export const canEdit = (trip: Trip, user: string | null, date: string) => {
  const m = member(trip, user);
  return (
    !!m &&
    (m.role === "Owner" ||
      m.role === "Editor" ||
      (m.role === "Day Editor" && m.days.includes(date)))
  );
};
export const isOwner = (trip: Trip, user: string | null) =>
  member(trip, user)?.role === "Owner";
export const isActive = (trip: Trip, date: string) =>
  date >= trip.start && date <= trip.end;
/** A saved event link follows the event if a collaborator moves it to another day. */
export function itineraryDay(trip: Trip, eventId: string | null, requested: string | null, fallback: string) {
  const event = eventId && trip.events.find((entry) => entry.id === eventId);
  if (event) return requested && eventOccursOn(event, requested) ? requested : event.date;
  if (requested && isActive(trip, requested)) return requested;
  return isActive(trip, fallback) ? fallback : trip.start;
}
export const orderedEvents = (trip: Trip, date?: string) =>
  trip.events
    .filter((e) => !date || eventOccursOn(e, date))
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
export function eventError(
  trip: Trip,
  user: string | null,
  event: Event,
  original?: Event,
): string {
  if (!member(trip, user)) return "You no longer have access to this trip.";
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!validDate(event.date) || !validDate(eventEndDate(event)) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(event.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(event.end))
    return "Choose valid start and end dates and times.";
  const interval = eventInterval(event);
  if (interval.end <= interval.start) return "End date and time must be after the start. Choose a later end date for overnight plans.";
  if (
    !canEditEvent(trip, user, event) ||
    (original && !canEditEvent(trip, user, original))
  )
    return EVENT_PERMISSION_MESSAGE;
  const problem =
    textError(event.name, "Event name", TEXT_LIMITS.eventName, true) ||
    (!event.place?.trim() && "Enter a location.") ||
    (event.place !== original?.place && textError(event.place, "Location", TEXT_LIMITS.eventAddress)) ||
    textError(event.notes, "Notes", TEXT_LIMITS.notes);
  if (problem) return problem;
  if (event.date < trip.start || eventEndDate(event) > trip.end)
    return "Choose a day within the trip dates.";
  if (
    !Number.isSafeInteger(event.cost) ||
    event.cost < 0 ||
    event.cost > MONEY_LIMITS.expense
  )
    return "Cost must be between $0.00 and $99,999.99 in whole cents.";
  const conflict = trip.events.find(
    (e) =>
      e.id !== event.id &&
      interval.start < eventInterval(e).end &&
      interval.end > eventInterval(e).start,
  );
  return conflict
    ? `This overlaps with ${conflict.name} (${eventTimeRange(conflict)}). Choose another time.`
    : "";
}
/** Remainder cents are allocated deterministically, so every split reconciles. */
export function splitCents(
  amount: number,
  ids: string[],
): Record<string, number> {
  if (!ids.length) return {};
  return Object.fromEntries(
    ids.map((id, i) => [
      id,
      Math.floor(amount / ids.length) + (i < amount % ids.length ? 1 : 0),
    ]),
  );
}
export const spent = (trip: Trip, user?: string) =>
  trip.expenses.reduce(
    (sum, e) => sum + (user ? e.shares[user] || 0 : e.amount),
    0,
  );
export const blankPrefs = (): Preference => ({
  diet: [],
  food: "A little of both",
  spending: "Moderate",
  dining: "Casual & simple",
  atmosphere: "Relaxed",
  access: [],
  walk: 1000,
  interests: [],
  destinations: "",
  tickets: "Happy to book ahead",
  notes: "",
});
