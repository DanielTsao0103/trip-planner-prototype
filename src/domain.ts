/** Domain rules shared by every screen. Amounts are stored in cents. */
export type Role = "Owner" | "Editor" | "Viewer" | "Day Editor";
export type Member = {
  id: string;
  name: string;
  email: string;
  role: Role;
  days: string[];
  status: "accepted" | "pending";
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
  start: string;
  end: string;
  cost: number;
  attendees: string[];
  image: string;
  notes: string;
  place: string;
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
  settled: string[];
};
export type Trip = {
  id: string;
  title: string;
  destinations: string[];
  start: string;
  end: string;
  zone: string;
  image: string;
  sample?: boolean;
  members: Member[];
  events: Event[];
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
export const timeText = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};
export const member = (trip: Trip, user: string | null) =>
  trip.members.find((m) => m.id === user && m.status === "accepted");
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
export const orderedEvents = (trip: Trip, date?: string) =>
  trip.events
    .filter((e) => !date || e.date === date)
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
export function eventError(
  trip: Trip,
  user: string | null,
  event: Event,
  original?: Event,
): string {
  if (!member(trip, user)) return "You no longer have access to this trip.";
  if (
    !canEdit(trip, user, event.date) ||
    (original && !canEdit(trip, user, original.date))
  )
    return "You can only change days you have permission to edit.";
  if (!event.name.trim() || !event.place.trim())
    return "Add an event name and location.";
  if (event.date < trip.start || event.date > trip.end)
    return "Choose a day within the trip dates.";
  if (event.end <= event.start)
    return "End time must be after start time. Split overnight activities into one event per day.";
  if (!Number.isFinite(event.cost) || event.cost < 0)
    return "Cost must be zero or a positive amount.";
  const conflict = trip.events.find(
    (e) =>
      e.id !== event.id &&
      e.date === event.date &&
      event.start < e.end &&
      event.end > e.start,
  );
  return conflict
    ? `This overlaps with ${conflict.name} (${timeText(conflict.start)}–${timeText(conflict.end)}). Choose another time.`
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
