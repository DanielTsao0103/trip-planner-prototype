import { canEdit, eventInterval, eventTimestamp, type Trip } from "./domain.ts";

/** Find a free planning hour on the supplied editable dates, in preference order. */
export function findAvailableHour(trip: Trip, userId: string | null, dates: string[], excludeId?: string, notBefore?: { date: string; time: string }): {date: string; start: string; end: string} | undefined {
  for (const date of dates) {
    if (!canEdit(trip, userId, date)) continue;
    if (notBefore && date < notBefore.date) continue;
    for (let hour = 9; hour < 18; hour++) {
      const start = `${String(hour).padStart(2, "0")}:00`;
      const end = `${String(hour + 1).padStart(2, "0")}:00`;
      if (notBefore && date === notBefore.date && start < notBefore.time) continue;
      if (!trip.events.some(event => event.id !== excludeId && eventTimestamp(date,start) < eventInterval(event).end && eventTimestamp(date,end) > eventInterval(event).start)) return {date, start, end};
    }
  }
}
