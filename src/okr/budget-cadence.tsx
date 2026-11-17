import { useCallback, useEffect, useRef, useState } from "react";
import { getSupabase } from "../supabase";
import { useApp } from "../state";
import { Badge, Button, ErrorBox } from "../ui";
import { dayLabel, formatPercent } from "../okr2";
import { LIVE_REFRESH_MS } from "./ivy-tracker";

type TrendDay = { day: string; eligibleUsers: number; loggingUsers: number; percent: number };
type Metrics = {
  windowStart: string; windowEnd: string; trackingStart: string; observedDays: number; eligibleUsers: number;
  consistentUsers: number; percent: number | null; targetPercent: number; daily: TrendDay[];
};
const timeText = (date: Date) => date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });

/** OKR #3: expense logging by members of active trips. */
export function BudgetCadenceMetrics() {
  const { accountInfo } = useApp();
  const [data, setData] = useState<Metrics | null>(null);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (!accountInfo.cloud) { setError("Sign in to see expense logging metrics."); setData(null); return; }
    setRefreshing(true);
    try {
      const { data: result, error: failure } = await getSupabase().rpc("get_budget_cadence_metrics", { p_days: 14 });
      if (failure) throw failure;
      if (!alive.current) return;
      if (!result || result.targetPercent !== 60 || typeof result.trackingStart !== "string" || !Array.isArray(result.daily)) {
        setData(null);
        setError("Expense logging results aren’t available yet. Please try again shortly.");
        return;
      }
      setData(result as Metrics);
      setError("");
      setUpdatedAt(new Date());
    } catch {
      if (alive.current) setError("Couldn’t refresh the numbers. Showing the last update, and trying again shortly.");
    } finally {
      if (alive.current) setRefreshing(false);
    }
  }, [accountInfo.cloud]);

  useEffect(() => {
    alive.current = true;
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, LIVE_REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive.current = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

  const target = data?.targetPercent ?? 60;
  const fill = Math.min(100, Math.max(0, data?.percent ?? 0));
  const met = !!data && data.eligibleUsers > 0 && data.percent !== null && data.percent >= target;
  return <section className="card account-section okr-live" aria-labelledby="budget-cadence-title" data-testid="okr3">
    <p className="okr-eyebrow">Objective, OKR #3</p>
    <h2 id="budget-cadence-title">Keep trip budgets up to date</h2>
    <p className="okr-kr">Key result: At least {target}% of users in an active trip log an expense at least every other day.</p>
    <ErrorBox text={error} />
    {!data ? !error && <p role="status">Loading the latest numbers…</p> : <>
      <div className="okr-figure" role="status" aria-live="polite">
        <strong data-testid="okr3-percent">{data.percent === null ? "—" : formatPercent(data.percent)}</strong>
        <span>of eligible travelers logged expenses every other day</span>
        <Badge tone={met && data.observedDays >= 14 ? "ok" : ""}>{data.observedDays < 14 ? "Preliminary" : data.eligibleUsers === 0 ? "Collecting data" : met ? "Target met" : "Below target"}</Badge>
      </div>
      <div className="okr-meter" role="progressbar" aria-label="Share of active-trip travelers logging expenses every other day" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fill)}>
        <i style={{ width: `${fill}%` }} /><b style={{ left: `${target}%` }} aria-hidden="true" />
      </div>
      <dl className="okr-stats">
        <div><dt>Travelers meeting cadence</dt><dd data-testid="okr3-consistent">{data.consistentUsers}</dd></div>
        <div><dt>Eligible travelers</dt><dd data-testid="okr3-eligible">{data.eligibleUsers}</dd></div>
        <div><dt>To reach {target}%</dt><dd>{data.eligibleUsers === 0 ? "—" : met ? "None" : `${Math.max(0, Math.ceil(data.eligibleUsers * target / 100) - data.consistentUsers)} more travelers`}</dd></div>
      </dl>
      <ExpenseTrend days={data.daily ?? []} target={target} />
      {data.observedDays < 14 && <p className="okr-note">Preliminary result from {data.observedDays} completed tracking days. The first full 14-day result is still being collected.</p>}
      {data.eligibleUsers === 0 && <p className="okr-note">No travelers have two completed, tracked days in an active trip yet.</p>}
    </>}
    <div className="okr-live-bar">
      <span className="okr-live-dot" aria-hidden="true" />
      <span>{updatedAt ? `Live. Updated ${timeText(updatedAt)}, refreshes every ${LIVE_REFRESH_MS / 1000} seconds.` : "Live. Connecting…"}</span>
      <Button variant="text" onClick={() => void load()} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh now"}</Button>
    </div>
    <p className="okr-note">A logged expense is a new expense saved in the trip Budget by that signed-in traveler. Budget amount changes, expense edits, and trip visits do not count.</p>
    <details><summary>How this is counted</summary><p className="okr-note">For each traveler with at least two completed UTC days in an active trip, every consecutive two-day period of that trip must include a newly logged expense. The result covers up to the last 14 completed UTC days, starting when expense tracking began {data?.trackingStart ?? "—"}. The chart shows each day’s completed two-day period; today is still in progress.</p></details>
  </section>;
}

function ExpenseTrend({ days, target }: { days: TrendDay[]; target: number }) {
  const [activeDay, setActiveDay] = useState<string | null>(null);
  if (!days.length) return <div className="okr-trend"><h3>Last 14 days</h3><p className="okr-note">The trend appears after two complete tracking days.</p></div>;
  const width = 640, height = 220, left = 40, right = 16, top = 14, bottom = 28;
  const x = (index: number) => left + (days.length < 2 ? (width - left - right) / 2 : index * (width - left - right) / (days.length - 1));
  const y = (percent: number) => top + (100 - percent) * (height - top - bottom) / 100;
  const shown = days.find(day => day.day === activeDay) ?? days[days.length - 1];
  return <div className="okr-trend" data-testid="okr3-trend">
    <h3>Last 14 days</h3>
    <p className="okr-note">Daily share of eligible travelers who logged an expense within that two-day period.</p>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Expense logging cadence by completed two-day period">
      {[0, 25, 50, 75, 100].map(tick => <g key={tick}><line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className="okr-grid" /><text x={left - 6} y={y(tick) + 4} textAnchor="end" className="okr-axis">{tick}%</text></g>)}
      <line x1={left} x2={width - right} y1={y(target)} y2={y(target)} className="okr-target" />
      <text x={width - right} y={y(target) - 5} textAnchor="end" className="okr-axis">Target {target}%</text>
      {days.length > 1 && <polyline points={days.map((day, index) => `${x(index)},${y(day.percent)}`).join(" ")} className="okr-line" />}
      {days.map((day, index) => <g key={day.day}>
        <circle cx={x(index)} cy={y(day.percent)} r={activeDay === day.day ? 5 : 3.5} className="okr-dot" tabIndex={0} role="img" aria-label={`${dayLabel(day.day)}: ${formatPercent(day.percent)}, ${day.loggingUsers} of ${day.eligibleUsers} travelers`} onMouseEnter={() => setActiveDay(day.day)} onMouseLeave={() => setActiveDay(null)} onFocus={() => setActiveDay(day.day)} onBlur={() => setActiveDay(null)} />
        {(index === 0 || index === days.length - 1) && <text x={x(index)} y={height - 8} textAnchor={index === 0 && days.length > 1 ? "start" : "end"} className="okr-axis">{dayLabel(day.day)}</text>}
      </g>)}
    </svg>
    <p className="okr-readout" aria-live="polite">{dayLabel(shown.day)}: {formatPercent(shown.percent)} ({shown.loggingUsers} of {shown.eligibleUsers} travelers)</p>
    <details><summary>Show as a table</summary><table className="okr-table"><thead><tr><th>Day ending</th><th>Travelers logging</th><th>Eligible travelers</th><th>Share</th></tr></thead><tbody>{days.map(day => <tr key={day.day}><td>{dayLabel(day.day)}</td><td>{day.loggingUsers}</td><td>{day.eligibleUsers}</td><td>{formatPercent(day.percent)}</td></tr>)}</tbody></table></details>
  </div>;
}
