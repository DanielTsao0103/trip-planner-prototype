import { getSupabase } from "./supabase";
import { validatePhoto } from "./image-validation";

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
  }).catch((error) => {
    if (signal?.aborted) throw error;
    throw new Error("Photos couldn’t load. Check your connection and try again, or upload your own.");
  });
  if (!response.ok) throw new Error("Photos couldn’t load. Try again in a moment, or upload your own.");
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
    throw new Error("That photo couldn’t be selected. Try again or choose another.");
  }
}

export async function uploadTripPhoto(file: File, ownerId: string, tripId: string): Promise<string> {
  await validatePhoto(file);
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${ownerId}/${tripId}/${crypto.randomUUID()}.${extension}`;
  const client = getSupabase();
  const { error } = await client.storage.from("trip-photos").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error("Your photo couldn’t upload. Check your connection and try again.");
  return client.storage.from("trip-photos").getPublicUrl(path).data.publicUrl;
}
