import { getSupabase } from "./supabase.ts";

/** OKR #2: help trip planners save and share trips with friends. Key result: 75% of trips have more than one account. */
export const OKR2_TARGET_PERCENT = 75;

export type SharingStats = { totalTrips: number; sharedTrips: number };

export type SharingProgress = {
  totalTrips: number;
  sharedTrips: number;
  /** Whole-number-friendly share of trips with more than one account, 0 when there are no trips. */
  percent: number;
  targetPercent: number;
  met: boolean;
  /** How many more trips need a second account to reach the target at today's trip count (0 once met). */
  tripsToTarget: number;
};

export function sharingProgress(stats: SharingStats, targetPercent = OKR2_TARGET_PERCENT): SharingProgress {
  const total = Math.max(0, Math.floor(stats.totalTrips));
  const shared = Math.min(total, Math.max(0, Math.floor(stats.sharedTrips)));
  const percent = total === 0 ? 0 : (shared / total) * 100;
  const needed = Math.ceil((total * targetPercent) / 100);
  return {
    totalTrips: total,
    sharedTrips: shared,
    percent,
    targetPercent,
    met: total > 0 && shared >= needed,
    tripsToTarget: Math.max(0, needed - shared),
  };
}

export function formatPercent(percent: number): string {
  return `${Math.round(percent * 10) / 10}%`;
}

/** Admin only: the database refuses anyone else. Returns counts, never trip details. */
export async function fetchSharingStats(): Promise<SharingStats> {
  const { data, error } = await getSupabase().rpc("okr2_sharing_stats");
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return { totalTrips: Number(row?.total_trips ?? 0), sharedTrips: Number(row?.shared_trips ?? 0) };
}
