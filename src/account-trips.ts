import { TEXT_LIMITS, MAX_DESTINATIONS, textError } from "./limits.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Trip } from "./domain.ts";
import type { DemoAccount } from "./demo-store.ts";
import { IMAGES } from "./data.ts";

/** Database trip root plus its normalized planning records. */
export type TripRow = {
  tripID: string;
  created_by: string;
  owner_id: string;
  trip_name: string;
  destination: string;
  destinations: string[];
  start_date: string;
  end_date: string;
  timezone: string;
  revision: number;
  content_version?: number;
  photoCredit?: { source: "unsplash" | "upload"; photographer_name: string | null; photographer_profile_url: string | null; photo_url: string | null };
  content?: Pick<
    Trip,
    | "image"
    | "members"
    | "events"
    | "prefs"
    | "expenses"
    | "budget"
    | "budgetMode"
    | "individual"
    | "todos"
    | "dismissed"
  >;
};

export function tripDetailsError(
  trip: Pick<Trip, "title" | "destinations" | "start" | "end" | "zone">,
): string {
  const titleProblem = textError(
    trip.title,
    "Trip title",
    TEXT_LIMITS.title,
    true,
  );
  if (titleProblem) return titleProblem;
  if (
    !trip.destinations.length ||
    trip.destinations.length > MAX_DESTINATIONS ||
    trip.destinations.some((place) =>
      textError(place, "Destination", TEXT_LIMITS.destination, true),
    )
  )
    return `Add 1–${MAX_DESTINATIONS} destinations, each ${TEXT_LIMITS.destination} characters or fewer.`;
  const validDate = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
  if (!validDate(trip.start) || !validDate(trip.end))
    return "Choose valid start and end dates.";
  const duration = (Date.parse(trip.end) - Date.parse(trip.start)) / 86400000;
  if (duration < 0 || duration > 364)
    return "Choose an end date on or after the start, within 365 days.";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trip.zone });
  } catch {
    return "Choose a valid trip time zone.";
  }
  return "";
}

export function tripFromRow(
  row: TripRow,
  account: DemoAccount,
  local?: Trip,
): Trip {
  // Once migrated, PostgreSQL is authoritative; browser state is only recovery data.
  if (row.content_version === 1 && row.content) {
    return {
      ...row.content,
      id: row.tripID,
      title: row.trip_name,
      destinations: row.destinations,
      start: row.start_date,
      end: row.end_date,
      zone: row.timezone,
      persistence: "account",
      revision: row.revision,
      contentVersion: 1,
      imageSource: row.photoCredit?.source,
      imageCredit: row.photoCredit?.source === "unsplash" ? {
        name: row.photoCredit.photographer_name!,
        profileUrl: row.photoCredit.photographer_profile_url!,
        photoUrl: row.photoCredit.photo_url!,
      } : undefined,
    };
  }
  if (local) local = migrateLegacyDetails(local, account.id);
  // Never derive authorization from cached participants; the database owns identity.
  return {
    id: row.tripID,
    title: row.trip_name,
    destinations: row.destinations ?? [row.destination],
    start: row.start_date,
    end: row.end_date,
    zone: row.timezone,
    image: local?.image ?? IMAGES.coast,
    persistence: "account",
    revision: row.revision,
    contentVersion: 0,
    members: [
      { ...account, role: "Owner", days: [], status: "accepted" },
      ...(local?.members.filter((m) => m.id !== account.id) ?? []),
    ],
    events: local?.events ?? [],
    prefs: local?.prefs ?? {},
    expenses: local?.expenses ?? [],
    budget: local?.budget ?? null,
    budgetMode: local?.budgetMode ?? "group",
    individual: local?.individual ?? {},
    todos: local?.todos ?? [],
    dismissed: local?.dismissed ?? [],
  };
}

/** Replace fixture-only identifiers without dropping their plans or allocations.
 * These are guest planner IDs, never links to another authenticated account. */
function migrateLegacyDetails(source: Trip, ownerId: string): Trip {
  const trip = structuredClone(source);
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ids = new Map<string, string>([[ownerId, ownerId]]);
  const mapId = (id: string): string => {
    if (!ids.has(id)) ids.set(id, uuid.test(id) ? id : crypto.randomUUID());
    return ids.get(id)!;
  };
  // Older removal controls could leave expense shares without a participant row.
  const references = new Set([
    ...trip.events.flatMap((e) => e.attendees),
    ...trip.expenses.flatMap((e) => [
      e.payer,
      ...Object.keys(e.shares),
      ...e.settled,
    ]),
    ...Object.keys(trip.prefs),
    ...Object.keys(trip.individual),
  ]);
  for (const id of references) {
    if (id !== ownerId && !trip.members.some((m) => m.id === id))
      trip.members.push({
        id,
        name: "Former traveler",
        email: `${mapId(id)}@former-traveler.invalid`,
        role: "Viewer",
        days: [],
        status: "removed",
      });
  }
  trip.members = trip.members.map((m) => ({
    ...m,
    id: mapId(m.id),
    role: m.id !== ownerId && m.role === "Owner" ? "Viewer" : m.role,
  }));
  trip.events = trip.events.map((e) => ({
    ...e,
    id: uuid.test(e.id) ? e.id : crypto.randomUUID(),
    attendees: e.attendees.map(mapId),
  }));
  const keys = <T>(values: Record<string, T>): Record<string, T> =>
    Object.fromEntries(
      Object.entries(values).map(([id, value]) => [mapId(id), value]),
    );
  trip.expenses = trip.expenses.map((e) => ({
    ...e,
    payer: mapId(e.payer),
    shares: keys(e.shares),
    settled: e.settled.map(mapId),
  }));
  trip.prefs = keys(trip.prefs);
  trip.individual = keys(trip.individual);
  return trip;
}

export async function loadAccountTrips(
  client: SupabaseClient,
  accountId: string,
): Promise<TripRow[]> {
  // Paginate to avoid silently losing trips at the API's default row limit.
  const rows: TripRow[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.rpc("load_trip_bundles", {
      p_offset: offset,
      p_limit: 500,
    });
    if (error)
      throw new Error(
        "Could not load your saved trips. Check your connection and try again.",
      );
    rows.push(...(data as TripRow[]));
    if (data.length < 500) break;
  }
  if (rows.length) {
    const { data, error } = await client.from("trip_photo_credit")
      .select("trip_id,source,photographer_name,photographer_profile_url,photo_url")
      .eq("owner_id", accountId).in("trip_id", rows.map((row) => row.tripID));
    if (error) throw new Error("Could not load trip photo credits. Apply the trip photo migration.");
    const credits = new Map((data ?? []).map((credit) => [credit.trip_id, credit]));
    rows.forEach((row) => { row.photoCredit = credits.get(row.tripID) as TripRow["photoCredit"]; });
  }
  return rows;
}

export async function saveAccountTrip(
  client: SupabaseClient,
  account: DemoAccount,
  trip: Trip,
): Promise<Trip> {
  const problem = tripDetailsError(trip);
  if (problem) throw new Error(problem);
  // Send the complete trip in one transaction; the server normalizes each entity.
  const { persistence, revision, contentVersion, sample, imageSource, imageCredit, ...content } = trip;
  const { data, error, status } = await client.rpc("save_trip_bundle", {
    p_trip_id: trip.id,
    p_expected_revision: trip.revision ?? null,
    p_request_id: crypto.randomUUID(),
    p_data: content,
  });
  if (error) {
    if (error.code === "PT409") throw new Error(error.message);
    if (error.code === "P0001") throw new Error(error.message);
    throw Object.assign(
      new Error(
        "Could not save trip changes. Your unsaved copy is kept here; please retry.",
      ),
      { retryOriginal: status === 0 || status >= 500 },
    );
  }
  if ((data as TripRow).content?.image !== trip.image)
    throw new Error("The trip photo was not confirmed by Supabase. Please retry.");
  if (imageSource) {
    const { error: creditError } = await client.from("trip_photo_credit").upsert({
      trip_id: trip.id,
      owner_id: account.id,
      source: imageSource,
      photographer_name: imageCredit?.name ?? null,
      photographer_profile_url: imageCredit?.profileUrl ?? null,
      photo_url: imageCredit?.photoUrl ?? null,
    }, { onConflict: "trip_id" });
    if (creditError) throw new Error("Trip saved, but its photo credit could not be saved. Please retry.");
  }
  return tripFromRow({ ...(data as TripRow), photoCredit: imageSource ? {
    source: imageSource,
    photographer_name: imageCredit?.name ?? null,
    photographer_profile_url: imageCredit?.profileUrl ?? null,
    photo_url: imageCredit?.photoUrl ?? null,
  } : undefined }, account);
}

export async function deleteAccountTrip(
  client: SupabaseClient,
  accountId: string,
  trip: Trip,
): Promise<void> {
  const { data, error } = await client
    .from("trip")
    .delete()
    .eq("tripID", trip.id)
    .eq("owner_id", accountId)
    .eq("revision", trip.revision!)
    .select("tripID");
  if (error) throw new Error("Could not delete the trip. Please try again.");
  if (!data?.length)
    throw new Error(
      "This trip changed or was deleted elsewhere. Reload before trying again.",
    );
}
