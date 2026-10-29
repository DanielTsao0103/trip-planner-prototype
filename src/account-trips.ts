import type { SupabaseClient } from "@supabase/supabase-js";
import type { Trip } from "./domain.ts";
import type { DemoAccount } from "./demo-store.ts";
import { IMAGES } from "./data.ts";

/** Only trip details belong to this slice; itinerary and group previews stay local. */
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
};
const columns =
  "tripID,created_by,owner_id,trip_name,destination,destinations,start_date,end_date,timezone,revision";

export function tripDetailsError(
  trip: Pick<Trip, "title" | "destinations" | "start" | "end" | "zone">,
): string {
  if (!trip.title.trim() || trip.title.trim().length > 90)
    return "Use a trip name between 1 and 90 characters.";
  if (
    !trip.destinations.length ||
    trip.destinations.length > 20 ||
    trip.destinations.some((p) => !p.trim() || p.trim().length > 200)
  )
    return "Add 1–20 destinations, each under 201 characters.";
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

export async function loadAccountTrips(
  client: SupabaseClient,
  accountId: string,
): Promise<TripRow[]> {
  // Paginate to avoid silently losing trips at the API's default row limit.
  const rows: TripRow[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client
      .from("trip")
      .select(columns)
      .eq("owner_id", accountId)
      .order("tripID")
      .range(offset, offset + 499);
    if (error)
      throw new Error(
        "Could not load your saved trips. Check your connection and try again.",
      );
    rows.push(...(data as TripRow[]));
    if (data.length < 500) return rows;
  }
}

export async function saveAccountTrip(
  client: SupabaseClient,
  account: DemoAccount,
  trip: Trip,
): Promise<Trip> {
  const problem = tripDetailsError(trip);
  if (problem) throw new Error(problem);
  const details = {
    trip_name: trip.title.trim(),
    destination: trip.destinations[0].trim(),
    destinations: trip.destinations.map((p) => p.trim()),
    start_date: trip.start,
    end_date: trip.end,
    timezone: trip.zone,
  };
  if (trip.persistence === "account") {
    const { data, error } = await client
      .from("trip")
      .update(details)
      .eq("tripID", trip.id)
      .eq("owner_id", account.id)
      .eq("revision", trip.revision!)
      .select(columns)
      .maybeSingle();
    if (error)
      throw new Error(
        "Could not save your trip. Your input is still here; please try again.",
      );
    if (!data)
      throw new Error(
        "This trip changed or was deleted elsewhere. Reload before editing it again.",
      );
    return tripFromRow(data as TripRow, account, trip);
  }
  // Keep the same UUID across retries. An interrupted response must not create two trips.
  const { error } = await client
    .from("trip")
    .upsert(
      {
        ...details,
        tripID: trip.id,
        created_by: account.id,
        owner_id: account.id,
      },
      { onConflict: "tripID", ignoreDuplicates: true },
    );
  if (error)
    throw new Error(
      "Could not save your trip. Your input is still here; please try again.",
    );
  const { data, error: readError } = await client
    .from("trip")
    .select(columns)
    .eq("tripID", trip.id)
    .eq("owner_id", account.id)
    .single();
  if (readError)
    throw new Error(
      "Could not confirm the save. Try again to check this trip without creating a duplicate.",
    );
  const saved = data as TripRow;
  if (
    Object.entries(details).some(
      ([key, value]) =>
        JSON.stringify(saved[key as keyof TripRow]) !== JSON.stringify(value),
    )
  ) {
    throw new Error(
      "This trip was saved with earlier details. Reload to open it and make your changes.",
    );
  }
  return tripFromRow(saved, account, trip);
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
