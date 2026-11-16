import type { PlanningContext } from '../supabase/functions/_shared/nearby.ts';
import { itineraryInstant, tripClock } from './today-guide.ts';

type PeriodTime = { day?: unknown; hour?: unknown; minute?: unknown };
export type RegularPeriod = { open?: PeriodTime; close?: PeriodTime };
const addDay = (date: string, amount: number) => new Date(Date.parse(`${date}T12:00:00Z`) + amount * 86400000).toISOString().slice(0, 10);
const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
const minute = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
function periodTime(value: PeriodTime | undefined) {
  if (!value || !Number.isInteger(value.day) || Number(value.day) < 0 || Number(value.day) > 6 || !Number.isInteger(value.hour) || Number(value.hour) < 0 || Number(value.hour) > 23 || (value.minute !== undefined && (!Number.isInteger(value.minute) || Number(value.minute) < 0 || Number(value.minute) > 59))) return null;
  return { day: Number(value.day), minute: Number(value.hour) * 60 + Number(value.minute || 0) };
}

/** Convert published weekly periods to the trip's clock, retaining midnight and overnight coverage. */
export function regularOpeningWindows(periods: unknown, venueZone: unknown, context: Pick<PlanningContext, 'date' | 'zone'>): { start: string; end: string }[] | undefined {
  if (!Array.isArray(periods) || !periods.length || periods.length > 30) return undefined;
  const parsed = periods.map((value: RegularPeriod) => ({ open: periodTime(value?.open), close: periodTime(value?.close), missingClose: value?.close === undefined }));
  if (parsed.some(value => !value.open || (!value.close && !value.missingClose))) return undefined;
  if (parsed.some(value => value.missingClose && value.open?.day === 0 && value.open.minute === 0)) return [{ start: '00:00', end: '24:00' }];
  if (parsed.some(value => value.missingClose || (value.open!.day === value.close!.day && value.close!.minute <= value.open!.minute))) return undefined;
  if (typeof venueZone !== 'string') return undefined;
  try { new Intl.DateTimeFormat('en', { timeZone: venueZone }).format(); } catch { return undefined; }
  const nextTripDay = addDay(context.date, 1);
  const tripStart = itineraryInstant(context.date, '00:00', context.zone).getTime();
  const tripEnd = itineraryInstant(nextTripDay, '00:00', context.zone).getTime();
  const venueDate = tripClock(new Date(tripStart), venueZone).date;
  const ranges: { start: number; end: number }[] = [];
  for (let offset = -7; offset <= 2; offset++) {
    const date = addDay(venueDate, offset), weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    for (const period of parsed) {
      const open = period.open!, close = period.close!;
      if (open.day !== weekday) continue;
      const dayDelta = (close.day - open.day + 7) % 7;
      const start = itineraryInstant(date, clock(open.minute), venueZone).getTime();
      const end = itineraryInstant(addDay(date, dayDelta), clock(close.minute), venueZone).getTime();
      const clippedStart = Math.max(start, tripStart), clippedEnd = Math.min(end, tripEnd);
      if (clippedEnd <= clippedStart) continue;
      const localStart = clippedStart === tripStart ? 0 : minute(tripClock(new Date(clippedStart), context.zone).time);
      const localEnd = clippedEnd === tripEnd ? 1440 : minute(tripClock(new Date(clippedEnd), context.zone).time);
      if (localEnd > localStart) ranges.push({ start: localStart, end: localEnd });
    }
  }
  const merged: { start: number; end: number }[] = [];
  for (const range of ranges.sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged.map(range => ({ start: clock(range.start), end: clock(range.end) }));
}

export function relevantOpeningHours(hours: string[], zone: string | undefined, context: Pick<PlanningContext, 'date' | 'zone'>, proposed?: {start: string} | null): string | undefined {
  let date = context.date;
  if (zone && proposed) { try { date = tripClock(itineraryInstant(context.date, proposed.start, context.zone), zone).date; } catch { /* Show regular hours without claiming schedule compatibility. */ } }
  const day = new Intl.DateTimeFormat('en-US', {weekday:'long',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`));
  return hours.find(value => value.startsWith(`${day}:`));
}
