import { getSupabase } from "./supabase.ts";

/** A shorter completed-day window, kept separate from the official OKR. */
export interface PreliminaryOkr1Metrics {
  windowStart: string;
  windowEnd: string;
  observedDays: number;
  eligiblePlanners: number;
  consistentPlanners: number;
  retentionPercent: number | null;
  // Includes the partial launch day; today comes from activeToday.
  daily: { date: string; activeUsers: number }[];
}

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
  trend: { date: string; percent: number | null; allUserPercent: number | null }[];
  preliminary?: PreliminaryOkr1Metrics;
}

const counts = ["observedDays", "windowDays", "registeredUsers", "planners", "currentPlanners", "savedTrips", "sharedTrips", "sharingOwners", "acceptedCollaborators", "eligiblePlanners", "consistentPlanners", "eligibleUsers", "consistentUsers", "activeToday", "activeYesterday", "activeInWindow", "newPlanners"] as const;
const isCount = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const isDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value));
const isRate = (value: unknown): boolean => value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100);

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
    || !Array.isArray(value.daily) || value.daily.some(day => !isDate(day.date) || !isCount(day.activeUsers))
    || !Array.isArray(value.trend) || value.trend.some(day => !isDate(day.date) || !isRate(day.percent) || !isRate(day.allUserPercent))) {
    throw new Error("The dashboard returned incomplete data.");
  }
  for (const rate of [value.retentionPercent, value.allUserRetentionPercent]) {
    if (rate !== null && (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0 || rate > 100)) {
      throw new Error("The dashboard returned an invalid percentage.");
    }
  }
  // Optional for compatibility with the previously deployed aggregate endpoint.
  const early = value.preliminary;
  if (early !== undefined && (!early || !isDate(early.windowStart) || !isDate(early.windowEnd)
    || !isCount(early.observedDays) || early.observedDays > value.windowDays
    || !isCount(early.eligiblePlanners) || !isCount(early.consistentPlanners)
    || early.consistentPlanners > early.eligiblePlanners || !isRate(early.retentionPercent)
    || ((early.observedDays < 2 || early.eligiblePlanners === 0) && early.retentionPercent !== null)
    || !Array.isArray(early.daily) || early.daily.some(day => !isDate(day.date) || !isCount(day.activeUsers)))) {
    throw new Error("The dashboard returned incomplete preliminary data.");
  }
  return value;
}

/** Today's activity is useful immediately, but never labels one day as cadence. */
export function okr1Display(data: Okr1Metrics) {
  if (data.retentionPercent !== null) return {
    kind: "official" as const, percent: data.retentionPercent,
    eligible: data.eligiblePlanners, consistent: data.consistentPlanners,
  };
  if (data.preliminary?.retentionPercent !== null && data.preliminary?.retentionPercent !== undefined) return {
    kind: "preliminary" as const, percent: data.preliminary.retentionPercent,
    eligible: data.preliminary.eligiblePlanners, consistent: data.preliminary.consistentPlanners,
  };
  return {
    kind: "today" as const, percent: data.planners > 0 ? 100 * data.activeToday / data.planners : null,
    eligible: data.planners, consistent: data.activeToday,
  };
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
