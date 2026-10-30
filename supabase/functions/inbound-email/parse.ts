/**
 * Pulls booking details out of a forwarded confirmation email.
 * Pure functions with no dependencies, shared by the Edge Function and the unit tests.
 * Anything it cannot find with confidence stays null instead of being guessed.
 */

export type BookingKind = "flight" | "lodging" | "rental_car" | "train" | "restaurant" | "event" | "other";

export type ParsedBooking = {
  kind: BookingKind;
  title: string;
  startDate: string | null; // YYYY-MM-DD
  endDate: string | null;
  location: string | null;
  confirmationCode: string | null;
  originalSender: string | null;
  source: "structured" | "text" | "subject";
};

export type EmailInput = { subject: string; text: string | null; html: string | null };

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const monthNumber = (name: string): number => MONTHS[name.slice(0, 3).toLowerCase()] ?? 0;

const MONTH_NAMES =
  "(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const RE_MDY = new RegExp(`\\b${MONTH_NAMES}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(20\\d{2})\\b`, "gi");
const RE_DMY = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_NAMES}\\.?,?\\s+(20\\d{2})\\b`, "gi");
const RE_ISO = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g;
const RE_SLASH = /\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/g;

type FoundDate = { index: number; end: number; iso: string };
type Window = { minYear: number; maxYear: number };

/** Build YYYY-MM-DD only for a real calendar day inside the allowed years. */
function isoDate(year: number, month: number, day: number, win: Window): string | null {
  if (year < win.minYear || year > win.maxYear) return null;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Dates in a line, in reading order. Dates without a year are skipped on purpose (too easy to get wrong). */
function findDates(line: string, win: Window): FoundDate[] {
  const out: FoundDate[] = [];
  const add = (m: RegExpMatchArray, iso: string | null) => {
    if (iso) out.push({ index: m.index ?? 0, end: (m.index ?? 0) + m[0].length, iso });
  };
  for (const m of line.matchAll(RE_MDY)) add(m, isoDate(+m[3], monthNumber(m[1]), +m[2], win));
  for (const m of line.matchAll(RE_DMY)) add(m, isoDate(+m[3], monthNumber(m[2]), +m[1], win));
  for (const m of line.matchAll(RE_ISO)) add(m, isoDate(+m[1], +m[2], +m[3], win));
  for (const m of line.matchAll(RE_SLASH)) {
    // Month first (US style), unless the first number cannot be a month.
    const a = +m[1], b = +m[2];
    add(m, a > 12 ? isoDate(+m[3], b, a, win) : isoDate(+m[3], a, b, win));
  }
  return out.sort((x, y) => x.index - y.index);
}

const START_LABEL = /\b(check[- ]?in|arriv\w*|depart\w*|pick[- ]?up|starts?|begins?|travel date|event date|date of (?:stay|travel))\b/gi;
const END_LABEL = /\b(check[- ]?out|return\w*|drop[- ]?off|ends?|until)\b/gi;

function lastLabelIndex(re: RegExp, text: string): number {
  let last = -1;
  for (const m of text.matchAll(new RegExp(re.source, "gi"))) last = m.index ?? last;
  return last;
}

/** Dates that sit right after a label such as "Check-in:" or "Return:". */
function labelledDates(lines: string[], win: Window): { start: string | null; end: string | null } {
  let start: string | null = null;
  let end: string | null = null;
  for (const line of lines) {
    let previousEnd = 0;
    for (const found of findDates(line, win)) {
      const before = line.slice(previousEnd, found.index);
      previousEnd = found.end;
      const s = lastLabelIndex(START_LABEL, before);
      const e = lastLabelIndex(END_LABEL, before);
      if (e >= 0 && e > s) end ??= found.iso;
      else if (s >= 0) start ??= found.iso;
    }
  }
  return { start, end };
}

const HEADER_LINE = /^\s*(from|date|sent|to|cc|bcc|subject|reply-to)\s*:\s*(.*)$/i;
const FORWARD_MARKER =
  /^\s*(?:-{2,}\s*(?:forwarded message|original message)\s*-{2,}|begin forwarded message:?|_{5,})\s*$/i;
const REPLY_INTRO = /^\s*On .{5,140} wrote:\s*$/i;

type Split = { lines: string[]; originalFrom: string | null; originalSubject: string | null };

/** Separate the forwarded header (its date is when the email was sent, not the booking) from the body. */
function splitForwarded(text: string): Split {
  const lines: string[] = [];
  let originalFrom: string | null = null;
  let originalSubject: string | null = null;
  let inHeader = false;
  let headerSeen = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^[>\s]+(?=\S)/, (prefix) => (prefix.includes(">") ? "" : prefix));
    if (FORWARD_MARKER.test(raw)) {
      inHeader = true;
      headerSeen = 0;
      continue;
    }
    if (inHeader) {
      const header = HEADER_LINE.exec(line);
      if (header) {
        headerSeen++;
        const name = header[1].toLowerCase();
        if (name === "from" && !originalFrom) originalFrom = header[2].trim() || null;
        if (name === "subject" && !originalSubject) originalSubject = header[2].trim() || null;
        continue;
      }
      if (line.trim() === "") {
        if (headerSeen > 0) inHeader = false;
        continue;
      }
      inHeader = false;
    }
    if (raw.trimStart().startsWith(">") || REPLY_INTRO.test(raw)) continue;
    lines.push(line);
  }
  return { lines, originalFrom, originalSubject };
}

const CODE_LABEL =
  /\b(?:confirmation|reservation|booking|itinerary|reference|record\s+locator|order)\s*(?:number|no\.?|code|#|id|ref)?\s*(?:is)?\s*[:#-]?/gi;
const CODE_STOPWORDS = new Set([
  "CONFIRMATION", "RESERVATION", "BOOKING", "DETAILS", "NUMBER", "ITINERARY", "FLIGHT", "HOTEL", "RECEIPT",
  "ORDER", "TRAVEL", "CHECK", "THANK", "THANKS", "EMAIL", "UPDATE", "STATUS", "GUEST", "TICKET", "TICKETS",
]);

/** The code after a label like "Confirmation number:", on the same line or the next one. */
function findConfirmationCode(text: string): string | null {
  for (const label of text.matchAll(CODE_LABEL)) {
    const after = text.slice((label.index ?? 0) + label[0].length, (label.index ?? 0) + label[0].length + 60);
    for (const token of after.matchAll(/(?<![A-Za-z0-9-])[A-Z0-9][A-Z0-9-]{4,19}(?![A-Za-z0-9-])/g)) {
      const word = token[0];
      if (CODE_STOPWORDS.has(word)) continue;
      if (/\d/.test(word) || /^[A-Z]{5,8}$/.test(word)) return word;
    }
  }
  return null;
}

const KIND_WORDS: [Exclude<BookingKind, "other">, RegExp][] = [
  ["flight", /\b(flights?|boarding pass|airlines?|departs?|departure|gate|terminal)\b/gi],
  ["lodging", /\b(hotel|check[- ]?in|check[- ]?out|airbnb|vrbo|resort|lodging|nights?|room)\b/gi],
  ["rental_car", /\b(rental car|car rental|hertz|avis|enterprise|turo|vehicle|pick[- ]?up location)\b/gi],
  ["train", /\b(train|amtrak|railway|rail)\b/gi],
  ["restaurant", /\b(table for|party of|opentable|resy|restaurant|dinner|brunch)\b/gi],
  ["event", /\b(tickets?|admission|concert|venue|showtime)\b/gi],
];

function detectKind(subject: string, body: string): BookingKind {
  let best: BookingKind = "other";
  let bestScore = 1;
  for (const [kind, words] of KIND_WORDS) {
    const score = (body.match(words)?.length ?? 0) + 2 * (subject.match(words)?.length ?? 0);
    if (score > bestScore) {
      best = kind;
      bestScore = score;
    }
  }
  return best;
}

const LOCATION_LINE = /^\s*(?:address|location|where|venue|property|pick[- ]?up location)\s*[:-]\s*(\S.{2,199})\s*$/i;

function clip(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanTitle(subject: string): string {
  return clip(subject.replace(/^(?:\s*(?:fwd?|fw|re)\s*:\s*)+/i, ""), 200);
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|table)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** The address part of a "Name <address>" sender, lowercased, or null if there is none. */
export function senderEmail(from: string): string | null {
  const bracket = /<([^<>\s]+@[^<>\s]+)>/.exec(from);
  const bare = /[^\s<>"',;]+@[^\s<>"',;]+/.exec(from);
  const address = (bracket?.[1] ?? bare?.[0] ?? "").toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address) && address.length <= 320 ? address : null;
}

// ---- Structured data (schema.org reservations that airlines and hotels embed in their emails) ----

type Json = Record<string, unknown>;
const obj = (value: unknown): Json => (value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : {});
const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

function collectReservations(node: unknown, out: Json[]): void {
  if (Array.isArray(node)) {
    node.forEach((item) => collectReservations(item, out));
    return;
  }
  const o = obj(node);
  if (Array.isArray(o["@graph"])) collectReservations(o["@graph"], out);
  const types = ([] as unknown[]).concat(o["@type"] ?? []).map(String);
  if (types.some((t) => /Reservation$/.test(t))) out.push(o);
}

function reservationDate(value: unknown, win: Window): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(value));
  return m ? isoDate(+m[1], +m[2], +m[3], win) : null;
}

function addressText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  const a = obj(value);
  return [str(a.streetAddress), str(a.addressLocality), str(a.addressRegion)].filter(Boolean).join(", ");
}

const STRUCTURED_KIND: [RegExp, BookingKind][] = [
  [/Flight/, "flight"], [/Lodging/, "lodging"], [/RentalCar/, "rental_car"],
  [/Train|Bus/, "train"], [/FoodEstablishment/, "restaurant"], [/Event/, "event"],
];

function structured(html: string | null, win: Window): Partial<ParsedBooking> | null {
  if (!html) return null;
  const reservations: Json[] = [];
  for (const block of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      collectReservations(JSON.parse(block[1]), reservations);
    } catch {
      // Not valid JSON: ignore this block.
    }
  }
  if (reservations.length === 0) return null;
  const first = reservations[0];
  const rf = obj(first.reservationFor);
  const type = ([] as unknown[]).concat(first["@type"] ?? []).map(String).join(" ");
  const kind = STRUCTURED_KIND.find(([re]) => re.test(type))?.[1] ?? "other";
  const flightName = [str(obj(rf.airline).name), str(rf.flightNumber)].filter(Boolean).join(" ");
  const route = [str(obj(rf.departureAirport).iataCode), str(obj(rf.arrivalAirport).iataCode)];
  const starts: string[] = [];
  const ends: string[] = [];
  for (const r of reservations) {
    const f = obj(r.reservationFor);
    const s = reservationDate(r.checkinTime ?? r.startTime ?? r.pickupTime ?? f.startDate ?? f.departureTime ?? r.startDate, win);
    const e = reservationDate(r.checkoutTime ?? r.endTime ?? r.dropoffTime ?? f.endDate ?? f.arrivalTime ?? r.endDate, win);
    if (s) starts.push(s);
    if (e) ends.push(e);
  }
  starts.sort();
  ends.sort();
  return {
    kind,
    title: clip(str(rf.name) || str(first.name) || flightName, 200) || undefined,
    confirmationCode: clip(str(first.reservationNumber) || str(first.reservationId), 64) || null,
    startDate: starts[0] ?? null,
    endDate: ends[ends.length - 1] ?? null,
    location:
      clip(addressText(rf.address) || addressText(obj(rf.location).address) || str(obj(rf.location).name) ||
        (route[0] && route[1] ? `${route[0]} to ${route[1]}` : ""), 300) || null,
  };
}

// ---- Putting it together ----

export function parseBooking(input: EmailInput, now: Date = new Date()): ParsedBooking {
  const win: Window = { minYear: now.getUTCFullYear() - 1, maxYear: now.getUTCFullYear() + 3 };
  const rawText = input.text ?? (input.html ? htmlToText(input.html) : "");
  const { lines, originalFrom, originalSubject } = splitForwarded(rawText.slice(0, 60000));
  const body = lines.join("\n");
  const title = cleanTitle(originalSubject || input.subject) || "Forwarded booking";

  // Dates: next to a label first; otherwise only when the email mentions one or two dates in total.
  let { start, end } = labelledDates(lines, win);
  if (!start && !end) {
    const all = [...new Set(lines.flatMap((line) => findDates(line, win).map((d) => d.iso)))].sort();
    if (all.length === 1) start = all[0];
    else if (all.length === 2) [start, end] = all;
  }
  if (start && end && end < start) [start, end] = [end, start];

  const fromText = {
    kind: detectKind(input.subject, body.slice(0, 5000)),
    startDate: start,
    endDate: end,
    location: clip(lines.map((l) => LOCATION_LINE.exec(l)?.[1] ?? "").find(Boolean) ?? "", 300) || null,
    confirmationCode: findConfirmationCode(`${body}\n${input.subject}`),
  };
  const fromData = structured(input.html, win);

  const merged: ParsedBooking = {
    kind: fromData?.kind && fromData.kind !== "other" ? fromData.kind : fromText.kind,
    title: fromData?.title || title,
    startDate: fromData?.startDate ?? fromText.startDate,
    endDate: fromData?.endDate ?? fromText.endDate,
    location: fromData?.location ?? fromText.location,
    confirmationCode: fromData?.confirmationCode ?? fromText.confirmationCode,
    originalSender: originalFrom ? clip(originalFrom, 200) : null,
    source: fromData ? "structured" : "subject",
  };
  if (!fromData && (merged.startDate || merged.endDate || merged.location || merged.confirmationCode)) {
    merged.source = "text";
  }
  if (merged.startDate && merged.endDate && merged.endDate < merged.startDate) merged.endDate = null;
  return merged;
}
