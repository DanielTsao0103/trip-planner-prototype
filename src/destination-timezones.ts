export type DestinationTimeZone = { destination: string; timeZone: string | null };

type GeocodingResult = { name?: unknown; timezone?: unknown };
type PhotonFeature = { properties?: { name?: string; state?: string; country?: string; type?: string }; geometry?: { coordinates?: number[] } };
const cache = new Map<string, string | null>();

function normalized(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase().trim();
}

async function coordinateTimeZone(destination: string, signal?: AbortSignal): Promise<string | null> {
  const parts = destination.split(",").map(part => normalized(part));
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", destination);
  url.searchParams.set("lang", "en");
  url.searchParams.set("limit", "8");
  for (const layer of ["city", "state", "country", "locality"]) url.searchParams.append("layer", layer);
  const response = await fetch(url, { signal, referrerPolicy: "no-referrer" });
  if (!response.ok) return null;
  const body = await response.json() as { features?: PhotonFeature[] };
  const matches = body.features?.filter(item => {
    const properties = item.properties;
    if (!properties || normalized(properties.name ?? "") !== parts[0]) return false;
    if (parts.length > 1 && normalized(properties.country ?? "") !== parts.at(-1)) return false;
    return parts.length < 3 || normalized(properties.state ?? "") === parts[1];
  }) ?? [];
  const feature = parts.length === 2
    ? matches.find(item => item.properties?.type === "state") ?? matches[0]
    : matches[0];
  const [longitude, latitude] = feature?.geometry?.coordinates ?? [];
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const forecast = new URL("https://api.open-meteo.com/v1/forecast");
  forecast.searchParams.set("latitude", String(latitude));
  forecast.searchParams.set("longitude", String(longitude));
  forecast.searchParams.set("current", "temperature_2m");
  forecast.searchParams.set("timezone", "auto");
  const zoneResponse = await fetch(forecast, { signal, referrerPolicy: "no-referrer" });
  if (!zoneResponse.ok) return null;
  const zone = (await zoneResponse.json() as { timezone?: unknown }).timezone;
  return typeof zone === "string" && zone.includes("/") ? zone : null;
}

/** Resolve a destination to its IANA time zone using Open-Meteo geocoding. */
export async function destinationTimeZone(destination: string, signal?: AbortSignal): Promise<string | null> {
  const key = destination.trim().toLocaleLowerCase();
  if (cache.has(key)) return cache.get(key)!;
  // Photon resolves the full selected place (including its state/country), whereas
  // name-only geocoding can mistake a state for a same-named town elsewhere.
  try {
    const coordinateZone = await coordinateTimeZone(destination, signal);
    if (coordinateZone) {
      cache.set(key, coordinateZone);
      return coordinateZone;
    }
  } catch (error) {
    if (signal?.aborted) throw error;
  }
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", destination);
  url.searchParams.set("count", "10");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  const response = await fetch(url, { signal, referrerPolicy: "no-referrer" });
  if (!response.ok) throw new Error("Destination time zones are unavailable right now.");
  const body = await response.json() as { results?: GeocodingResult[] };
  const results = Array.isArray(body.results) ? body.results : [];
  const exact = results.find(result => typeof result.name === "string" && normalized(result.name) === normalized(destination.split(",")[0]));
  const zone = [exact, ...results].find(result => typeof result?.timezone === "string" && result.timezone.includes("/"))?.timezone as string | undefined;
  const value = zone ?? null;
  cache.set(key, value);
  return value;
}

export function timeZoneLabel(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longGeneric" })
      .formatToParts(new Date())
      .find(part => part.type === "timeZoneName")?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}
