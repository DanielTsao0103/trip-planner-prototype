/** Shared planning contract. No browser state, credentials, or provider calls. */
export type Intent = "lunch" | "dinner" | "activity";
type Preferences = { diet: string[]; access: string[]; walk: number; interests: string[]; food: string; spending: string; dining: string; atmosphere: string; destinations: string; tickets: string; notes: string };
export type PlanningTrip = {
  id: string; start: string; end: string; zone: string; destinations: string[];
  members: { id: string; accountId?: string | null; role: string; status: string }[];
  prefs: Record<string, Preferences>;
  events: { id: string; name: string; place: string; date: string; start: string; end: string; cost: number; attendees: string[] }[];
  expenses: { amount: number; shares: Record<string, number> }[];
  budget: number | null; budgetMode: string; individual: Record<string, number>;
};
export type PlanningContext = ReturnType<typeof planningContext>;
export const minutes = (time: string) => { const [h, m] = time.split(":").map(Number); return h * 60 + m; };
const clock = (time: number) => `${String(Math.floor(time / 60)).padStart(2, "0")}:${String(time % 60).padStart(2, "0")}`;
export function planningContext(trip: PlanningTrip, actor: string, date: string, intent: Intent, anchorId?: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || date < trip.start || date > trip.end) throw new Error("Choose a day within this trip.");
  const travelers = trip.members.filter(m => m.status === "accepted");
  const self = travelers.find(m => m.id === actor || m.accountId === actor);
  const answers = travelers.flatMap(m => trip.prefs[m.id] ? [{ ...trip.prefs[m.id], requester: m.id === self?.id }] : []);
  const events = trip.events.filter(e => e.date === date).sort((a, b) => a.start.localeCompare(b.start));
  const window = intent === "lunch" ? [11 * 60, 15 * 60] : intent === "dinner" ? [17 * 60, 21 * 60] : [9 * 60, 20 * 60];
  // Reserve 30 minutes each side, explicitly provisional until routing is available.
  const gaps: { start: string; end: string }[] = [];
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: trip.zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const part = (key: string) => parts.find(p => p.type === key)!.value;
  const today = `${part("year")}-${part("month")}-${part("day")}`;
  let cursor = date < today ? 1440 : Math.max(window[0], date === today ? Number(part("hour")) * 60 + Number(part("minute")) + 1 : 0);
  for (const event of events) {
    const end = Math.min(window[1], minutes(event.start) - 30);
    if (end - cursor >= 60) gaps.push({ start: clock(cursor), end: clock(end) });
    cursor = Math.max(cursor, minutes(event.end) + 30);
  }
  if (window[1] - cursor >= 60) gaps.push({ start: clock(cursor), end: clock(window[1]) });
  const anchor = events.find(e => e.id === anchorId) || [...events].reverse().find(e => minutes(e.end) <= (gaps[0] ? minutes(gaps[0].start) : window[0])) || events[0];
  const location = nearbySearchArea(trip, anchor, date);
  const planned = trip.events.reduce((sum, e) => sum + e.cost, 0);
  const spent = trip.expenses.reduce((sum, e) => sum + e.amount, 0);
  // Conservative reservation: a planned item and its expense may both be counted.
  const remainingGroupCents = trip.budgetMode === "group" && trip.budget !== null ? Math.max(0, trip.budget - planned - spent) : null;
  const individualRemaining = travelers.map(m => {
    const budget = trip.individual[m.id];
    if (budget === undefined) return null;
    const expenses = trip.expenses.reduce((sum, e) => sum + (e.shares[m.id] || 0), 0);
    const reserved = trip.events.reduce((sum, e) => sum + (e.attendees.includes(m.id) ? Math.ceil(e.cost / Math.max(1, e.attendees.length)) : 0), 0);
    return Math.max(0, budget - expenses - reserved);
  });
  return {
    date, zone: trip.zone, intent, destinations: trip.destinations,
    area: location.area, locationNote: location.note, anchorId: anchor?.id,
    travelers: travelers.length, answered: answers.length, preferences: answers,
    diet: [...new Set(answers.flatMap(p => p.diet))].filter(v => v !== "No restrictions"),
    access: [...new Set(answers.flatMap(p => p.access))],
    walkMeters: answers.length ? Math.min(...answers.map(p => p.walk)) : null,
    remainingGroupCents, individualRemaining: trip.budgetMode === "individual" ? individualRemaining : [],
    events: events.map(({ name, place, start, end }) => ({ name, place, start, end })), gaps,
    budgetNote: "Recorded expenses and planned costs are both reserved; this can count the same purchase twice. Prices, currency conversion and travel still require confirmation.",
  };
}
/** Preserve saved address text; qualify venue-only text without combining unrelated cities. */
export function nearbySearchArea(trip: Pick<PlanningTrip, "destinations" | "events">, anchor: PlanningTrip["events"][number] | undefined, date: string) {
  const normalize = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const match = (place: string) => trip.destinations.find(destination => {
    const city = normalize(destination.split(/[,，]/u)[0]);
    return !!city && ` ${normalize(place)} `.includes(` ${city} `);
  });
  const place = anchor?.place.trim() || "";
  const matched = match(place);
  // A saved city/address outside the destination list is more precise than a guessed first city.
  const addressParts = place.split(/[,，]/u).filter(v => v.trim());
  const streetOnlySuffix = addressParts.length === 2 && /^\s*\d+\s+/.test(addressParts[1]);
  const qualifiedAddress = addressParts.length >= 2 && !streetOnlySuffix;
  if (qualifiedAddress) return { area: place, note: "" };
  const previousDate = Date.parse(`${date}T00:00:00Z`) - 86400000;
  const nearbyEvents = trip.events.filter(e => e.date === date || Date.parse(`${e.date}T00:00:00Z`) === previousDate)
    .sort((a, b) => Math.abs(Date.parse(`${a.date}T${a.start}:00Z`) - Date.parse(`${date}T${anchor?.start || "12:00"}:00Z`)) - Math.abs(Date.parse(`${b.date}T${b.start}:00Z`) - Date.parse(`${date}T${anchor?.start || "12:00"}:00Z`)));
  const destination = matched || nearbyEvents.map(e => match(e.place)).find(Boolean) || trip.destinations[0]?.trim() || "";
  if (!place) return { area: destination, note: "" };
  const area = destination && !normalize(place).includes(normalize(destination)) ? `${place} · ${destination}` : place;
  return { area, note: matched ? "" : "This venue has no saved address. The search uses the trip destination for context; add its full address to pinpoint the location." };
}
export const NEARBY_EMPTY_MESSAGES = {
  missing_area: { title: "Add a search location", message: "No destination or event location is saved for this search.", action: "Add a trip destination or an event address, then try again." },
  no_time: { title: "No planning time is available", message: "This day has no upcoming free hour in the selected category’s time window, including the provisional travel buffers.", action: "Choose another day or category, or review the existing plans." },
  no_sources: { title: "No usable sources found", message: "The web search returned no usable source excerpts for this location and category.", action: "Check the location shown above. Add the venue’s full address or choose another category." },
  no_candidates: { title: "Sources found, but no candidates returned", message: "The AI did not propose any places from the retrieved sources for this trip context.", action: "Check the location and group preferences, or try another category." },
  evidence: { title: "Not enough supporting evidence", message: "Candidates were returned, but none retained a matching source quote and venue reference after the evidence checks.", action: "A more precise event address may improve the search. You can also try another category." },
  budget: { title: "Candidates exceeded a saved budget", message: "The returned candidates were removed because their supported USD estimates exceeded a remaining group or individual budget.", action: "Review the budget reservations or try another category." },
  conflicts: { title: "Candidates conflicted with group needs", message: "The AI flagged incompatibilities with the saved planning constraints, so those candidates were removed.", action: "Review the group preferences or search another category. Keep essential requirements in place." },
  duplicates: { title: "Those places are already covered", message: "The candidates duplicated existing itinerary places or repeated another candidate.", action: "Choose another day or category to explore different places." },
  invalid: { title: "Candidates had incomplete details", message: "The returned candidates contained missing or invalid planning details and could not be displayed.", action: "Try again later. No incomplete candidate has been added to your itinerary." },
  filtered: { title: "Candidates were removed by the checks", message: "The candidates were removed for a combination of evidence, budget, compatibility, duplicate or data-quality reasons.", action: "Review the search details below and check the location, category and saved constraints." },
} as const;
export type EmptyReason = keyof typeof NEARBY_EMPTY_MESSAGES;
export type ReviewRejections = Partial<Record<"evidence" | "budget" | "conflicts" | "duplicates" | "invalid", number>>;
export type Candidate = {
  name: string; address: string; reason: string; durationMinutes: number;
  pricePerPersonCents: number | null; currency: string | null;
  facts: { topic: string; detail: string; sourceUrl: string }[];
  concerns: string[]; conflicts: string[];
};
export type NearbyResult = Candidate & { proposedTime: { start: string; end: string } | null; status: "review" };
export const YELP_SEARCH_MESSAGES = {
  found: "Public Yelp results were found. Available excerpts may be incomplete; confirm critical details with the venue.",
  no_results: "The targeted Yelp search returned no usable public excerpts. Other retrieved sources are still considered.",
  unavailable: "The targeted Yelp search was unavailable. Research continued with the other retrieved sources.",
} as const;
export type YelpSearchStatus = keyof typeof YELP_SEARCH_MESSAGES;
export function isYelpSource(value: string): boolean {
  if (!safeSource(value)) return false;
  const host = new URL(value).hostname.toLowerCase();
  return host === "yelp.com" || host.endsWith(".yelp.com");
}
/** Search links require no API key. Direct business links come only from cited evidence. */
export function nearbyListingLinks(candidate: Candidate, context: Pick<PlanningContext, "area" | "destinations">) {
  const knownAddress = candidate.address && candidate.address !== "Address needs confirmation from the venue";
  const location = knownAddress ? candidate.address : context.destinations.find(d => context.area.toLowerCase().includes(d.split(",")[0].trim().toLowerCase())) || context.area;
  const maps = new URL("https://www.google.com/maps/search/");
  maps.searchParams.set("api", "1"); maps.searchParams.set("query", `${candidate.name} ${knownAddress ? candidate.address : location}`.slice(0, 180));
  const yelpSource = candidate.facts.find(f => isYelpSource(f.sourceUrl) && new URL(f.sourceUrl).pathname.startsWith("/biz/"));
  const yelp = new URL("https://www.yelp.com/search");
  yelp.searchParams.set("find_desc", candidate.name.slice(0, 80)); yelp.searchParams.set("find_loc", location.slice(0, 110));
  return { maps: maps.href, yelp: yelpSource?.sourceUrl || yelp.href, yelpIsListing: !!yelpSource };
}
export function safeSource(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password && !!u.hostname; } catch { return false; }
}
/** Source allowlist comes from actual web-search tool output, never model-authored URLs. */
export function reviewCandidates(raw: unknown, context: PlanningContext, retrieved: string[], rejected: ReviewRejections = {}): NearbyResult[] {
  if (!Array.isArray(raw)) throw new Error("Research returned an invalid result.");
  const sources = new Set(retrieved.filter(safeSource));
  const seen = new Set<string>();
  const reject = (reason: keyof ReviewRejections): [] => { rejected[reason] = (rejected[reason] || 0) + 1; return []; };
  return raw.slice(0, 3).flatMap((value: unknown) => {
    if (!value || typeof value !== "object") return reject("invalid");
    const c = value as Candidate;
    if (typeof c.name !== "string" || !c.name.trim() || c.name.length > 160 || typeof c.address !== "string" || c.address.length > 500 || typeof c.reason !== "string" || c.reason.length > 1000 || !Number.isInteger(c.durationMinutes) || c.durationMinutes < 15 || c.durationMinutes > 240 || !Array.isArray(c.facts) || !Array.isArray(c.concerns) || !Array.isArray(c.conflicts) || !c.concerns.every(v => typeof v === "string" && v.length <= 500)) return reject("invalid");
    if (c.conflicts.length) return reject("conflicts");
    if (c.pricePerPersonCents !== null && (!Number.isSafeInteger(c.pricePerPersonCents) || c.pricePerPersonCents < 0)) return reject("invalid");
    const facts = c.facts.filter(f => f && typeof f.topic === "string" && f.topic.length <= 100 && typeof f.detail === "string" && f.detail.length <= 1000 && sources.has(f.sourceUrl));
    if (!facts.length) return reject("evidence");
    if (seen.has(c.name.toLowerCase()) || context.events.some(e => e.name.trim().toLowerCase() === c.name.trim().toLowerCase() || e.place.trim().toLowerCase() === c.address.trim().toLowerCase())) return reject("duplicates");
    if (c.currency !== null && (typeof c.currency !== "string" || !/^[A-Z]{3}$/.test(c.currency))) return reject("invalid");
    const usdPrice = c.currency === "USD" ? c.pricePerPersonCents : null;
    if (usdPrice !== null && ((context.remainingGroupCents !== null && usdPrice * context.travelers > context.remainingGroupCents) || context.individualRemaining.some(v => v !== null && usdPrice > v))) return reject("budget");
    seen.add(c.name.toLowerCase());
    const gap = context.gaps.find(g => minutes(g.end) - minutes(g.start) >= c.durationMinutes);
    return [{ ...c, reason: "Found during research for this trip day. Review the source excerpts and confirm suitability before scheduling.", facts, concerns: [...new Set([...c.concerns,
      "Sources were found by web research; suitability has not been independently verified.",
      "Confirm opening hours for the trip date, booking availability and the route before scheduling.",
      ...(context.diet.length ? ["Confirm every dietary restriction and cross-contact risk directly with the venue."] : []),
      ...(context.access.length || context.walkMeters !== null ? ["Accessibility and walking distance need a verified route and venue confirmation."] : []),
      ...(usdPrice === null ? ["No comparable USD price is confirmed; budget fit is unknown."] : ["Published prices are estimates and may exclude taxes, tips or group charges."]),
    ])], status: "review" as const, proposedTime: gap ? { start: gap.start, end: clock(minutes(gap.start) + c.durationMinutes) } : null }];
  });
}
