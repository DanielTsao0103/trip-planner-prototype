import type { MapPoint } from "./domain.ts";
export type MeetingPlace = { id: string; name: string; address: string; label: string; point: MapPoint | null; googlePlaceId?: string; finishSelection?: () => void };
export type SearchFocus = { latitude: number; longitude: number; zoom: number; approximate: boolean; viewport?: { low: { latitude: number; longitude: number }; high: { latitude: number; longitude: number } } };
type Feature = {properties?: Record<string, unknown>; geometry?: {coordinates?: unknown}};
const normalized = (value: string) => value.normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
const cacheText = (value:string) => value.normalize('NFKC').toLocaleLowerCase().trim().replace(/\s+/g,' ');
export const locationSearchKey = (query: string, destination: string) => JSON.stringify([cacheText(query),cacheText(destination)]);
const focusCache = new Map<string, SearchFocus>();
function coordinates(feature: Feature): [number,number] | null {
  const c = feature?.geometry?.coordinates;
  return Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]) && Math.abs(c[0])<=180 && Math.abs(c[1])<=90 ? [c[0],c[1]] : null;
}
function distance(focus: SearchFocus, point: [number,number] | null) {
  if(!point)return Infinity;
  const rad=Math.PI/180, dlat=(point[1]-focus.latitude)*rad, dlon=(point[0]-focus.longitude)*rad;
  const a=Math.sin(dlat/2)**2+Math.cos(focus.latitude*rad)*Math.cos(point[1]*rad)*Math.sin(dlon/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a)));
}

/** Resolve a trip stop once per session; never request the traveler's device location. */
export async function resolveSearchFocus(destination: string, signal: AbortSignal): Promise<SearchFocus | null> {
  if(!destination.trim())return null;
  const key=locationSearchKey("",destination),cached=focusCache.get(key);
  if(cached)return cached;
  async function lookup(query:string): Promise<Feature[]> {
    const url=new URL('https://photon.komoot.io/api/');
    url.searchParams.set('q',query);url.searchParams.set('lang','en');url.searchParams.set('limit','5');
    // Geographic layers apply only to resolving the trip destination, never to venue results.
    ['city','state','country','county'].forEach(layer=>url.searchParams.append('layer',layer));
    const response=await fetch(url,{signal,referrerPolicy:'no-referrer'});
    if(!response.ok)throw new Error('Destination lookup is unavailable');
    const data=await response.json();
    return Array.isArray(data.features)?data.features.filter((f:Feature)=>coordinates(f)):[];
  }
  const primary=destination.split(',')[0].trim();
  const direction=primary.match(/^(northern|southern|eastern|western|north|south|east|west|central)\s+(.+)$/i);
  let features=await lookup(destination);
  let chosen=features.find(f=>normalized(String(f.properties?.name||''))===normalized(primary)) || features[0];
  let approximate=false;
  if(direction && (!chosen || normalized(String(chosen.properties?.name||''))!==normalized(primary))) {
    // Informal regions such as Southern California use the relevant part of the named parent region.
    const fallback=await lookup(destination.replace(primary,direction[2]));
    chosen=fallback.find(f=>normalized(String(f.properties?.name||''))===normalized(direction[2])) || fallback[0];
    approximate=!!chosen;
  }
  if(!chosen)return null;
  const point=coordinates(chosen)!;
  const type=String(chosen.properties?.type||'city');
  const focus:SearchFocus={longitude:point[0],latitude:point[1],zoom:type==='country'?4:type==='state'?7:type==='county'?9:12,approximate};
  const bounds=chosen.properties?.extent;
  if(approximate && direction && Array.isArray(bounds) && bounds.length===4 && bounds.every(Number.isFinite)) {
    const [west,north,east,south]=bounds;
    if(west<east && south<north) {
      focus.longitude=(west+east)/2;focus.latitude=(south+north)/2;
      const compass=direction[1].toLowerCase();
      if(compass.startsWith('south'))focus.latitude=south+(north-south)*.25;
      if(compass.startsWith('north'))focus.latitude=south+(north-south)*.75;
      if(compass.startsWith('west'))focus.longitude=west+(east-west)*.25;
      if(compass.startsWith('east'))focus.longitude=west+(east-west)*.75;
      focus.zoom=Math.min(focus.zoom,7);
    }
  }
  if(focusCache.size>=50)focusCache.delete(focusCache.keys().next().value!);
  focusCache.set(key,focus);
  return focus;
}

/** Accept a place name or a short meeting instruction without limiting geography. */
export const locationQuery = (value: string) => value.trim().replace(/^(?:meet(?:\s+(?:me|us))?\s+(?:at|near)|meeting\s+at)\s+/i, '').trim();
const parts = (...values: string[]) => [...new Set(values.filter(Boolean))].join(', ');

/** Match building numbers without treating a street midpoint as a front door. */
function requestedHouseNumber(query: string, street: string): string | undefined {
  const input = query.normalize('NFKC').trim();
  const marked = input.match(/(\d+(?:[-之]\d+)?)[號号]/u)
    ?? input.match(/(?:^|,\s*)no\.\s*(\d+[a-z]?(?:[-/]\d+[a-z]?)*)(?=\s|,|$)/i);
  if (marked) return marked[1].toLowerCase();

  // A later comma-separated component may be the postal code. Prefer the
  // component that actually names this street when the venue precedes it.
  const parts = input.split(/[,，]/u).map(part => part.trim());
  const road = normalized(street);
  const part = parts.find(part => road && normalized(part).includes(road)) ?? parts[0];
  const leading = part.match(/^(?:no\.?\s*)?(\d+[a-z]?(?:[-/]\d+[a-z]?)*)(?=\s|$)/i);
  if (leading) return leading[1].toLowerCase();
  const trailing = part.match(/^(.+?)\s+(\d+[a-z]?(?:[-/]\d+[a-z]?)*)$/i);
  return trailing && normalized(trailing[1]) === road
    ? trailing[2].toLowerCase() : undefined;
}

export function meetingPlacesFromResponse(data: unknown, focus?: SearchFocus | null, query = ""): MeetingPlace[] {
  if (!data || typeof data !== 'object' || !Array.isArray((data as {features?: unknown}).features)) throw new Error('Invalid location response');
  const seen = new Set<string>();
  return (data as {features: Feature[]}).features.flatMap((feature,order) => {
    const p = feature?.properties;
    if (!p) return [];
    const text = (key: string) => typeof p[key] === 'string' ? (p[key] as string).trim() : '';
    const house = text('housenumber');
    const streetName = text('street');
    const type = text('type');
    const street = [house, streetName].filter(Boolean).join(' ');
    const name = text('name') || street;
    if (!name) return [];
    const requested = requestedHouseNumber(query, streetName || name);
    const addressResult = house || type === 'house' || type === 'street' || (streetName && !text('name'));
    if (requested && addressResult &&
        house.normalize('NFKC').replace(/[號号]$/u, '').toLowerCase() !== requested) return [];
    const city = text('city') || text('locality') || text('district');
    const address = parts(street === name ? '' : street, city === name ? '' : city, text('state') === name ? '' : text('state'), text('country') === name ? '' : text('country'));
    const label = parts(name, address);
    const coords = coordinates(feature);
    const identity = JSON.stringify([label.toLocaleLowerCase(), coords]);
    if (seen.has(identity)) return [];
    seen.add(identity);
    const compact=normalized(query),nameMatch=!!compact && normalized(name).includes(compact);
    // Resolve administrative areas through Google so the map can label the center.
    const area = ['district','locality','city','state','country','county','postcode'].includes(text('type'));
    const point = coords && !area ? { lat: coords[1], lng: coords[0] } : null;
    return [{place:{point,id:`${text('osm_type')}/${String(p.osm_id ?? label)}`, name, address, label},order,match:nameMatch?0:1,distance:focus?distance(focus,coordinates(feature)):0}];
  }).sort((a,b)=>focus?(a.match-b.match || a.distance-b.distance || a.order-b.order):a.order-b.order).slice(0,6).map(result=>result.place);
}

export async function searchMeetingPlaces(value: string, signal: AbortSignal, focus?: SearchFocus | null): Promise<MeetingPlace[]> {
  const query = locationQuery(value);
  if (query.length < 2) return [];
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', query);
  url.searchParams.set('lang', 'en');
  url.searchParams.set('limit', focus ? '12' : '8');
  if(focus){
    url.searchParams.set('lat',String(focus.latitude));url.searchParams.set('lon',String(focus.longitude));
    url.searchParams.set('zoom',String(focus.zoom));url.searchParams.set('location_bias_scale','0.1');
  }
  // No country, bounding box or layer filters: include venues, landmarks and street addresses worldwide.
  const response = await fetch(url, {signal, referrerPolicy:'no-referrer'});
  if (!response.ok) throw new Error('Location search is unavailable');
  return meetingPlacesFromResponse(await response.json(),focus,query);
}
