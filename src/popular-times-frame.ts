import "./place-popular-times.css";

type ChartRequest = { place: string; googlePlaceId?: string | null; destinations: string[] };
const root = document.querySelector<HTMLElement>("#popular-times-root")!;
let started = false;

function send(type: string, fields: Record<string, unknown>): void {
  window.parent.postMessage({ type, ...fields }, window.location.origin);
}

/** This document has its own Google SDK so it can never reuse the paid map key. */
async function loadDemoMaps(): Promise<void> {
  if (typeof window.google?.maps?.importLibrary === "function") return;
  const key = import.meta.env.VITE_GOOGLE_MAPS_DEMO_API_KEY?.trim();
  if (!key) throw new Error("The no-billing Maps demo key is not configured.");
  await new Promise<void>((resolve, reject) => {
    const callbacks = window as Window & { popularTimesReady?: () => void; gm_authFailure?: () => void };
    callbacks.popularTimesReady = () => { delete callbacks.popularTimesReady; resolve(); };
    callbacks.gm_authFailure = () => {
      reject(new Error("Google declined the demo key."));
      send("trip-popular-times:status", { status: "error" });
    };
    const script = document.createElement("script");
    script.async = true;
    script.onerror = () => reject(new Error("Google could not connect."));
    script.src = "https://maps.googleapis.com/maps/api/js?" + new URLSearchParams({
      key, v: "weekly", loading: "async", callback: "popularTimesReady",
    });
    document.head.append(script);
  });
}

/** Use supported demo-key Places search rather than billable legacy geocoding. */
async function findPlaceId(places: google.maps.PlacesLibrary, request: ChartRequest): Promise<string | undefined> {
  if (request.googlePlaceId) return request.googlePlaceId;
  const place = request.place.trim();
  const hasGeography = /[,，]/u.test(place) || request.destinations.some(stop =>
    place.toLowerCase().includes(stop.split(",")[0].trim().toLowerCase()));
  const queries = hasGeography || !request.destinations.length
    ? [place] : [...new Set(request.destinations)].map(stop => `${place}, ${stop}`);
  const ids = new Set<string>();
  for (const textQuery of queries) {
    const result = await places.Place.searchByText({ textQuery, fields: ["id"], maxResultCount: 1 });
    if (result.places[0]?.id) ids.add(result.places[0].id);
  }
  // A short venue name matching different trip cities needs a clearer location.
  return ids.size === 1 ? [...ids][0] : undefined;
}

async function render(request: ChartRequest): Promise<void> {
  try {
    await loadDemoMaps();
    const places = await google.maps.importLibrary("places") as google.maps.PlacesLibrary;
    if (!customElements.get("gmp-place-popular-times")) throw new Error("Chart unavailable.");
    const id = await findPlaceId(places, request);
    if (!id) { send("trip-popular-times:status", { status: "unresolved" }); return; }
    const details = new places.PlaceDetailsElement();
    const place = new places.PlaceDetailsPlaceRequestElement();
    place.place = id;
    // The SDK includes this element before the installed TypeScript definitions.
    const popular = document.createElement("gmp-place-popular-times") as HTMLElement & { readonly rendered?: boolean };
    details.append(place, document.createElement("gmp-place-name"), popular);
    details.addEventListener("gmp-load", () => {
      send("trip-popular-times:status", { status: popular.rendered ? "ready" : "empty" });
    }, { once: true });
    const failed = () => send("trip-popular-times:status", { status: "error" });
    details.addEventListener("gmp-error", failed, { once: true });
    details.addEventListener("gmp-requesterror", failed, { once: true });
    root.append(details);
  } catch {
    send("trip-popular-times:status", { status: "error" });
  }
}

window.addEventListener("message", event => {
  if (event.origin !== location.origin || event.source !== window.parent) return;
  const data = event.data;
  if (data?.type === "trip-popular-times:theme" && typeof data.values === "object" && data.values) {
    for (const name of ["--paper", "--ink", "--muted", "--green", "--action-ink", "--line"]) {
      if (typeof data.values[name] === "string") document.documentElement.style.setProperty(name, data.values[name]);
    }
    document.documentElement.style.colorScheme = data.colorScheme === "dark" ? "dark" : "light";
  }
  if (data?.type !== "trip-popular-times:init" || started || typeof data.place !== "string"
    || !data.place.trim() || !Array.isArray(data.destinations) || !data.destinations.every((s: unknown) => typeof s === "string")
    || (data.googlePlaceId != null && typeof data.googlePlaceId !== "string")) return;
  started = true;
  void render(data);
});

new ResizeObserver(() => send("trip-popular-times:resize", {
  height: Math.ceil(root.getBoundingClientRect().height),
})).observe(root);
