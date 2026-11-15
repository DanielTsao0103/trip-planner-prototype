import type { Trip } from "./domain.ts";
import { tripClock } from "./today-guide.ts";

/** Account trips use their own local date; the sample keeps its demo clock. */
export const localTripDate = (trip: Trip, sampleDate: string, now = new Date()): string => trip.persistence === "account" ? tripClock(now, trip.zone).date : sampleDate;
export function tripPhase(trip: Trip, sampleDate: string, now = new Date()): "Active" | "Upcoming" | "Past" {
  const date = localTripDate(trip, sampleDate, now);
  return trip.end < date ? "Past" : trip.start > date ? "Upcoming" : "Active";
}
/** Active trips, nearest upcoming departure, then most recently completed. */
export function compareTrips(a: Trip, b: Trip, sampleDate: string, now = new Date()): number {
  const ranks = { Active: 0, Upcoming: 1, Past: 2 };
  const aPhase = tripPhase(a, sampleDate, now), bPhase = tripPhase(b, sampleDate, now);
  return ranks[aPhase] - ranks[bPhase] || (aPhase === "Past" ? b.end.localeCompare(a.end) : a.start.localeCompare(b.start)) || a.title.localeCompare(b.title);
}
