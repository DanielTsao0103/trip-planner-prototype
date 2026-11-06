import type { MapPoint } from "./domain.ts";

type Match = { placeId: string; point: MapPoint };
type Geocode = (
  request: google.maps.GeocoderRequest,
) => Promise<google.maps.GeocoderResponse>;

// Street or locality centroids cannot stand in for a building or meeting place.
const pinTypes = new Set([
  "street_address",
  "premise",
  "subpremise",
  "point_of_interest",
  "establishment",
  "transit_station",
  "airport",
  "park",
  "intersection",
  "natural_feature",
]);

async function findMatch(
  geocode: Geocode,
  request: google.maps.GeocoderRequest,
): Promise<Match | null> {
  try {
    const { results } = await geocode(request);
    const precise = results.filter(
      (r) =>
        !r.partial_match && r.place_id && r.types.some((t) => pinTypes.has(t)),
    );
    if (precise.length !== 1) return null;
    const result = precise[0];
    return {
      placeId: result.place_id,
      point: result.geometry.location.toJSON(),
    };
  } catch (error) {
    if (String(error).includes("ZERO_RESULTS")) return null;
    throw error;
  }
}

/** Explicit geography in the itinerary wins. Scope short venue/street names to
 * the trip, and leave ambiguous multi-city matches for manual confirmation. */
export async function geocodeItineraryPlace(
  geocode: Geocode,
  address: string,
  destinations: string[],
  placeId?: string | null,
): Promise<Match | null> {
  if (placeId) {
    const saved = await findMatch(geocode, { placeId });
    if (saved) return saved;
  }
  const query = address.trim();
  if (!query) return null;
  const hasGeography =
    query.includes(",") ||
    /\b\d{5}(?:-\d{4})?\b/.test(query) ||
    destinations.some((stop) =>
      query.toLowerCase().includes(stop.split(",")[0].trim().toLowerCase()),
    );
  if (hasGeography || !destinations.length) {
    const match = await findMatch(geocode, { address: query });
    if (match) return match;
    // Booking imports sometimes prefix a full street address with the hotel name.
    const street = query.match(/^[^,]+,\s*(\d[^,]*,.*)$/)?.[1];
    return street ? findMatch(geocode, { address: street }) : null;
  }
  let unique: Match | null = null;
  for (const stop of new Set(destinations)) {
    const match = await findMatch(geocode, { address: `${query}, ${stop}` });
    if (!match) continue;
    if (unique && unique.placeId !== match.placeId) return null;
    unique = match;
  }
  // Long, unpunctuated addresses may already specify a different city.
  if (!unique && /\d/.test(query) && query.split(/\s+/).length >= 5)
    return findMatch(geocode, { address: query });
  return unique;
}
