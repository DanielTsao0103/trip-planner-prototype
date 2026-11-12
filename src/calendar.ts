import { canEdit, EVENT_PERMISSION_MESSAGE, eventError, type Event, type Trip } from './domain.ts';

export function addCalendarDays(date: string, amount: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}
export const minutes = (time: string) => {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
};
export const clock = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

/** Preserve identity, duration, attendees, notes and costs when rescheduling. */
export function rescheduleEvent(trip: Trip, user: string | null, eventId: string, date: string, start: string): { event?: Event; error: string } {
  const original = trip.events.find(event => event.id === eventId);
  if (!original) return { error: 'This event no longer exists. Reload the trip.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) ||
      new Date(`${date}T12:00:00Z`).toISOString().slice(0,10) !== date || !/^([01]\d|2[0-3]):[0-5]\d$/.test(start))
    return { error: 'Choose a valid date and start time.' };
  const duration = minutes(original.end) - minutes(original.start);
  const end = minutes(start) + duration;
  if (duration <= 0 || end >= 1440) return { error: 'This move would end after the last time slot. Choose an earlier start time.' };
  const event = { ...original, date, start, end: clock(end) };
  const error = eventError(trip, user, event, original);
  if (error === EVENT_PERMISSION_MESSAGE && canEdit(trip, user, original.date) && !canEdit(trip, user, date))
    return { error: 'You do not have permission to move events to this day. Choose one of your assigned days.' };
  return error ? { error } : { event, error: '' };
}

/** Assign simultaneous visible cards separate lanes without changing event times.
 * Minimum display duration accounts for short cards' readable minimum height.
 */
export function calendarLanes(events: Pick<Event, 'id' | 'start' | 'end'>[], minimumDisplayMinutes = 40): Map<string, {column: number; columns: number}> {
  const result = new Map<string, {column: number; columns: number}>();
  let group: {id: string; column: number}[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -1;
  const finish = () => {
    for (const item of group) result.set(item.id, {column: item.column, columns: laneEnds.length});
    group = []; laneEnds = []; groupEnd = -1;
  };
  const sorted = [...events].sort((a,b) => minutes(a.start)-minutes(b.start) || minutes(b.end)-minutes(a.end) || a.id.localeCompare(b.id));
  for (const event of sorted) {
    const start=minutes(event.start), end=Math.max(minutes(event.end), start+minimumDisplayMinutes);
    if (start >= groupEnd) finish();
    let column=laneEnds.findIndex(lastEnd=>lastEnd<=start);
    if (column<0) column=laneEnds.length;
    laneEnds[column]=end; group.push({id:event.id,column}); groupEnd=Math.max(groupEnd,end);
  }
  finish();
  return result;
}
