import type {
  Event,
  Expense,
  MapPoint,
  Member,
  Preference,
  Trip,
} from "./domain.ts";
import type { PendingTrip } from "./trip-save-queue.ts";

export type Recovery = Pick<PendingTrip, "draft" | "retryDraft">;
type Check = (value: unknown) => boolean;
/** Every domain key, including optional fields, needs a deliberate parser rule. */
type Schema<T> = { [Key in keyof T]-?: Check };
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text: Check = (value) => typeof value === "string";
const id: Check = (value) => typeof value === "string" && value.length > 0;
const bool: Check = (value) => typeof value === "boolean";
const integer: Check = (value) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const optional =
  (check: Check): Check =>
  (value) =>
    value === undefined || check(value);
const nullable =
  (check: Check): Check =>
  (value) =>
    value === null || check(value);
const list =
  (check: Check): Check =>
  (value) =>
    Array.isArray(value) && value.every(check);
const oneOf =
  (...values: unknown[]): Check =>
  (value) =>
    values.includes(value);
const date: Check = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
const time: Check = (value) =>
  typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
const record =
  (check: Check): Check =>
  (value) =>
    object(value) &&
    Object.entries(value).every(
      ([key, entry]) =>
        !["__proto__", "constructor", "prototype"].includes(key) &&
        check(entry),
    );
const shape =
  <T>(schema: Schema<T>): Check =>
  (value) =>
    object(value) &&
    Object.keys(value).every((key) => Object.hasOwn(schema, key)) &&
    Object.entries<Check>(schema).every(([key, check]) => check(value[key]));

const point = shape({
  lat: (value) =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= -90 &&
    value <= 90,
  lng: (value) =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= -180 &&
    value <= 180,
} satisfies Schema<MapPoint>);
const member = shape({
  signupPending: optional(bool),
  accountId: optional(nullable(id)),
  id,
  name: text,
  email: text,
  role: oneOf("Owner", "Editor", "Viewer", "Day Editor"),
  days: list(date),
  status: oneOf("accepted", "pending", "removed"),
} satisfies Schema<Member>);
const event = shape({
  id,
  name: text,
  date,
  start: time,
  end: time,
  cost: integer,
  attendees: list(id),
  image: text,
  notes: text,
  place: text,
  point: optional(nullable(point)),
  googlePlaceId: optional(nullable(text)),
} satisfies Schema<Event>);
const expense = shape({
  id,
  purpose: text,
  amount: integer,
  category: text,
  payer: id,
  shares: record(integer),
  date,
  source: text,
  settled: list(id),
} satisfies Schema<Expense>);
const preference = shape({
  diet: list(text),
  food: text,
  spending: text,
  dining: text,
  atmosphere: text,
  access: list(text),
  walk: integer,
  interests: list(text),
  destinations: text,
  tickets: text,
  notes: text,
} satisfies Schema<Preference>);
const tripShape = shape({
  persistence: optional(oneOf("account")),
  revision: optional(integer),
  contentVersion: optional(integer),
  id,
  title: text,
  destinations: list(text),
  destinationTimezones: optional(list(nullable(text))),
  start: date,
  end: date,
  zone: text,
  image: text,
  imageCredit: optional(
    shape({ name: text, profileUrl: text, photoUrl: text } satisfies Schema<
      NonNullable<Trip["imageCredit"]>
    >),
  ),
  imageSource: optional(oneOf("unsplash", "upload")),
  sample: optional(bool),
  members: list(member),
  events: list(event),
  prefs: record(preference),
  expenses: list(expense),
  budget: nullable(integer),
  budgetMode: oneOf("group", "individual"),
  individual: record(integer),
  todos: list(
    shape({ id, text, date, done: bool } satisfies Schema<
      Trip["todos"][number]
    >),
  ),
  dismissed: list(text),
} satisfies Schema<Trip>);

/** Validate untrusted browser data structurally, without silently repairing it.
 * Business validation remains in the save path; corrupted records are preserved
 * for export, but never injected into React state or sent to a different trip. */
export function validRecoveryTrip(
  value: unknown,
  accountId: string,
): value is Trip {
  if (!tripShape(value)) return false;
  const trip = value as Trip;
  return (
    trip.sample !== true &&
    trip.members.some(
      (member) =>
        member.status === "accepted" &&
        (member.role === "Owner"
          ? member.id === accountId
          : member.accountId === accountId),
    )
  );
}

export function parseRecovery(
  value: unknown,
  accountId: string,
): Recovery | null {
  if (!object(value)) return null;
  const draft = "draft" in value ? value.draft : value;
  if (!validRecoveryTrip(draft, accountId)) return null;
  const retry = "draft" in value ? value.retryDraft : undefined;
  if (
    retry !== undefined &&
    (!object(retry) ||
      !integer(retry.generation) ||
      !validRecoveryTrip(retry.draft, accountId) ||
      retry.draft.id !== draft.id)
  )
    return null;
  return {
    draft,
    ...(retry ? { retryDraft: retry as Recovery["retryDraft"] } : {}),
  };
}
