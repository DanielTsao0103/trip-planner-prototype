import { useEffect, useState } from "react";
import { RefreshCw, Target } from "lucide-react";
import { Badge, Button } from "../ui";
import { fetchOkr1Metrics, okr1Display, type Okr1Metrics } from "../okr1";
import { OkrTrackerShell } from "./okr-shell";
import "./daniel-tracker.css";
import { BudgetOkrTracker } from "./budget-tracker";
import { DailyActivity, PercentRing, ReturnTrend } from "./daniel-charts";

const dateLabel = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const countLabel = (count: number) => count.toLocaleString("en-US");

/** Mount data fetching inside the gate: denied and demo users never request metrics. */
export function DanielOkrTracker() {
  return <OkrTrackerShell owner="Daniel"><DanielDashboard /><BudgetOkrTracker /></OkrTrackerShell>;
}

function DanielDashboard() {
  // Keep the confirmed OKR denominator and observation window fixed.
  const days = 14;
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<Okr1Metrics | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [updated, setUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError("");
    void fetchOkr1Metrics(days, controller.signal).then(next => {
      if (!controller.signal.aborted) { setData(next); setUpdated(new Date()); }
    }).catch((reason: Error) => {
      if (!controller.signal.aborted) { setData(null); setError(reason.message); }
    }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [days, refresh]);

  useEffect(() => {
    const refreshVisible = () => { if (document.visibilityState === "visible") setRefresh(value => value + 1); };
    const timer = window.setInterval(refreshVisible, 60_000);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refreshVisible); };
  }, []);

  const display = data ? okr1Display(data) : null;
  const preliminary = display?.kind !== "official";
  const todayOnly = display?.kind === "today";
  const percent = display?.percent ?? null;
  const eligible = display?.eligible ?? 0;
  const consistent = display?.consistent ?? 0;
  const met = percent !== null && percent >= 85;
  const remaining = Math.max(0, Math.ceil(eligible * .85) - consistent);


  return <div className="daniel-dashboard" data-testid="okr1">
    <section className="okr1-objective-copy" aria-labelledby="okr1-title">
      <span className="okr-eyebrow">OKR #1</span>
      <h2 id="okr1-title">Help trip planners save and share trips with friends</h2>
      <p className="okr1-key-result"><strong>85% of users</strong> access their trip plan at least every other day.</p>
    </section>

    {error && <section className="card okr1-error" role="alert"><h2>Dashboard unavailable</h2><p>{error}</p><Button onClick={() => setRefresh(value => value + 1)}>Retry dashboard</Button></section>}
    {busy && !error && !data && <p role="status">Loading trip-plan access…</p>}
    {data && <>
      <div className="okr1-controls">
        <div className="okr1-period"><Target size={16} aria-hidden="true" />{preliminary
          ? `Preliminary · ${data.observedDays} of ${days} complete days collected · UTC`
          : `${dateLabel(data.windowStart)} – ${dateLabel(data.windowEnd)} · ${days} completed days · UTC`}</div>
        <Button variant="outline" disabled={busy} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={16} aria-hidden="true" />{busy ? "Refreshing…" : "Refresh data"}</Button>
      </div>

      <section className="okr1-focused-overview" aria-label="OKR progress">
        <section className="card okr1-visual-card okr1-primary-chart" aria-labelledby="okr1-return-title">
          <div className="okr1-section-head"><h2 id="okr1-return-title">{todayOnly ? "Plan access today" : "Every-other-day access"}</h2>{!todayOnly && <span className="okr1-target-key">Goal 85%</span>}</div>
          <PercentRing value={percent} label={todayOnly ? "of trip planners today" : "of eligible users"} target={todayOnly ? undefined : 85} primary />
          <Badge tone={!preliminary && met ? "ok" : ""}>{preliminary ? "Preliminary" : met ? "Target met" : "Below target"}</Badge>
          {todayOnly ? <>
            <p><strong>{countLabel(consistent)} of {countLabel(eligible)}</strong> trip planners opened a saved plan today.</p>
            <p className="okr1-support">Today is still in progress. This is daily activity; an every-other-day rate needs at least two complete days with eligible users.</p>
          </> : preliminary ? <>
            <p><strong>{countLabel(consistent)} of {countLabel(eligible)}</strong> eligible users accessed their plan at least every other day across {data.preliminary!.observedDays} complete days.</p>
            <p className="okr1-support">{dateLabel(data.preliminary!.windowStart)} – {dateLabel(data.preliminary!.windowEnd)} · Early result, not the official 14-day score.</p>
          </> : <>
            <p><strong>{countLabel(consistent)} of {countLabel(eligible)}</strong> eligible users accessed their plan at least every other day.</p>
            {!met && <p className="okr1-support">{countLabel(remaining)} more users need to meet this cadence to reach 85%.</p>}
          </>}
          {preliminary && <p className="okr1-support">Official 14-day result: collecting baseline.</p>}
        </section>
        {preliminary
          ? <DailyActivity data={{...data, daily: data.preliminary?.daily ?? data.daily}} preliminary />
          : <ReturnTrend data={data} allAccounts={false} />}
      </section>

      <details className="card okr1-method"><summary>How this is measured</summary>
        <p>Users who have saved a trip or accepted a shared trip qualify after a full 14-day observation period. Inactive users stay included, even after losing trip access.</p>
        <p>Every other day means no two consecutive days without opening a saved trip plan. We measure the last 14 completed UTC days; today is excluded.</p>
        <p>Preliminary cadence uses the available complete days, up to 14, and users enrolled before that shorter period began. Before two complete days are available, we show today’s activity percentage instead. Activity charts include the partial launch day and today; neither enters the cadence calculation.</p>
        <p>Tracking began {dateLabel(data.trackingStartedAt)}. Historical visits are unavailable; sample trips and background refreshes do not count.</p>
      </details>
      <p className="okr1-updated" role="status">{updated ? `Updated ${updated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} · Refreshes every minute` : ""}</p>
    </>}
  </div>;
}
