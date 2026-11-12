import type { MeetingPlace, SearchFocus } from './event-location-search';
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

/** Predict incomplete names and addresses. A trip destination biases, never restricts, results. */
export async function searchDemoLocations(query: string, destination: string, signal: AbortSignal, session: DemoLocationSession) {
  return searchRequest(async child => {
    let focus = session.focus?.destination === destination ? session.focus.value : undefined;
    if (!focus && destination) {
      try {
        const response = await searchRequest(biasSignal => request<{ places?: { location?: { latitude: number; longitude: number } }[] }>(
          'searchText', { textQuery: destination, languageCode: 'en', maxResultCount: 1 }, 'places.location', biasSignal,
        ), child, 900);
        child.throwIfAborted();
        const center = response.places?.[0]?.location;
        if (center && Number.isFinite(center.latitude) && Number.isFinite(center.longitude)) {
          focus = { ...center, zoom: 12, approximate: false };
          session.focus = { destination, value: focus };
        }
      } catch { child.throwIfAborted(); }
    }
    const response = await request<{ suggestions?: { placePrediction?: Prediction }[] }>('autocomplete', {
      input: query, languageCode: 'en',
      ...(focus ? { locationBias: { circle: { center: { latitude: focus.latitude, longitude: focus.longitude }, radius: 50000 } } } : {}),
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
