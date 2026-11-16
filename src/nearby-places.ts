import { reviewCandidates, type NearbyResult, type PlanningContext } from '../supabase/functions/_shared/nearby.ts';
import { searchRequest } from './search-request.ts';
import { regularOpeningWindows, relevantOpeningHours } from './nearby-hours.ts';
import { recommendationSlot } from '../supabase/functions/_shared/nearby-content.ts';

export type SearchLocation = { label: string; point?: { lat: number; lng: number }; googlePlaceId?: string };
export type LocatedSuggestion = NearbyResult & {
  point?: { lat: number; lng: number }; googlePlaceId?: string; addressVerified?: boolean;
  website?: string; openingHours?: string[]; openingWindows?: {start:string;end:string}[]; openingHoursSummary?:string; openingHoursZone?:string; provider?: 'google' | 'web';
  attributions?: { displayName: string; uri?: string }[]; hasPhotos?: boolean;
};
type GooglePlace = {
  id?: unknown; displayName?: { text?: unknown }; formattedAddress?: unknown;
  location?: { latitude?: unknown; longitude?: unknown }; googleMapsUri?: unknown;
  websiteUri?: unknown; regularOpeningHours?: { weekdayDescriptions?: unknown; periods?:unknown }; timeZone?:{id?:unknown};
  businessStatus?: unknown; types?: unknown; photos?: unknown;
  attributions?: { provider?: unknown; providerUri?: unknown }[];
};
const clean = (value: unknown, limit: number) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const url = (value: unknown) => { try { const parsed = new URL(String(value)); return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : ''; } catch { return ''; } };
export const hasLocatedPlace = (result: LocatedSuggestion) => result.kind !== 'guide' && result.kind !== 'dish' && !!result.address.trim() && result.address !== 'Address needs confirmation from the venue' && result.address !== 'Food idea · choose a local restaurant' && (result.addressVerified === true || !!result.googlePlaceId || !!result.point);

/** Only provider-owned fields establish identity; AI prose never supplies coordinates. */
export function googlePlaceResults(payload: unknown, context: PlanningContext): LocatedSuggestion[] {
  const places = (payload as { places?: unknown })?.places;
  if (!Array.isArray(places)) return [];
  const candidates: LocatedSuggestion[] = places.flatMap((place: GooglePlace) => {
    if (!place || typeof place !== 'object') return [];
    const name = clean(place?.displayName?.text, 160), address = clean(place?.formattedAddress, 500), id = clean(place?.id, 300);
    if (!name || !address || !id || !/^[-_A-Za-z0-9]+$/u.test(id) || place.businessStatus === 'CLOSED_PERMANENTLY' || place.businessStatus === 'CLOSED_TEMPORARILY') return [];
    const lat = place.location?.latitude, lng = place.location?.longitude;
    if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return [];
    const maps = new URL('https://www.google.com/maps/search/');
    maps.searchParams.set('api', '1'); maps.searchParams.set('query', `${name}, ${address}`); maps.searchParams.set('query_place_id', id);
    const sourceUrl = url(place.googleMapsUri) || maps.href;
    const openingHours = Array.isArray(place.regularOpeningHours?.weekdayDescriptions) ? place.regularOpeningHours!.weekdayDescriptions.filter((value): value is string => typeof value === 'string').slice(0, 7).map(value => value.slice(0, 120)) : [];
    const attributions = Array.isArray(place.attributions) ? place.attributions.flatMap(item => {
      if (!item || typeof item !== 'object') return [];
      const displayName = clean(item.provider, 200), uri = url(item.providerUri);
      return displayName ? [{ displayName, ...(uri ? { uri } : {}) }] : [];
    }) : [];
    const openingHoursZone = typeof place.timeZone?.id === 'string' ? place.timeZone.id : undefined;
    const openingWindows = regularOpeningWindows(place.regularOpeningHours?.periods, openingHoursZone, context);
    const facts = [{ topic: 'Venue', detail: address, sourceUrl }];
    const candidate = { name, address, point: { lat, lng }, googlePlaceId: id, addressVerified: true, provider: 'google' as const,
      hasPhotos: Array.isArray(place.photos) && place.photos.length > 0, website: url(place.websiteUri) || undefined, openingHours, openingWindows, openingHoursZone, attributions,
      recommendationType: context.intent === 'activity' ? 'activity' as const : 'place' as const,
      durationMinutes: 60, reason: 'A place returned by Google Maps for this search.', fitNote: context.intent === 'activity' ? `Explore ${name} during a free hour. Check the visit length and route before you go.` : `A ${context.intent} option in your search area. Check the menu and dietary needs before you go.`,
      pricePerPersonCents: null, currency: null, facts, concerns: ['Visit length is an estimate, not a confirmed booking.'], conflicts: [], proposedTime: null, status: 'review' as const };
    return [candidate as LocatedSuggestion];
  });
  // Keep the same duplicate, budget, time and shared-needs checks as web research.
  const unplanned = candidates.filter(candidate => !context.events.some(event => event.name.trim().toLocaleLowerCase() === candidate.name.trim().toLocaleLowerCase() || event.place.trim().toLocaleLowerCase() === candidate.address.trim().toLocaleLowerCase()));
  // Google relevance order can put closed venues ahead of usable alternatives.
  // Prefer a verified opening that fits, then unknown hours, while retaining
  // closed venues for review when no schedulable alternative was returned.
  const availability = (candidate: LocatedSuggestion) => candidate.openingWindows === undefined ? 1 : recommendationSlot(candidate,context.gaps) ? 0 : 2;
  unplanned.sort((a,b) => availability(a)-availability(b));
  return (reviewCandidates(unplanned, context, candidates.flatMap(item => item.facts.map(fact => fact.sourceUrl))) as LocatedSuggestion[]).map(result => {
    const proposedTime = recommendationSlot(result, context.gaps);
    return {...result, proposedTime, ...(result.openingWindows && !proposedTime ? {fitNote:`${result.name} has published hours, but they do not overlap your available time. Save it for later or choose another day.`} : {}), openingHoursSummary:relevantOpeningHours(result.openingHours || [],result.openingHoursZone,context,proposedTime)};
  });
}

/** One bounded request supplies usable places first; no paid key fallback or provider-content persistence. */
export async function searchNearbyPlaces(context: PlanningContext, location: SearchLocation | undefined, signal: AbortSignal, apiKey: string, fetcher: typeof fetch = fetch): Promise<LocatedSuggestion[]> {
  if (!apiKey) return [];
  let point = location?.point;
  // Autocomplete returns a stable identity before coordinates. Resolve that
  // identity with the same demo key instead of consuming Text Search quota.
  if (!point && location?.googlePlaceId && /^[-_A-Za-z0-9]+$/u.test(location.googlePlaceId)) {
    point = await searchRequest(async child => {
      const response = await fetcher(`https://places.googleapis.com/v1/places/${encodeURIComponent(location.googlePlaceId!)}`, {
        signal: child, headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': 'location' },
      });
      if (!response.ok) throw new Error('Could not locate the selected place. Select it again or use your current location.');
      const value = (await response.json()).location;
      if (typeof value?.latitude !== 'number' || typeof value?.longitude !== 'number' || !Number.isFinite(value.latitude) || !Number.isFinite(value.longitude) || Math.abs(value.latitude) > 90 || Math.abs(value.longitude) > 180) throw new Error('The selected place has no usable map location.');
      return { lat: value.latitude, lng: value.longitude };
    }, signal, 2500);
  }
  const filters = context.intent === 'activity' ? [...new Set(context.preferences.flatMap(p => p.interests))].filter(value => /^(Art|Culture|History|Nature|Shopping|Modern architecture)$/u.test(value)).slice(0, 2).join(' ') : context.diet.filter(value => ['Vegetarian', 'Vegan', 'Halal', 'Kosher'].includes(value)).join(' ');
  const category = context.intent === 'activity' ? 'visitor attractions and things to do' : `${context.intent} restaurants`;
  // A geographic restriction is preferable to the trip city for explicit current-location searches.
  const nearby = point && !filters;
  const latRadius = 0.027, lngRadius = point ? Math.min(180, latRadius / Math.max(0.01, Math.cos(point.lat * Math.PI / 180))) : 0;
  const longitude = (value: number) => ((value + 540) % 360) - 180;
  const endpoint = nearby ? 'searchNearby' : 'searchText';
  const body = point && nearby ? {
    includedTypes: context.intent === 'activity' ? ['tourist_attraction', 'museum', 'park', 'art_gallery'] : ['restaurant'], maxResultCount: 6, languageCode:'en',
    locationRestriction: { circle: { center: { latitude: point.lat, longitude: point.lng }, radius: 3000 } },
  } : { textQuery: `${filters} ${category}${point ? '' : ` near ${location?.label || context.area}`}`.trim(), maxResultCount: 6, languageCode:'en',
    ...(point ? { locationRestriction: { rectangle: { low: { latitude: Math.max(-90, point.lat-latRadius), longitude: longitude(point.lng-lngRadius) }, high: { latitude: Math.min(90, point.lat+latRadius), longitude: longitude(point.lng+lngRadius) } } } } : {}),
  };
  const nearbyBody = point ? {
    includedTypes: context.intent === 'activity' ? ['tourist_attraction', 'museum', 'park', 'art_gallery'] : ['restaurant'], maxResultCount: 6, languageCode: 'en',
    locationRestriction: { circle: { center: { latitude: point.lat, longitude: point.lng }, radius: 3000 } },
  } : undefined;
  const search = (method: string, payload: unknown) => searchRequest(async child => {
    const response = await fetcher(`https://places.googleapis.com/v1/places:${method}`, {
      method: 'POST', signal: child, headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.googleMapsUri,places.websiteUri,places.regularOpeningHours,places.businessStatus,places.attributions,places.timeZone,places.photos' }, body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(response.status === 429 ? 'Place search has reached its temporary limit. Select a suggested location or use your current location, then retry.' : 'Place search is temporarily unavailable. Please try again.');
    return googlePlaceResults(await response.json(), context);
  }, signal, 2500);
  try {
    const results = await search(endpoint, body);
    if (results.length || endpoint === 'searchNearby' || !nearbyBody) return results;
  } catch (error) {
    signal.throwIfAborted();
    if (endpoint === 'searchNearby' || !nearbyBody) throw error;
  }
  // A text-search outage must not hide nearby venues. Dietary and accessibility
  // requirements remain explicit confirmation checks, never verified claims.
  return search('searchNearby', nearbyBody);
}

/** URL drafts are untrusted; never seed a form with malformed coordinates or a resource path. */
export function suggestionLocationParams(params: URLSearchParams) {
  const latitude = params.get('lat'), longitude = params.get('lng'), id = params.get('googlePlaceId');
  const lat = latitude === null || latitude.trim() === '' ? NaN : Number(latitude), lng = longitude === null || longitude.trim() === '' ? NaN : Number(longitude);
  return {
    point: Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null,
    googlePlaceId: id && id.length <= 300 && /^[-_A-Za-z0-9]+$/u.test(id) ? id : null,
  };
}
