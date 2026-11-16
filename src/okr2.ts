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

export type HistoryRow = { day: string; totalTrips: number; sharedTrips: number; estimate: boolean };
export type HistoryPoint = HistoryRow & { percent: number };

/** Admin only. Last 14 days that have a record, oldest first. */
export async function fetchSharingHistory(): Promise<HistoryRow[]> {
  const { data, error } = await getSupabase().rpc("okr2_history");
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data : []).map((r: { day: string; total_trips: number; shared_trips: number; is_estimate?: boolean }) => ({
    day: String(r.day),
    totalTrips: Number(r.total_trips),
    sharedTrips: Number(r.shared_trips),
    estimate: r.is_estimate === true,
  }));
}

export function historyPoints(rows: HistoryRow[]): HistoryPoint[] {
  return [...rows]
    .sort((a, b) => a.day.localeCompare(b.day))
    .map((r) => ({ ...r, percent: sharingProgress({ totalTrips: r.totalTrips, sharedTrips: r.sharedTrips }).percent }));
}

/** Change in percentage points from the first to the last recorded day, or null with fewer than two days. */
export function trendChange(points: HistoryPoint[]): number | null {
  if (points.length < 2) return null;
  return points[points.length - 1].percent - points[0].percent;
}

/** "2026-11-15" as "Nov 15" without time zone shifts. */
export function dayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
