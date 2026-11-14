import { useEffect, useState } from "react";
import { parseEstimate, routeWaypoint, TRAVEL_MODES, type RouteLocation, type TravelEstimate, type TravelMode } from "./today-guide";

export type RouteResult = { estimate: TravelEstimate | null; error: string };
type Results = Partial<Record<TravelMode, RouteResult>>;

/** No persistent cache and no paid-key fallback. Each panel owns its short-lived results. */
export function useTravelRoutes(origin: RouteLocation | undefined, destination: RouteLocation | undefined, departure: string) {
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([origin, destination, departure, attempt]);
  const [state, setState] = useState<{ key: string; loading: boolean; results: Results; checkedAt?: Date }>({ key: "", loading: false, results: {} });
  useEffect(() => {
    if (!origin || !destination) return;
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_DEMO_API_KEY?.trim();
    const controller = new AbortController();
    let active = true;
    setState({ key, loading: true, results: {} });
    const timer = window.setTimeout(() => controller.abort(), 10000);
    const run = async () => {
      const entries = await Promise.all(TRAVEL_MODES.map(async mode => {
        let result: RouteResult;
        try {
          if (!apiKey) throw new Error("Route estimates are unavailable. You can still open directions.");
          const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
            method: "POST", signal: controller.signal,
            headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.warnings" },
            body: JSON.stringify({ origin: routeWaypoint(origin), destination: routeWaypoint(destination), travelMode: mode,
              ...(mode === "TRANSIT" ? { departureTime: departure } : {}), ...(mode === "DRIVE" ? { routingPreference: "TRAFFIC_UNAWARE" } : {}) }),
          });
          if (!response.ok) throw new Error(response.status === 429 ? "Today's route estimate limit has been reached. Open directions for current times." : "Route estimates couldn't load. Open directions or try again.");
          const estimate = parseEstimate(await response.json(), mode);
          result = { estimate, error: estimate ? "" : "No route estimate available for this option." };
        } catch (error) {
          result = { estimate: null, error: controller.signal.aborted ? "Route estimates took too long. Open directions or try again." : error instanceof Error ? error.message : "Route estimates couldn't load." };
        }
        return [mode, result] as const;
      }));
      clearTimeout(timer);
      if (active) setState({ key, loading: false, results: Object.fromEntries(entries), checkedAt: new Date() });
    };
    void run();
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [key]);
  // Do not display the previous origin's estimates during the render before effect cleanup.
  const current = state.key === key ? state : { loading: Boolean(origin && destination), results: {} as Results, checkedAt: undefined };
  return { ...current, retry: () => setAttempt(value => value + 1) };
}
