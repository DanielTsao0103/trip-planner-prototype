/** The browser key and map ID come from the same settings used by the Pages build. */
const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
export const mapId =
  import.meta.env.VITE_GOOGLE_MAP_ID?.trim() || "DEMO_MAP_ID";
export const authFailureEvent = "trip-google-maps-auth-failure";
let loading: Promise<void> | undefined;
let authFailed = false;

export function loadGoogleMaps(): Promise<void> {
  if (authFailed)
    return Promise.reject(
      new Error("Google Maps declined this site's map key."),
    );
  if (typeof window.google?.maps?.importLibrary === "function")
    return Promise.resolve();
  if (!apiKey)
    return Promise.reject(
      new Error("The Google Maps browser key is missing from this build."),
    );
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const callbacks = window as Window & {
      tripGoogleMapsReady?: () => void;
      gm_authFailure?: () => void;
    };
    const script = document.createElement("script");
    const fail = () => {
      clearTimeout(timer);
      script.remove();
      delete callbacks.tripGoogleMapsReady;
      reject(
        new Error(
          "Google Maps could not connect. Check your connection and retry.",
        ),
      );
    };
    const timer = window.setTimeout(fail, 15000);
    callbacks.gm_authFailure = () => {
      authFailed = true;
      clearTimeout(timer);
      reject(new Error("Google Maps declined this site's map key."));
      window.dispatchEvent(new Event(authFailureEvent));
    };
    callbacks.tripGoogleMapsReady = () => {
      clearTimeout(timer);
      delete callbacks.tripGoogleMapsReady;
      resolve();
    };
    script.async = true;
    script.onerror = fail;
    script.src =
      "https://maps.googleapis.com/maps/api/js?" +
      new URLSearchParams({
        key: apiKey,
        v: "weekly",
        loading: "async",
        libraries: "marker",
        callback: "tripGoogleMapsReady",
      });
    document.head.appendChild(script);
  }).catch((error) => {
    loading = undefined;
    throw error;
  });
  return loading;
}
