import type { MeetingPlace, SearchFocus } from './event-location-search';
import { validLocationPoint, type LocationContext } from './event-location-context';
import { searchRequest } from './search-request';

export type DemoLocationSession = { focus?: { destination: string; value: SearchFocus } };
type Prediction = { placeId?: string; text?: { text?: string }; structuredFormat?: {
  mainText?: { text?: string }; secondaryText?: { text?: string };
} };
const demoKey = import.meta.env.VITE_GOOGLE_MAPS_DEMO_API_KEY?.trim();

/** Use the no-payment project directly, independently of the Map tab's SDK/key. */
async function request<T>(method: string, body: object, fields: string, signal: AbortSignal): Promise<T> {
  if (!demoKey) throw new Error('The no-payment location search key is unavailable.');
  const response = await fetch(`https://places.googleapis.com/v1/places:${method}`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': demoKey, 'X-Goog-FieldMask': fields },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error('Location suggestions are unavailable.');
  return response.json() as Promise<T>;
}

/** Known event coordinates are available synchronously, including the very first keystroke. */
export function contextFocus(context: LocationContext, session: DemoLocationSession): SearchFocus | undefined {
  if (validLocationPoint(context.point)) return { latitude: context.point.lat, longitude: context.point.lng, zoom: 12, approximate: false };
  return session.focus?.destination === context.key ? session.focus.value : undefined;
}

/** Resolve one anchor when the form/context changes, never once per keystroke. */
export async function prepareDemoLocationFocus(context: LocationContext, signal: AbortSignal, session: DemoLocationSession): Promise<void> {
  if (contextFocus(context,session) || !context.query) return;
  type Place = { location?: { latitude: number; longitude: number }; viewport?: SearchFocus['viewport'] };
  const place = await searchRequest(async child => {
    if(context.googlePlaceId) {
      if(!demoKey)throw new Error('Location context unavailable');
      const response=await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(context.googlePlaceId)}`,{
        signal:child, headers:{'X-Goog-Api-Key':demoKey,'X-Goog-FieldMask':'location'},
      });
      if(!response.ok)throw new Error('Location context unavailable');
      return await response.json() as Place;
    }
    const response=await request<{places?:Place[]}>('searchText',
      {textQuery:context.query,languageCode:'en',maxResultCount:1},'places.location,places.viewport',child);
    return response.places?.[0];
  },signal,1200);
  signal.throwIfAborted();
  const center=place?.location;
  if(center && validLocationPoint({lat:center.latitude,lng:center.longitude})) {
    const viewport=place?.viewport;
    const validViewport=viewport && validLocationPoint({lat:viewport.low?.latitude,lng:viewport.low?.longitude})
      && validLocationPoint({lat:viewport.high?.latitude,lng:viewport.high?.longitude}) && viewport.low.latitude<=viewport.high.latitude;
    session.focus={destination:context.key,value:{...center,zoom:12,approximate:false,
      ...(context.kind==='destination' && validViewport?{viewport}:{} )}};
  }
}

/** Predict immediately; use an already available bias without waiting for another request. */
export async function searchDemoLocations(query: string, context: LocationContext, signal: AbortSignal, session: DemoLocationSession) {
  return searchRequest(async child => {
    const focus = contextFocus(context,session);
    const response = await request<{ suggestions?: { placePrediction?: Prediction }[] }>('autocomplete', {
      input: query, languageCode: 'en',
      ...(focus ? { locationBias: focus.viewport ? { rectangle: focus.viewport } : { circle: { center: { latitude: focus.latitude, longitude: focus.longitude }, radius: context.kind==='event'?20000:50000 } } } : {}),
    }, 'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat', child);
    child.throwIfAborted();
    const seen = new Set<string>();
    const places: MeetingPlace[] = (response.suggestions ?? []).flatMap(({ placePrediction: p }) => {
      if (!p?.placeId || !p.text?.text || seen.has(p.placeId)) return [];
      seen.add(p.placeId);
      return [{ id: p.placeId, googlePlaceId: p.placeId, label: p.text.text,
        name: p.structuredFormat?.mainText?.text || p.text.text,
        address: p.structuredFormat?.secondaryText?.text || '', point: null }];
    }).slice(0, 6);
    return { places, biased: !!focus, limited: false, approximate: false };
  }, signal, 3500);
}
