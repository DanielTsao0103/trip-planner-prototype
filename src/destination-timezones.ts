export type DestinationTimeZone = { destination: string; timeZone: string | null };

type GeocodingResult = { name?: unknown; timezone?: unknown };
const cache = new Map<string, string | null>();

/** Resolve a destination to its IANA time zone using Open-Meteo geocoding. */
export async function destinationTimeZone(destination: string, signal?: AbortSignal): Promise<string | null> {
  const key = destination.trim().toLocaleLowerCase();
  if (cache.has(key)) return cache.get(key)!;
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", destination);
  url.searchParams.set("count", "10");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  const response = await fetch(url, { signal, referrerPolicy: "no-referrer" });
  if (!response.ok) throw new Error("Destination time zones are unavailable right now.");
  const body = await response.json() as { results?: GeocodingResult[] };
  const results = Array.isArray(body.results) ? body.results : [];
  const normalized = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase().trim();
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
