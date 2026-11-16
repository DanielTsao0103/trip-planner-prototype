import { useEffect, useRef, useState } from "react";
import { parseEstimate, routeWaypoint, TRAVEL_MODES, type RouteLocation, type TravelEstimate, type TravelMode } from "./today-guide";

export type RouteResult = { estimate: TravelEstimate | null; error: string; checkedAt?: Date };
export type RouteRequest = { id: string; origin: RouteLocation; destination: RouteLocation; departure: string; mode: TravelMode };
const requestKey = ({ origin, destination, departure, mode }: RouteRequest) => JSON.stringify([routeWaypoint(origin), routeWaypoint(destination), mode === "TRANSIT" ? departure : "", mode]);

/** Keep estimates only for this mounted view. Never persist provider responses or use a paid-key fallback. */
export function useRouteEstimates(requests: RouteRequest[]) {
  const quotaError = useRef("");
  const cache = useRef(new Map<string, RouteResult>());
  const [attempt, setAttempt] = useState(0);
  const [revision, setRevision] = useState(0);
  const signature = JSON.stringify(requests);
  useEffect(() => {
    const controller = new AbortController();
    const pending = [...new Map(requests.map(request => [requestKey(request), request])).values()].filter(request => !cache.current.has(requestKey(request)));
    let cursor = 0;
    const worker = async () => {
      while (cursor < pending.length && !controller.signal.aborted) {
        const request = pending[cursor++];
        const result = quotaError.current ? { estimate: null, error: quotaError.current } : await fetchEstimate(request, controller.signal);
        if (controller.signal.aborted) return;
        if (result.error.includes("limit has been reached")) quotaError.current = result.error;
        cache.current.set(requestKey(request), result);
        setRevision(value => value + 1);
      }
    };
    // A long itinerary must not launch three provider requests for every stop at once.
    void Promise.all(Array.from({ length: Math.min(3, pending.length) }, worker));
    return () => controller.abort();
  }, [signature, attempt]);
  void revision;
  const results: Record<string, RouteResult | undefined> = {};
  for (const request of requests) results[request.id] = cache.current.get(requestKey(request));
  return { results, quotaReached: Boolean(quotaError.current), loading: requests.some(request => !results[request.id]), retry: () => { quotaError.current = ""; cache.current.clear(); setAttempt(value => value + 1); } };
}

async function fetchEstimate(request: RouteRequest, parent: AbortSignal): Promise<RouteResult> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  parent.addEventListener("abort", cancel, { once: true });
  const timer = window.setTimeout(cancel, 10000);
  try {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_DEMO_API_KEY?.trim();
    if (!apiKey) throw new Error("Route estimates are unavailable. You can still open directions.");
    const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.warnings" },
      body: JSON.stringify({ origin: routeWaypoint(request.origin), destination: routeWaypoint(request.destination), travelMode: request.mode,
        ...(request.mode === "TRANSIT" ? { departureTime: request.departure } : {}), ...(request.mode === "DRIVE" ? { routingPreference: "TRAFFIC_UNAWARE" } : {}) }),
    });
    if (!response.ok) throw new Error(response.status === 429 ? "Today's route estimate limit has been reached. Open directions for current times." : "Route estimates couldn't load. Open directions or try again.");
    const estimate = parseEstimate(await response.json(), request.mode);
    return { estimate, error: estimate ? "" : "No route estimate available for this option.", checkedAt: new Date() };
  } catch (error) {
    return { estimate: null, error: controller.signal.aborted ? "Route estimates took too long. Open directions or try again." : error instanceof TypeError ? "Couldn't connect for route estimates. Open directions or try again." : error instanceof Error ? error.message : "Route estimates couldn't load." };
  } finally { clearTimeout(timer); parent.removeEventListener("abort", cancel); }
}

/** The next-stop comparison continues to load all three modes; later connections load only their choice. */
export function useTravelRoutes(origin: RouteLocation | undefined, destination: RouteLocation | undefined, departure: string) {
  const routes = useRouteEstimates(origin && destination ? TRAVEL_MODES.map(mode => ({ id: mode, origin, destination, departure, mode })) : []);
  const results: Partial<Record<TravelMode, RouteResult>> = routes.results;
  const checkedAt = TRAVEL_MODES.map(mode => results[mode]?.checkedAt).find(value => value != null);
  return { ...routes, results, checkedAt };
}
