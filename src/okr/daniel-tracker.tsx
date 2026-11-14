import { useEffect, useState } from "react";
import { RefreshCw, Target } from "lucide-react";
import { Badge, Button } from "../ui";
import { fetchOkr1Metrics, formatOkrPercent, type Okr1Metrics } from "../okr1";
import { OkrTrackerShell } from "./okr-shell";
import "./daniel-tracker.css";
import { DailyActivity, PercentRing, ReturnTrend, sharePercent } from "./daniel-charts";

const dateLabel = (date: string) => new Date(`${date.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const countLabel = (count: number) => count.toLocaleString("en-US");

/** Mount data fetching inside the gate: denied and demo users never request metrics. */
export function DanielOkrTracker() {
  return <OkrTrackerShell owner="Daniel"><DanielDashboard /></OkrTrackerShell>;
}

function DanielDashboard() {
  const [days, setDays] = useState(14);
  const [cohort, setCohort] = useState<"planners" | "all">("planners");
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<Okr1Metrics | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [updated, setUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setData(null);
    setError("");
    void fetchOkr1Metrics(days, controller.signal).then(next => {
      if (!controller.signal.aborted) { setData(next); setUpdated(new Date()); }
    }).catch((reason: Error) => {
      if (!controller.signal.aborted) setError(reason.message);
    }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [days, refresh]);

  useEffect(() => {
    const refreshVisible = () => { if (document.visibilityState === "visible") setRefresh(value => value + 1); };
    const timer = window.setInterval(refreshVisible, 60_000);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refreshVisible); };
  }, []);

  const percent = data ? (cohort === "planners" ? data.retentionPercent : data.allUserRetentionPercent) : null;
  const eligible = data ? (cohort === "planners" ? data.eligiblePlanners : data.eligibleUsers) : 0;
  const consistent = data ? (cohort === "planners" ? data.consistentPlanners : data.consistentUsers) : 0;
  const met = percent !== null && percent >= 85;
  const remaining = Math.max(0, Math.ceil(eligible * .85) - consistent);


  return <div className="daniel-dashboard" data-testid="okr1">
    <div className="okr1-controls">
      <div className="okr1-filters">
        <label>Measurement period<select value={days} onChange={event => setDays(Number(event.target.value))}>
          <option value={7}>Last 7 completed days</option><option value={14}>Last 14 completed days</option><option value={30}>Last 30 completed days</option>
        </select></label>
        <label>Measure among<select value={cohort} onChange={event => setCohort(event.target.value as "planners" | "all")}>
          <option value="planners">Trip planners · OKR target</option><option value="all">All accounts · comparison</option>
        </select></label>
      </div>
      <Button variant="outline" disabled={busy} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={16} aria-hidden="true" />{busy ? "Refreshing…" : "Refresh data"}</Button>
    </div>

    {error && <section className="card okr1-error" role="alert"><h2>Dashboard unavailable</h2><p>{error}</p><Button onClick={() => setRefresh(value => value + 1)}>Retry dashboard</Button></section>}
    {busy && !error && <p role="status">Loading activity across all accounts…</p>}
    {data && <>
      <section className="okr1-objective-copy" aria-labelledby="okr1-title">
        <span className="okr-eyebrow">Objective 1 · Daniel</span>
        <h2 id="okr1-title">Help trip planners save and share trips with friends</h2>
        <div className="okr1-period"><Target size={16} aria-hidden="true" />{dateLabel(data.windowStart)} – {dateLabel(data.windowEnd)} · {days} completed days · UTC</div>
      </section>

      <section className="okr1-visual-overview" aria-label="Key percentages">
        <section className="card okr1-visual-card okr1-primary-chart" aria-labelledby="okr1-return-title">
          <div className="okr1-section-head"><h2 id="okr1-return-title">{cohort === "planners" ? "Every-other-day return" : "All-account return"}</h2><span className="okr1-target-key">Goal 85%</span></div>
          <PercentRing value={percent} label={`${days}-day return rate`} target={85} primary />
          <Badge tone={met ? "ok" : ""}>{percent === null ? "Collecting baseline" : met ? "Target met" : "Below target"}</Badge>
          {percent !== null ? <>
            <p><strong>{countLabel(consistent)} of {countLabel(eligible)}</strong> eligible {cohort === "planners" ? "planners" : "accounts"} returned consistently.</p>
            <p className="okr1-support">{percent === 85 ? "Exactly at the 85% target." : met ? `${(percent - 85).toFixed(1)} percentage points above the 85% target.` : `${countLabel(remaining)} more consistent ${cohort === "planners" ? "planners" : "accounts"} needed to reach 85%.`}</p>
          </> : <p className="okr1-support">{data.observedDays < days
            ? `${data.observedDays} of ${days} complete tracking days available. The rate appears after a full observation period.`
            : "No accounts in this cohort have a full observation period yet."}</p>}
        </section>
        <section className="card okr1-visual-card" aria-labelledby="okr1-adoption-title">
          <h2 id="okr1-adoption-title">Planner adoption</h2>
          <PercentRing value={sharePercent(data.planners, data.registeredUsers)} label="of all accounts" />
          <p><strong>{countLabel(data.planners)} of {countLabel(data.registeredUsers)}</strong> accounts have saved or joined a trip.</p>
          <p className="okr1-support">Shows how many people take their first planning step.</p>
        </section>
        <section className="card okr1-visual-card" aria-labelledby="okr1-sharing-title">
          <h2 id="okr1-sharing-title">Trips shared</h2>
          <PercentRing value={sharePercent(data.sharedTrips, data.savedTrips)} label="of saved trips" />
          <p><strong>{countLabel(data.sharedTrips)} of {countLabel(data.savedTrips)}</strong> saved trips include an accepted friend.</p>
          <p className="okr1-support">Sharing means another real account has joined.</p>
        </section>
      </section>

      <div className="okr1-chart-grid">
        <ReturnTrend data={data} allAccounts={cohort === "all"} />
        <DailyActivity key={days} data={data} />
      </div>

      <details className="card okr1-method okr1-counts"><summary>Supporting numbers and cohort details</summary>
        <dl className="okr1-count-grid">
          <div><dt>Saved trips</dt><dd>{countLabel(data.savedTrips)}</dd></div>
          <div><dt>Sharing owners</dt><dd>{countLabel(data.sharingOwners)}</dd></div>
          <div><dt>Active in this period</dt><dd>{countLabel(data.activeInWindow)}</dd></div>
          <div><dt>Eligible {cohort === "planners" ? "planners" : "accounts"}</dt><dd>{countLabel(eligible)}</dd></div>
          <div><dt>Consistent returners</dt><dd>{countLabel(consistent)}</dd></div>
          <div><dt>New planners this period</dt><dd>{countLabel(data.newPlanners)}</dd></div>
          <div><dt>Currently have trip access</dt><dd>{countLabel(data.currentPlanners)}</dd></div>
        </dl>
        <p>Planners enter the cohort when they save their first trip or accept access to a friend’s trip. Inactive planners stay in the denominator. New planners join the measured cohort after a full {days}-day observation period.</p>
      </details>

      <details className="card okr1-method"><summary>Metric definition and data coverage</summary>
        <div><h3>Every other day means no two inactive days in a row</h3><p>For each eligible person, every pair of consecutive days in the selected window must include at least one plan visit. Seven visits clustered into one week do not satisfy a 14-day window. The goal is 85%, measured among trip planners by default.</p>
          <h3>What is a plan visit?</h3><p>Opening a saved itinerary, Today, Day &amp; map, or Map while signed in and the page is visible. Multiple visits, devices, tabs and trips count once per person per UTC day. Sample trips, signed-out visits and background refreshes do not count.</p>
          <h3>Coverage starts {dateLabel(data.trackingStartedAt)}</h3><p>Historical visits were not recorded. The partial launch day is excluded from the return-rate window. Savings and sharing totals use current account records; visit history grows from the tracking start. A shared trip needs an accepted, real account other than its owner.</p>
          <p>Reports are aggregate-only and restricted to approved admins. Activity records contain account identifiers and dates, not trip contents or browsing history outside this website. All-account comparison is a separate denominator, not the primary OKR.</p>
        </div>
      </details>
      <p className="okr1-updated" role="status">{updated ? `Updated ${updated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" })}. Refreshes every minute while visible.` : ""} {data.lastActivityAt ? `Latest recorded activity: ${new Date(data.lastActivityAt).toLocaleString()}.` : "No plan visits recorded yet."}</p>
    </>}
  </div>;
}
