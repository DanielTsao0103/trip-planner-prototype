import type { Event, MapPoint } from './domain.ts';

export type LocationContext = {
  key: string; label: string; query: string; reason: string;
  kind: 'event' | 'destination'; point?: MapPoint; googlePlaceId?: string;
};
export type LocationItinerary = { events: Event[]; date: string; start: string; editingId?: string };
export function destinationContext(destination: string): LocationContext {
  return { key: `destination:${destination}`, label: destination, query: destination, reason: 'Trip destination', kind: 'destination' };
}
export function validLocationPoint(point?: MapPoint | null): point is MapPoint {
  return !!point && Number.isFinite(point.lat) && Number.isFinite(point.lng) && Math.abs(point.lat)<=90 && Math.abs(point.lng)<=180;
}
/** A free-form meeting instruction is not evidence of a city. */
function located(event: Event): boolean {
  return validLocationPoint(event.point) || !!event.googlePlaceId || event.place.split(/[,，]/u).filter(part=>part.trim()).length>=2;
}
function eventContext(event: Event, reason: string): LocationContext {
  return { key: JSON.stringify(['event',event.id,event.place,event.googlePlaceId,event.point]),
    label: event.name || event.place, query: event.place, reason, kind: 'event',
    point: validLocationPoint(event.point)?event.point:undefined, googlePlaceId: event.googlePlaceId || undefined };
}
/** Follow the itinerary in time; never average unrelated cities or use distant past days. */
export function inferLocationContext(destinations: string[], itinerary?: LocationItinerary): LocationContext {
  if (itinerary) {
    const {events,date,start,editingId}=itinerary;
    const original=events.find(event=>event.id===editingId && located(event));
    if(original)return eventContext(original,'Current event location');
    const candidates=events.filter(event=>event.id!==editingId && located(event))
      .sort((a,b)=>`${a.date}T${a.start}`.localeCompare(`${b.date}T${b.start}`) || a.id.localeCompare(b.id));
    const today=candidates.filter(event=>event.date===date);
    const previous=today.filter(event=>event.start<=(start||'00:00')).at(-1);
    if(previous)return eventContext(previous,'Earlier event that day');
    if(today.length)return eventContext(today[0],'Next event that day');
    // Calendar-day arithmetic avoids the browser's home timezone and DST offsets.
    const day=Date.parse(`${date}T00:00:00Z`);
    const yesterday=candidates.filter(event=>Date.parse(`${event.date}T00:00:00Z`)===day-86400000).at(-1);
    if(yesterday)return eventContext(yesterday,'Last event the previous day');
  }
  return destinationContext(destinations[0] || '');
}
