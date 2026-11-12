import type { MeetingPlace } from './event-location-search.ts';

const normalized = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** A geocoder is a conservative fallback, not a substitute for business autocomplete. */
export function googleLocationResults(results: google.maps.GeocoderResult[], query: string): MeetingPlace[] {
  return results.filter(result => {
    if (!result.place_id || !result.formatted_address || result.partial_match) return false;
    const area = result.types.some(type => /^(locality|country|postal_code|neighborhood|administrative_area_level_|sublocality)/.test(type));
    if (area) {
      const parts = query.split(',').map(normalized);
      // "Starbucks Seattle" must not turn into a suggestion for Seattle itself.
      const components = result.address_components ?? [];
      return components.some(c => c.types.some(type => type !== 'political' && result.types.includes(type)) &&
        [c.long_name, c.short_name].some(name => parts.includes(normalized(name)))) &&
        parts.every(part => components.some(c => [c.long_name, c.short_name].some(name => normalized(name) === part)));
    }
    // A requested building must never be silently replaced with a street center.
    if (/^\s*(?:no\.?\s*)?\d+[a-z]?(?:\s|,)|[0-9０-９]+[號号]/iu.test(query) && result.types.includes('route')) return false;
    return true;
  }).slice(0, 6).map(result => ({
    id: result.place_id, googlePlaceId: result.place_id,
    name: result.formatted_address, address: '', label: result.formatted_address, point: null,
  }));
}
