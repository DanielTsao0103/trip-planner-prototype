import type { LocationContext } from './event-location-context';
import { locationQuery, resolveSearchFocus, searchMeetingPlaces, type MeetingPlace, type SearchFocus } from './event-location-search';
import { searchRequest } from './search-request';
import { contextFocus, searchDemoLocations, type DemoLocationSession } from './demo-location-search';

export type LocationSuggestions = { places: MeetingPlace[]; source: 'photon' | 'google'; biased: boolean; approximate: boolean; limited: boolean; regionOnly?: boolean };
let photonUnavailableUntil = 0;

/** A failed optional destination bias must never prevent the actual place query. */
export async function findLocationSuggestions(value: string, context: LocationContext, signal: AbortSignal, session: DemoLocationSession): Promise<LocationSuggestions> {
  const query = locationQuery(value);
  let googleResult: LocationSuggestions | undefined;
  try {
    googleResult = { ...await searchDemoLocations(query, context, signal, session), source: 'google' };
    if (googleResult.places.length) return googleResult;
  } catch { signal.throwIfAborted(); }
  let focus: SearchFocus | null = contextFocus(context,session) ?? null;
  if (Date.now() >= photonUnavailableUntil) {
    try { if(context.kind==='destination')focus ??= await searchRequest(child => resolveSearchFocus(context.query, child), signal, 800); }
    catch { signal.throwIfAborted(); }
    try {
      const places = await searchRequest(child => searchMeetingPlaces(query, child, focus), signal, 2000);
      if (places.length || !googleResult) return {places, source:'photon', biased:!!focus, approximate:focus?.approximate ?? false, limited:false};
    } catch {
      signal.throwIfAborted();
      photonUnavailableUntil = Date.now() + 30000;
    }
  }
  if (googleResult) return googleResult;
  // An outage or exhausted demo quota must never activate the potentially billed map key.
  throw new Error('Location search is unavailable');
}
