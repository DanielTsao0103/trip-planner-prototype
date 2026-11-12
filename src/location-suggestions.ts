import { locationQuery, resolveSearchFocus, searchMeetingPlaces, type MeetingPlace, type SearchFocus } from './event-location-search';
import { searchRequest } from './search-request';
import type { GoogleSearchSession } from './google-location-search';

export type LocationSuggestions = { places: MeetingPlace[]; source: 'photon' | 'google'; biased: boolean; approximate: boolean; limited: boolean };
let photonUnavailableUntil = 0;

/** A failed optional destination bias must never prevent the actual place query. */
export async function findLocationSuggestions(value: string, destination: string, signal: AbortSignal, session: GoogleSearchSession): Promise<LocationSuggestions> {
  const query = locationQuery(value);
  let focus: SearchFocus | null = null;
  if (Date.now() >= photonUnavailableUntil) {
    try { focus = await searchRequest(child => resolveSearchFocus(destination, child), signal, 800); }
    catch { signal.throwIfAborted(); }
    try {
      const places = await searchRequest(child => searchMeetingPlaces(query, child, focus), signal, 2000);
      if (places.length) return {places, source:'photon', biased:!!focus, approximate:focus?.approximate ?? false, limited:false};
    } catch {
      signal.throwIfAborted();
      photonUnavailableUntil = Date.now() + 30000;
    }
  }
  const { searchGoogleLocations } = await import('./google-location-search');
  const result = await searchGoogleLocations(query, signal, session, focus, false, destination);
  return {...result, source:'google', approximate:focus?.approximate ?? false};
}
