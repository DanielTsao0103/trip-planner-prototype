import { getSupabase } from "./supabase.ts";

/** Aggregate-only response: no traveler names, email addresses or trip content. */
export interface Okr1Metrics {
  trackingStartedAt: string;
  windowStart: string;
  windowEnd: string;
  observedDays: number;
  windowDays: number;
  targetPercent: number;
  registeredUsers: number;
  planners: number;
  currentPlanners: number;
  savedTrips: number;
  sharedTrips: number;
  sharingOwners: number;
  acceptedCollaborators: number;
  eligiblePlanners: number;
  consistentPlanners: number;
  eligibleUsers: number;
  consistentUsers: number;
  retentionPercent: number | null;
  allUserRetentionPercent: number | null;
  activeToday: number;
  activeYesterday: number;
  activeInWindow: number;
  newPlanners: number;
  lastActivityAt: string | null;
  daily: { date: string; activeUsers: number }[];
}

const counts = ["observedDays", "windowDays", "registeredUsers", "planners", "currentPlanners", "savedTrips", "sharedTrips", "sharingOwners", "acceptedCollaborators", "eligiblePlanners", "consistentPlanners", "eligibleUsers", "consistentUsers", "activeToday", "activeYesterday", "activeInWindow", "newPlanners"] as const;
const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const isDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value));

/** Fail closed on malformed data instead of presenting a misleading KPI. */
export function parseOkr1Metrics(raw: unknown): Okr1Metrics {
  if (!raw || typeof raw !== "object") throw new Error("The dashboard returned incomplete data.");
  const value = raw as Okr1Metrics;
  if (counts.some(key => !isCount(value[key])) || ![7, 14, 30].includes(value.windowDays)
    || value.observedDays > value.windowDays || value.targetPercent !== 85
    || !isDate(value.windowStart) || !isDate(value.windowEnd)
    || typeof value.trackingStartedAt !== "string" || !Number.isFinite(Date.parse(value.trackingStartedAt))
    || (value.lastActivityAt !== null && (typeof value.lastActivityAt !== "string" || !Number.isFinite(Date.parse(value.lastActivityAt))))
    || value.consistentPlanners > value.eligiblePlanners || value.consistentUsers > value.eligibleUsers
    || !Array.isArray(value.daily) || value.daily.some(day => !isDate(day.date) || !isCount(day.activeUsers))) {
    throw new Error("The dashboard returned incomplete data.");
  }
  for (const rate of [value.retentionPercent, value.allUserRetentionPercent]) {
    if (rate !== null && (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0 || rate > 100)) {
      throw new Error("The dashboard returned an invalid percentage.");
    }
  }
  return value;
}

/** Only the database's current admin decision may authorize this report. */
export async function fetchOkr1Metrics(days: number, signal: AbortSignal): Promise<Okr1Metrics> {
  const { data, error } = await getSupabase().rpc("get_daniel_okr_metrics", { p_days: days })
    .abortSignal(AbortSignal.any([signal, AbortSignal.timeout(15_000)]));
  if (error) throw new Error("Couldn’t load the dashboard. Check your connection and admin access, then retry.");
  return parseOkr1Metrics(data);
}

export function formatOkrPercent(value: number | null): string {
  return value === null ? "—" : `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
}
