import { useEffect, useRef } from "react";
import { getSupabase } from "./supabase";
export { canTrackTripPlan } from "./trip-plan-tracking";

/**
 * Record foreground use, never a timer-driven visit. The server authenticates the
 * caller, checks trip access, stamps UTC time and deduplicates account/day records.
 * Failures are deliberately isolated from trip saving and navigation.
 */
export function useTripPlanTracking(enabled: boolean, userId: string, tripId: string | undefined, page: number): void {
  const lastSuccess = useRef({ userId: "", at: 0, day: "" });
  useEffect(() => {
    if (!enabled || !tripId) return;
    const controller = new AbortController();
    let pending = false;
    let retryAfter = 0;
    const record = () => {
      const now = Date.now();
      const day = new Date(now).toISOString().slice(0, 10);
      if (document.visibilityState !== "visible" || pending || now < retryAfter) return;
      const previous = lastSuccess.current;
      if (previous.userId === userId && previous.day === day && now - previous.at < 300_000) return;
      pending = true;
      void (async () => {
        try {
          const { error } = await getSupabase().rpc("record_trip_plan_access", { p_trip: tripId })
            .abortSignal(AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]));
          if (!error && !controller.signal.aborted) lastSuccess.current = { userId, at: Date.now(), day };
        } catch { /* Analytics must never block a user's planning work. */ }
        finally {
          pending = false;
          retryAfter = Date.now() + 30_000;
        }
      })();
    };
    record();
    document.addEventListener("visibilitychange", record);
    window.addEventListener("focus", record);
    document.addEventListener("pointerdown", record, { passive: true });
    document.addEventListener("keydown", record);
    return () => {
      controller.abort();
      document.removeEventListener("visibilitychange", record);
      window.removeEventListener("focus", record);
      document.removeEventListener("pointerdown", record);
      document.removeEventListener("keydown", record);
    };
  }, [enabled, userId, tripId, page]);
}
