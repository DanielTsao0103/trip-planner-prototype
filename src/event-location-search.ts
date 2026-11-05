import { TEXT_LIMITS } from './limits.ts';
export type MeetingPlace = { id: string; name: string; address: string; label: string };

/** Accept a place name or a short meeting instruction without limiting geography. */
export const locationQuery = (value: string) => value.trim().replace(/^(?:meet(?:\s+(?:me|us))?\s+(?:at|near)|meeting\s+at)\s+/i, '').trim();
const parts = (...values: string[]) => [...new Set(values.filter(Boolean))].join(', ');

export function meetingPlacesFromResponse(data: unknown): MeetingPlace[] {
  if (!data || typeof data !== 'object' || !Array.isArray((data as {features?: unknown}).features)) throw new Error('Invalid location response');
  const seen = new Set<string>();
  return (data as {features: {properties?: Record<string, unknown>}[]}).features.flatMap(feature => {
    const p = feature?.properties;
    if (!p) return [];
    const text = (key: string) => typeof p[key] === 'string' ? (p[key] as string).trim() : '';
    const street = [text('housenumber'), text('street')].filter(Boolean).join(' ');
    const name = text('name') || street;
    if (!name) return [];
    const city = text('city') || text('locality') || text('district');
    const address = parts(street === name ? '' : street, city === name ? '' : city, text('state') === name ? '' : text('state'), text('country') === name ? '' : text('country'));
    const label = parts(name, address);
    // Never silently truncate an address or bypass the existing database limit.
    if (label.length > TEXT_LIMITS.location || seen.has(label.toLocaleLowerCase())) return [];
    seen.add(label.toLocaleLowerCase());
    return [{id:`${text('osm_type')}/${String(p.osm_id ?? label)}`, name, address, label}];
  }).slice(0, 6);
}

export async function searchMeetingPlaces(value: string, signal: AbortSignal): Promise<MeetingPlace[]> {
  const query = locationQuery(value);
  if (query.length < 2) return [];
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', query);
  url.searchParams.set('lang', 'en');
  url.searchParams.set('limit', '8');
  // No country, bounding box or layer filters: include venues, landmarks and street addresses worldwide.
  const response = await fetch(url, {signal, referrerPolicy:'no-referrer'});
  if (!response.ok) throw new Error('Location search is unavailable');
  return meetingPlacesFromResponse(await response.json());
}
