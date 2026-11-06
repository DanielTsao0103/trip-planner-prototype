import { useEffect, useRef, useState } from "react";
import { canEdit, type Event, type Trip } from "./domain";
import { geocodeItineraryPlace } from "./itinerary-geocoding";

type Result = Awaited<ReturnType<typeof geocodeItineraryPlace>>;
type Lookup = {
  key: string;
  id: string;
  address: string;
  placeId?: string | null;
  editable: boolean;
};

/** Display pins for every traveler. Editors persist just the Google place ID
 * using the existing trip save queue, in one guarded write for the batch. */
export function useItineraryPins(
  trip: Trip | undefined,
  user: string | null,
  ready: boolean,
  updateTrip: (change: (t: Trip) => void) => void,
) {
  const [results, setResults] = useState<Record<string, Result | "error">>({});
  const [retry, setRetry] = useState(0);
  const requests = useRef(new Map<string, Promise<Result>>());
  const writer = useRef(updateTrip);
  writer.current = updateTrip;
  const destinations = trip?.destinations ?? [];
  const keyFor = (event: Pick<Event, "place" | "googlePlaceId">) =>
    JSON.stringify([
      trip?.id,
      destinations,
      event.place,
      event.googlePlaceId || "",
    ]);
  const jobs: Lookup[] = (trip?.events ?? [])
    .filter((e) => !e.point && e.place.trim())
    .map((e) => ({
      key: keyFor(e),
      id: e.id,
      address: e.place,
      placeId: e.googlePlaceId,
      editable: canEdit(trip!, user, e.date),
    }));
  const jobKey = JSON.stringify(jobs);
  useEffect(() => {
    if (!ready || !jobs.length) return;
    let active = true;
    async function resolveAll() {
      const changes = new Map<string, { job: Lookup; placeId: string }>();
      let service: google.maps.Geocoder | undefined;
      for (const job of jobs) {
        if (!active) return;
        try {
          let request = requests.current.get(job.key);
          if (!request) {
            const { Geocoder } = (await google.maps.importLibrary(
              "geocoding",
            )) as google.maps.GeocodingLibrary;
            if (!active) return;
            service ??= new Geocoder();
            request = geocodeItineraryPlace(
              service.geocode.bind(service),
              job.address,
              destinations,
              job.placeId,
            );
            requests.current.set(job.key, request);
          }
          const match = await request;
          if (!active) return;
          setResults((prev) =>
            prev[job.key] === match ? prev : { ...prev, [job.key]: match },
          );
          if (match && job.editable && job.placeId !== match.placeId) {
            const savedKey = keyFor({
              place: job.address,
              googlePlaceId: match.placeId,
            });
            requests.current.set(savedKey, Promise.resolve(match));
            setResults((prev) => ({ ...prev, [savedKey]: match }));
            changes.set(job.id, { job, placeId: match.placeId });
          }
        } catch {
          if (!active) return;
          setResults((prev) => ({ ...prev, [job.key]: "error" }));
        }
      }
      if (active && changes.size)
        writer.current((draft) => {
          if (draft.id !== trip?.id) return;
          for (const event of draft.events) {
            const change = changes.get(event.id);
            if (
              change &&
              !event.point &&
              event.place === change.job.address &&
              event.googlePlaceId === change.job.placeId &&
              canEdit(draft, user, event.date)
            )
              event.googlePlaceId = change.placeId;
          }
        });
    }
    void resolveAll();
    return () => {
      active = false;
    };
  }, [ready, jobKey, retry]);

  function retryLookup(event: Event) {
    const key = keyFor(event);
    requests.current.delete(key);
    setResults((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setRetry((n) => n + 1);
  }
  const events = (trip?.events ?? []).map((event) => {
    const match = results[keyFor(event)];
    return !event.point && match && match !== "error"
      ? { ...event, point: match.point }
      : event;
  });
  return {
    events,
    retryLookup,
    statusFor: (event: Event) => results[keyFor(event)],
  };
}
