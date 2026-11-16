import { eventOccursOn, eventInterval, eventTimestamp, type Event } from "./domain.ts";

export type PlanningWindow = { start: string; end: string };
export const timeMinutes = (value: string): number => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
export const planningTime = (value: number): string => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;

/** Unscheduled daytime intervals; these do not account for travel or venue hours. */
export function planningWindows(events: Pick<Event, "id" | "date" | "endDate" | "start" | "end">[], date: string, excludeId?: string): PlanningWindow[] {
  const busy = events.filter(event => eventOccursOn(event, date) && event.id !== excludeId)
    .map(event => ({ start: Math.max(540, eventInterval(event).start - eventTimestamp(date, "00:00")), end: Math.min(1080, eventInterval(event).end - eventTimestamp(date, "00:00")) }))
    .filter(event => event.end > event.start).sort((a, b) => a.start - b.start);
  const windows: PlanningWindow[] = [];
  let cursor = 540;
  // Advancing the cursor merges overlapping and nested events before finding gaps.
  for (const event of busy) {
    if (event.start > cursor) windows.push({ start: planningTime(cursor), end: planningTime(event.start) });
    cursor = Math.max(cursor, event.end);
  }
  if (cursor < 1080) windows.push({ start: planningTime(cursor), end: "18:00" });
  return windows;
}
