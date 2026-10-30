import { getSupabase } from "./supabase";

export type UnsplashPhoto = {
  id: string;
  url: string;
  thumb: string;
  alt: string;
  downloadLocation: string;
  credit: { name: string; profileUrl: string; photoUrl: string };
};

const endpoint = "https://mzwydinhvgmwhnwlomnn.supabase.co/functions/v1/unsplash-search";
const referral = "utm_source=trip_planner_prototype&utm_medium=referral";
const credited = (url: string) => `${url}${url.includes("?") ? "&" : "?"}${referral}`;

export async function searchDestinationPhotos(query: string, signal?: AbortSignal): Promise<UnsplashPhoto[]> {
  const client = getSupabase();
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  const { data: { session } } = await client.auth.getSession();
  const url = new URL(endpoint);
  url.searchParams.set("query", query);
  // The deployed search proxy currently ignores Unsplash's orientation filter.
  // Request more metadata so filtering portraits still leaves up to five choices.
  url.searchParams.set("per_page", "30");
  const response = await fetch(url, {
    signal,
    headers: {
      apikey: publishableKey,
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
  });
  if (!response.ok) throw new Error(`Photo search is unavailable (${response.status}).`);
  const body = await response.json();
  const results = Array.isArray(body) ? body : body.results ?? body.photos ?? body.data?.results ?? [];
  if (!Array.isArray(results)) throw new Error("Photo search returned an unexpected response.");
  const photos: UnsplashPhoto[] = results.flatMap((photo: any) => {
    if (typeof photo?.width !== "number" || typeof photo?.height !== "number" || photo.width <= photo.height) return [];
    if (!photo?.id || !photo?.urls?.regular || !photo?.user?.name || !photo?.user?.links?.html || !photo?.links?.html || !photo?.links?.download_location) return [];
    return [{
      id: photo.id,
      url: photo.urls.regular,
      thumb: photo.urls.small ?? photo.urls.regular,
      alt: photo.alt_description ?? `Photo of ${query}`,
      downloadLocation: photo.links.download_location,
      credit: { name: photo.user.name, profileUrl: credited(photo.user.links.html), photoUrl: credited(photo.links.html) },
    }];
  });
  return photos.length >= 2 ? photos.slice(0, 5) : [];
}

export async function trackUnsplashSelection(downloadLocation: string): Promise<void> {
  const { error } = await getSupabase().functions.invoke("unsplash-track", { body: { downloadLocation } });
  if (error) {
    const response = error.context instanceof Response ? error.context : null;
    const detail = response ? await response.text() : error.message;
    throw new Error(`Could not register this Unsplash photo (${response?.status ?? "network error"}: ${detail}). Please try again.`);
  }
}

export async function uploadTripPhoto(file: File, ownerId: string, tripId: string): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPEG, PNG, or WebP image.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Choose an image under 5 MB.");
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${ownerId}/${tripId}/${crypto.randomUUID()}.${extension}`;
  const client = getSupabase();
  const { error } = await client.storage.from("trip-photos").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(`Could not upload the photo: ${error.message}`);
  return client.storage.from("trip-photos").getPublicUrl(path).data.publicUrl;
}
