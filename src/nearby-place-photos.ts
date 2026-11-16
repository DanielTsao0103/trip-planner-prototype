import { searchRequest } from './search-request.ts';

export type NearbyPlacePhoto = {
  url: string;
  alt: string;
  label: 'Google Maps photo';
  attributions: { name: string; url?: string }[];
};
const validPlaceId = (value: unknown): value is string => typeof value === 'string' && /^[-_A-Za-z0-9]{1,300}$/u.test(value);
function httpsUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value || value.length > 4096) return;
  try {
    const parsed = new URL(value.startsWith('//') ? `https:${value}` : value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && !parsed.port ? parsed.href : undefined;
  } catch { return; }
}
function photoAttributions(value: unknown): NearbyPlacePhoto['attributions'] | undefined {
  // Missing/malformed attribution must not silently discard required credits.
  if (!Array.isArray(value) || value.length > 20) return;
  const result: NearbyPlacePhoto['attributions'] = [];
  for (const author of value) {
    if (!author || typeof author !== 'object' || typeof author.displayName !== 'string' || !author.displayName.trim() || author.displayName.length > 500) return;
    const url = author.uri ? httpsUrl(author.uri) : undefined;
    if (author.uri && !url) return;
    result.push({ name: author.displayName.trim(), ...(url ? { url } : {}) });
  }
  return result;
}

/** Fetch a photo belonging to an exact provider place ID, using the demo key.
 * Keep the returned URL/credits only in the mounted view: photo references expire
 * and are not itinerary photos or persistent trip content. No area-image fallback.
 */
export async function loadNearbyPlacePhoto(
  place: { googlePlaceId?: string; name: string },
  signal: AbortSignal,
  demoApiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<NearbyPlacePhoto | undefined> {
  const id = place.googlePlaceId;
  if (!validPlaceId(id) || !demoApiKey.trim() || signal.aborted) return;
  try {
    return await searchRequest(async child => {
      const details = await fetcher(`https://places.googleapis.com/v1/places/${id}`, {
        signal: child, cache: 'no-store',
        headers: { 'X-Goog-Api-Key': demoApiKey, 'X-Goog-FieldMask': 'id,photos' },
      });
      if (!details.ok) return;
      const data = await details.json();
      if (data?.id !== id || !Array.isArray(data.photos)) return;
      const photo = data.photos.slice(0, 10).flatMap((item: unknown) => {
        if (!item || typeof item !== 'object') return [];
        const value = item as { name?: unknown; authorAttributions?: unknown };
        if (typeof value.name !== 'string' || !value.name.startsWith(`places/${id}/photos/`)) return [];
        const token = value.name.slice(`places/${id}/photos/`.length);
        if (!/^[-_A-Za-z0-9]{1,2048}$/u.test(token)) return [];
        const attributions = photoAttributions(value.authorAttributions);
        return attributions ? [{ name: value.name, attributions }] : [];
      })[0];
      if (!photo) return;
      child.throwIfAborted();
      const media = await fetcher(`https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=720&skipHttpRedirect=true`, {
        signal: child, cache: 'no-store', headers: { 'X-Goog-Api-Key': demoApiKey },
      });
      if (!media.ok) return;
      const image = await media.json();
      if (image?.name !== `${photo.name}/media`) return;
      const url = httpsUrl(image.photoUri);
      if (!url) return;
      const host = new URL(url).hostname;
      if (!(host === 'googleusercontent.com' || host.endsWith('.googleusercontent.com') || host === 'ggpht.com' || host.endsWith('.ggpht.com'))) return;
      child.throwIfAborted();
      return { url, alt: `Photo shared for ${place.name} on Google Maps`, label: 'Google Maps photo', attributions: photo.attributions };
    }, signal, 3500);
  } catch { return; }
}
