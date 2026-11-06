import { useEffect, useState, type RefObject } from "react";
import { loadAccountTrips, tripFromRow } from "./account-trips";
import type { DemoAccount } from "./demo-store";
import type { Store } from "./domain";
import { getSupabase } from "./supabase";
import type { TripSaveQueue } from "./trip-save-queue";

/** Follow database changes on every account screen, including invitations and deletions. */
export function useAccountTripSync(
  enabled: boolean,
  account: DemoAccount,
  store: RefObject<Store>,
  queue: TripSaveQueue,
  commit: (next: Store) => void,
) {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    setOffline(false);
    if (!enabled) return;
    let active = true,
      fetching = false;
    const refresh = async () => {
      if (fetching || document.hidden) return;
      fetching = true;
      const before = new Map(
        store.current.trips.map((t) => [t.id, t.revision]),
      );
      const pendingAtStart = new Set(queue.pending.keys());
      try {
        const rows = await loadAccountTrips(getSupabase(), account.id);
        if (!active) return;
        setOffline(false);
        const latest = store.current;
        const remote = new Map(rows.map((r) => [r.tripID, r]));
        const local = new Set(latest.trips.map((t) => t.id));
        let changed = false;
        const trips = latest.trips.flatMap((t) => {
          if (
            t.persistence !== "account" ||
            queue.pending.has(t.id) ||
            pendingAtStart.has(t.id) ||
            !before.has(t.id) ||
            before.get(t.id) !== t.revision
          )
            return [t];
          const row = remote.get(t.id);
          if (row && row.revision <= (t.revision ?? 0)) return [t];
          changed = true;
          return row ? [tripFromRow(row, account)] : [];
        });
        for (const row of rows) {
          // Don't resurrect a trip deleted locally while the read was in flight.
          if (
            local.has(row.tripID) ||
            before.has(row.tripID) ||
            pendingAtStart.has(row.tripID)
          )
            continue;
          trips.push(tripFromRow(row, account));
          changed = true;
        }
        if (changed)
          commit({
            ...latest,
            trips,
            tripId: trips.some((t) => t.id === latest.tripId)
              ? latest.tripId
              : null,
          });
      } catch {
        if (active) setOffline(true);
      } finally {
        fetching = false;
      }
    };
    const timer = window.setInterval(refresh, 5000);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [enabled, account.id, queue]);
  return offline;
}
