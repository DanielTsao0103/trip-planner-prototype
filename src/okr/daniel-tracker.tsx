import { useEffect, useState } from "react";
import { ArrowUpRight, RefreshCw, Target } from "lucide-react";
import { Badge, Button } from "../ui";
import { fetchOkr1Metrics, formatOkrPercent, type Okr1Metrics } from "../okr1";
import { OkrTrackerShell } from "./okr-shell";
import "./daniel-tracker.css";

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
  const maxActivity = Math.max(1, ...(data?.daily.map(day => day.activeUsers) ?? []));

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
      <section className="card okr1-objective" aria-labelledby="okr1-title">
        <div className="okr1-objective-copy"><span className="okr-eyebrow">Objective 1 · Daniel</span>
          <h2 id="okr1-title">Help trip planners save and share trips with friends</h2>
          <p>85% of trip planners access their trip plan at least every other day.</p>
          <div className="okr1-period"><Target size={16} aria-hidden="true" />{dateLabel(data.windowStart)} – {dateLabel(data.windowEnd)} · {days} completed days · UTC</div>
        </div>
        <div className="okr1-result">
          <span>{cohort === "planners" ? "Every-other-day return rate" : "All-account comparison"}</span>
          <strong className="okr1-percent" data-testid="okr1-percent">{formatOkrPercent(percent)}</strong>
          <Badge tone={met ? "ok" : ""}>{percent === null ? "Collecting baseline" : met ? "Target met" : "Below target"}</Badge>
          {percent !== null ? <>
            <div className="okr-meter" role="progressbar" aria-label="Every-other-day return rate" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
              <i style={{ width: `${percent}%` }} /><b style={{ left: "85%" }} aria-hidden="true" />
            </div>
            <p><strong>{countLabel(consistent)} of {countLabel(eligible)}</strong> eligible {cohort === "planners" ? "planners" : "accounts"} returned consistently.</p>
            <p className="okr1-support">{percent === 85 ? "Exactly at the 85% target." : met ? `${(percent - 85).toFixed(1)} percentage points above the 85% target.` : `${countLabel(remaining)} more consistent ${cohort === "planners" ? "planners" : "accounts"} needed to reach 85%.`}</p>
          </> : <p className="okr1-support">{data.observedDays < days
            ? `${data.observedDays} of ${days} complete tracking days available. The rate appears after a full observation period.`
            : "No accounts in this cohort have a full observation period yet."}</p>}
        </div>
      </section>

      <section className="okr1-kpis" aria-label="Saving, sharing and activity">
        <Kpi label="Saved trips" value={data.savedTrips} detail="Trips currently saved to accounts" />
        <Kpi label="Shared with friends" value={data.sharedTrips} detail={`${countLabel(data.sharingOwners)} owners · accepted account collaborators`} />
        <Kpi label="Active today" value={data.activeToday} detail="Unique people who opened a plan · UTC" />
        <Kpi label="Trip planners" value={data.planners} detail={`${countLabel(data.registeredUsers)} registered accounts in total`} />
      </section>

      <div className="okr1-detail-grid">
        <section className="card okr1-activity" aria-labelledby="okr1-activity-title">
          <div className="okr1-section-head"><div><h2 id="okr1-activity-title">Trip-plan activity</h2><p>Unique people opening a plan each completed day.</p></div><span className="okr1-period">{countLabel(data.activeInWindow)} in this period</span></div>
          {data.daily.length ? <>
            <div className="okr1-bars" role="img" aria-label={`Daily trip-plan activity. ${data.daily.map(day => `${dateLabel(day.date)}: ${day.activeUsers}`).join("; ")}`}>
              {data.daily.map(day => <div className="okr1-bar-column" key={day.date} title={`${dateLabel(day.date)}: ${countLabel(day.activeUsers)} people`}><span style={{ height: `${day.activeUsers / maxActivity * 100}%` }} /></div>)}
            </div>
            <div className="okr1-axis" aria-hidden="true"><span>{dateLabel(data.daily[0].date)}</span><span>{dateLabel(data.daily[data.daily.length - 1].date)}</span></div>
            <details className="okr1-table-details"><summary>View daily numbers</summary><table><caption>Daily unique trip-plan visitors, UTC</caption><thead><tr><th scope="col">Date</th><th scope="col">People</th></tr></thead><tbody>{data.daily.map(day => <tr key={day.date}><th scope="row">{dateLabel(day.date)}</th><td>{countLabel(day.activeUsers)}</td></tr>)}</tbody></table></details>
          </> : <div className="okr1-chart-empty"><ArrowUpRight size={24} aria-hidden="true" /><h3>Activity starts here</h3><p>The first complete UTC day will appear here. Today’s visits are counted above.</p></div>}
        </section>
        <section className="card okr1-cohort" aria-labelledby="okr1-cohort-title"><h2 id="okr1-cohort-title">Who counts?</h2>
          <dl><div><dt>Eligible {cohort === "planners" ? "planners" : "accounts"}</dt><dd>{countLabel(eligible)}</dd></div><div><dt>Consistent returners</dt><dd>{countLabel(consistent)}</dd></div><div><dt>New planners this period</dt><dd>{countLabel(data.newPlanners)}</dd></div><div><dt>Currently have trip access</dt><dd>{countLabel(data.currentPlanners)}</dd></div></dl>
          <p>Planners enter the cohort when they save their first trip or accept access to a friend’s trip. Inactive planners stay in the denominator.</p>
          <p>New planners join the measured cohort after a full {days}-day observation period.</p>
        </section>
      </div>

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

function Kpi({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <div className="card okr1-kpi"><h2>{label}</h2><strong>{countLabel(value)}</strong><p>{detail}</p></div>;
}
