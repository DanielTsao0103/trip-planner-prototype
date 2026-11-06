import type { MapPoint } from "./domain.ts";

type Match = { placeId: string; point: MapPoint; area: boolean };
type Geocode = (
  request: google.maps.GeocoderRequest,
) => Promise<google.maps.GeocoderResponse>;

// Specific venues and addresses can be pinned directly.
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

/** Accept a regional center only when the traveler's text actually names
 * that area. A missing building on the same street must never become a city pin. */
function matchesNamedArea(result: google.maps.GeocoderResult, entered: string) {
  if (
    !result.types.some((t) =>
      /^(postal_code|locality|country|neighborhood|administrative_area_level_\d+|sublocality(?:_level_\d+)?)$/.test(
        t,
      ),
    )
  )
    return false;
  const normalize = (s: string) =>
    s
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const name = normalize(entered);
  if (!name) return false;
  const components = result.address_components ?? [];
  if (result.formatted_address && normalize(result.formatted_address) === name)
    return true;
  const terms = new Set(
    components.flatMap((c) => [
      normalize(c.long_name),
      normalize(c.short_name),
    ]),
  );
  // A parent country or state is present on every city result within it.
  // Require the traveler to have actually named the returned area as well.
  const parts = entered.split(",").map(normalize);
  const namesOwnArea = components.some((component) =>
    component.types.some((type) => type !== "political" && result.types.includes(type)) &&
    [component.long_name, component.short_name].some((name) => parts.includes(normalize(name))),
  );
  return namesOwnArea && parts.every((part) => terms.has(part));
}

async function findMatch(
  geocode: Geocode,
  request: google.maps.GeocoderRequest,
  entered: string,
): Promise<Match | null> {
  try {
    const { results } = await geocode(request);
    const precise = results.filter(
      (r) =>
        !r.partial_match &&
        r.place_id &&
        (r.types.some((t) => pinTypes.has(t)) || matchesNamedArea(r, entered)),
    );
    if (precise.length !== 1) return null;
    const result = precise[0];
    return {
      placeId: result.place_id,
      area: !result.types.some((t) => pinTypes.has(t)),
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
    const saved = await findMatch(geocode, { placeId }, address);
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
    const match = await findMatch(geocode, { address: query }, address);
    if (match) return match;
    // Booking imports sometimes prefix a full street address with the hotel name.
    const street = query.match(/^[^,]+,\s*(\d[^,]*,.*)$/)?.[1];
    return street ? findMatch(geocode, { address: street }, address) : null;
  }
  let unique: Match | null = null;
  for (const stop of new Set(destinations)) {
    const match = await findMatch(
      geocode,
      { address: `${query}, ${stop}` },
      address,
    );
    if (!match) continue;
    if (unique && unique.placeId !== match.placeId) return null;
    unique = match;
  }
  // Long, unpunctuated addresses may already specify a different city.
  if (!unique && /\d/.test(query) && query.split(/\s+/).length >= 5)
    return findMatch(geocode, { address: query }, address);
  return unique;
}
