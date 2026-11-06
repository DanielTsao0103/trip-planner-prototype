import { useEffect, useState, type RefObject } from "react";
import { tripFromRow } from "./account-trips";
import type { DemoAccount } from "./demo-store";
import type { Store } from "./domain";
import { getSupabase } from "./supabase";
import type { TripSaveQueue } from "./trip-save-queue";

/** Keep the open map and itinerary in sync without replacing unsaved or recovered edits. */
export function useSharedMapSync(
  tripId: string | undefined,
  account: DemoAccount,
  store: RefObject<Store>,
  queue: TripSaveQueue,
  commit: (next: Store) => void,
) {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    setOffline(false);
    if (!tripId) return;
    let active = true,
      fetching = false;
    const refresh = async () => {
      if (fetching || document.hidden || queue.pending.has(tripId)) return;
      fetching = true;
      try {
        const { data, error } = await getSupabase().rpc("read_invited_trip", {
          p_trip: tripId,
        });
        if (!active || queue.pending.has(tripId)) return;
        const latest = store.current;
        if (latest.tripId !== tripId || latest.userId !== account.id) return;
        if (error?.code === "42501") {
          commit({
            ...latest,
            trips: latest.trips.filter((trip) => trip.id !== tripId),
            tripId: null,
          });
          return;
        }
        if (error || data?.tripID !== tripId || !Number.isInteger(data.revision))
          throw new Error("Trip sync unavailable");
        setOffline(false);
        const previous = latest.trips.find((trip) => trip.id === tripId);
        if (!previous || previous.revision! >= data.revision) return;
        const updated = {
          ...tripFromRow(data, account),
          imageSource: previous.imageSource,
          imageCredit: previous.imageCredit,
        };
        commit({
          ...latest,
          trips: latest.trips.map((trip) =>
            trip.id === tripId ? updated : trip,
          ),
        });
      } catch {
        if (active) setOffline(true);
      } finally {
        fetching = false;
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [tripId, account.id, queue]);
  return offline;
}
