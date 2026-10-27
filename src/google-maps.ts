/** Google Maps JavaScript API loader and place lookup. The map is optional: without a key the app keeps its illustrative map. */

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();

/** True when a browser key is configured, so the live map can be used. */
export const mapsConfigured = Boolean(apiKey);

/** Optional custom Map ID from Google Cloud. The demo ID works for development. */
export const mapId =
  import.meta.env.VITE_GOOGLE_MAP_ID?.trim() || "DEMO_MAP_ID";

let loading: Promise<void> | undefined;

/** Load the Maps script once. Rejects if the key is missing, invalid or the network blocks it. */
export function loadGoogleMaps(): Promise<void> {
  if (!apiKey)
    return Promise.reject(new Error("VITE_GOOGLE_MAPS_API_KEY is not set."));
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const w = window as unknown as Record<string, unknown>;
    // Google calls this when the key is rejected (wrong referrer, API not enabled, billing off).
    w.gm_authFailure = () =>
      reject(new Error("Google Maps rejected the API key."));
    w.__tripPlannerMapsReady = () => resolve();
    const script = document.createElement("script");
    script.src =
      "https://maps.googleapis.com/maps/api/js?" +
      new URLSearchParams({
        key: apiKey,
        v: "weekly",
        loading: "async",
        callback: "__tripPlannerMapsReady",
      });
    script.async = true;
    script.onerror = () => reject(new Error("Could not load Google Maps."));
    document.head.appendChild(script);
  });
  // Allow a retry on the next map open if loading failed.
  loading.catch(() => {
    loading = undefined;
  });
  return loading;
}

export type LatLng = { lat: number; lng: number };

/** Drop the sample suffixes such as "· downtown" so Google can find the real place. */
export function searchableName(place: string): string {
  return place.split("·")[0].trim();
}

const geocodeCache = new Map<string, LatLng | null>();

/**
 * Find coordinates for a place name, trying each trip destination as the area hint.
 * Results are cached for the session so a place is only looked up once.
 */
export async function locatePlace(
  place: string,
  areas: string[],
): Promise<LatLng | null> {
  const name = searchableName(place);
  const cacheKey = `${name}|${areas.join(",")}`;
  if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey) ?? null;
  const { Geocoder } = (await google.maps.importLibrary(
    "geocoding",
  )) as google.maps.GeocodingLibrary;
  const geocoder = new Geocoder();
  let found: LatLng | null = null;
  for (const area of areas.length ? areas : [""]) {
    try {
      const { results } = await geocoder.geocode({
        address: area ? `${name}, ${area}` : name,
      });
      if (results[0]) {
        const loc = results[0].geometry.location;
        found = { lat: loc.lat(), lng: loc.lng() };
        break;
      }
    } catch {
      // ZERO_RESULTS or a transient error: try the next area.
    }
  }
  geocodeCache.set(cacheKey, found);
  return found;
}

/** Link that opens turn-by-turn walking directions in Google Maps. No API call is needed. */
export function directionsUrl(place: string, areas: string[]): string {
  const query = [searchableName(place), areas[0]].filter(Boolean).join(", ");
  return `https://www.google.com/maps/dir/?${new URLSearchParams({ api: "1", destination: query, travelmode: "walking" })}`;
}
