import { loadGoogleMaps } from './google-maps';
import { googleLocationResults } from './google-location-results';
import { searchRequest } from './search-request';
import type { MeetingPlace, SearchFocus } from './event-location-search';

export type GoogleSearchSession = { token?: google.maps.places.AutocompleteSessionToken; focus?: {destination:string; value:SearchFocus} };
let placesDeniedUntil = 0;

/** Uses the site's existing Maps key; enabling Places requires the project owner's access. */
export async function searchGoogleLocations(
  query: string, signal: AbortSignal, session: GoogleSearchSession,
  focus?: SearchFocus | null, regionsOnly = false, destination = '',
): Promise<{ places: MeetingPlace[]; limited: boolean; biased: boolean }> {
  return searchRequest(async child => {
    await loadGoogleMaps();
    child.throwIfAborted();
    let searchFocus = focus;
    if (!searchFocus && destination) {
      if (session.focus?.destination === destination) searchFocus = session.focus.value;
      else try {
        const { Geocoder } = await google.maps.importLibrary('geocoding') as google.maps.GeocodingLibrary;
        const response = await searchRequest(() => new Geocoder().geocode({address:destination}), child, 900);
        const center = response.results[0]?.geometry.location.toJSON();
        if (center) {
          searchFocus = {latitude:center.lat, longitude:center.lng, zoom:12, approximate:false};
          session.focus = {destination, value:searchFocus};
        }
      } catch { child.throwIfAborted(); }
    }
    if (Date.now() >= placesDeniedUntil) {
      try {
        const { AutocompleteSuggestion, AutocompleteSessionToken } = await google.maps.importLibrary('places') as google.maps.PlacesLibrary;
        child.throwIfAborted();
        session.token ??= new AutocompleteSessionToken();
        const { suggestions } = await searchRequest(() => AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query, sessionToken: session.token, language: 'en',
          ...(regionsOnly ? { includedPrimaryTypes: ['(regions)'] } : {}),
          ...(searchFocus ? { locationBias: { center: {lat: searchFocus.latitude, lng: searchFocus.longitude}, radius: 50000 } } : {}),
        }), child, 1800);
        child.throwIfAborted();
        return { limited: false, biased:!!searchFocus, places: suggestions.flatMap(({placePrediction: prediction}) => prediction ? [{
          id: prediction.placeId, googlePlaceId: prediction.placeId,
          name: prediction.mainText?.toString() || prediction.text.toString(),
          address: prediction.secondaryText?.toString() || '', label: prediction.text.toString(), point: null,
          finishSelection: () => {
            // Request only the location field to finish this autocomplete session.
            // Persist the stable place ID; the map resolves fresh coordinates.
            session.token = undefined;
            void prediction.toPlace().fetchFields({fields: ['location']}).catch(() => {});
          },
        }] : []).slice(0, 6) };
      } catch (error) {
        child.throwIfAborted();
        if (/PERMISSION_DENIED|REQUEST_DENIED|ApiNotActivated/i.test(String(error))) placesDeniedUntil = Date.now() + 60000;
        session.token = undefined;
      }
    }
    const { Geocoder } = await google.maps.importLibrary('geocoding') as google.maps.GeocodingLibrary;
    child.throwIfAborted();
    try {
      const { results } = await new Geocoder().geocode({address: query,
        ...(searchFocus ? {bounds: {north: Math.min(90,searchFocus.latitude + .4), south: Math.max(-90,searchFocus.latitude - .4), east: searchFocus.longitude + .4, west: searchFocus.longitude - .4}} : {}),
      });
      child.throwIfAborted();
      return { places: googleLocationResults(results, query), limited: true, biased:!!searchFocus };
    } catch (error) {
      child.throwIfAborted();
      if (String(error).includes('ZERO_RESULTS')) return {places: [], limited: true, biased:!!searchFocus};
      throw error;
    }
  }, signal, 5500);
}
