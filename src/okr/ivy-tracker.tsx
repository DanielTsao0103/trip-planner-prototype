import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, ErrorBox } from "../ui";
import { OkrTrackerShell } from "./okr-shell";
import {
  dayLabel, fetchSharingHistory, fetchSharingStats, formatPercent, historyPoints, OKR2_TARGET_PERCENT, sharingProgress, trendChange,
  type HistoryPoint, type SharingStats,
} from "../okr2";

/** How often the numbers refresh while the page is open. */
export const LIVE_REFRESH_MS = 15000;

const timeText = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });

/** Ivy's OKR tracker: OKR #2, trips shared with friends. Refreshes on its own while the page is open. */
export function IvyOkrTracker() {
  return (
    <OkrTrackerShell owner="Ivy">
      <Okr2Live />
    </OkrTrackerShell>
  );
}

function Okr2Live() {
  const [stats, setStats] = useState<SharingStats | null>(null);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [history, setHistory] = useState<HistoryPoint[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [next, rows] = await Promise.all([
        fetchSharingStats(),
        // The trend is secondary: if it fails, the headline numbers still show.
        fetchSharingHistory().catch(() => null),
      ]);
      if (!alive.current) return;
      setStats(next);
      if (rows) setHistory(historyPoints(rows));
      setError("");
      setUpdatedAt(new Date());
    } catch {
      if (alive.current) setError("Couldn’t refresh the numbers. Showing the last update, and trying again shortly.");
    } finally {
      if (alive.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, LIVE_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive.current = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);

  const progress = stats ? sharingProgress(stats) : null;
  const fill = progress ? Math.min(100, progress.percent) : 0;

  return (
    <section className="card account-section okr-live" aria-labelledby="okr2-title" data-testid="okr2">
      <p className="okr-eyebrow">Objective, OKR #2</p>
      <h2 id="okr2-title">Help trip planners save and share trips with friends</h2>
      <p className="okr-kr">Key result: {progress?.targetPercent ?? 75}% of all trips have more than 1 account associated with them.</p>

      <ErrorBox text={error} />

      {!progress ? (
        !error && <p role="status">Loading the latest numbers…</p>
      ) : (
        <>
          <div className="okr-figure" role="status" aria-live="polite">
            <strong data-testid="okr2-percent">{formatPercent(progress.percent)}</strong>
            <span>of trips are shared</span>
            <Badge tone={progress.met ? "ok" : ""}>{progress.met ? "Target met" : "Below target"}</Badge>
          </div>
          <div
            className="okr-meter"
            role="progressbar"
            aria-label="Share of trips with more than one account"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(fill)}
          >
            <i style={{ width: `${fill}%` }} />
            <b style={{ left: `${progress.targetPercent}%` }} aria-hidden="true" />
          </div>
          <dl className="okr-stats">
            <div><dt>Trips with 2+ accounts</dt><dd data-testid="okr2-shared">{progress.sharedTrips}</dd></div>
            <div><dt>All trips</dt><dd data-testid="okr2-total">{progress.totalTrips}</dd></div>
            <div>
              <dt>To reach {progress.targetPercent}%</dt>
              <dd data-testid="okr2-gap">{progress.met ? "None" : `${progress.tripsToTarget} more shared`}</dd>
            </div>
          </dl>
          {progress.totalTrips === 0 && <p>No trips yet, so there is nothing to measure.</p>}
        </>
      )}

      {history && <TrendChart points={history} />}

      <div className="okr-live-bar">
        <span className="okr-live-dot" aria-hidden="true" />
        <span data-testid="okr2-updated">
          {updatedAt ? `Live. Updated ${timeText(updatedAt)}, refreshes every ${LIVE_REFRESH_MS / 1000} seconds.` : "Live. Connecting…"}
        </span>
        <Button variant="text" onClick={() => void load()} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "Refresh now"}
        </Button>
      </div>
      <p className="okr-note">
        A trip counts as shared when its owner and at least one other signed-in account who accepted an invite are on it. Pending invites and
        travelers without an account are not counted.
      </p>
    </section>
  );
}

const W = 640;
const H = 220;
const PAD = { l: 40, r: 16, t: 14, b: 28 };

/** Share of trips with more than one account, per day for the last 14 days. One series, so the heading names it. */
function TrendChart({ points }: { points: HistoryPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const change = trendChange(points);
  const firstRecorded = points.find(point => !point.estimate);
  const x = (i: number) => PAD.l + (points.length < 2 ? (W - PAD.l - PAD.r) / 2 : (i * (W - PAD.l - PAD.r)) / (points.length - 1));
  const y = (pct: number) => PAD.t + ((100 - Math.min(100, Math.max(0, pct))) * (H - PAD.t - PAD.b)) / 100;
  const line = points.map((p, i) => `${x(i)},${y(p.percent)}`).join(" ");
  const shown = active === null ? points[points.length - 1] : points[active];
  const summary =
    change === null
      ? "Tracking started. The trend appears after the second day."
      : `${change >= 0 ? "Up" : "Down"} ${Math.round(Math.abs(change) * 10) / 10} percentage points since ${dayLabel(firstRecorded!.day)}.`;

  return (
    <div className="okr-trend" data-testid="okr2-trend">
      <h3>Last 14 days</h3>
      <p className="okr-note">{summary}</p>
      {points.some((p) => p.estimate) ? (
        <p className="okr-note" data-testid="okr2-estimate-note">
          Hollow points are estimated placeholders for the days before tracking started. Filled points are real daily records.
        </p>
      ) : (
        <p className="okr-note">History is recorded from the day this tracker went live, so it fills in over two weeks.</p>
      )}
      {points.length > 0 && (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Share of trips with more than one account, ${points.length} days. ${summary}`}>
          {[0, 25, 50, 75, 100].map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className={t === OKR2_TARGET_PERCENT ? "okr-target" : "okr-grid"} />
              <text x={PAD.l - 6} y={y(t) + 4} textAnchor="end" className="okr-axis">{t}%</text>
            </g>
          ))}
          <text x={W - PAD.r} y={y(OKR2_TARGET_PERCENT) - 5} textAnchor="end" className="okr-axis">Target {OKR2_TARGET_PERCENT}%</text>
          {points.length > 1 && <polyline points={line} className="okr-line" />}
          {points.map((p, i) => (
            <g key={p.day}>
              <circle
                cx={x(i)} cy={y(p.percent)} r={active === i ? 5 : 3.5} className={p.estimate ? "okr-dot okr-dot-estimate" : "okr-dot"}
                tabIndex={0} role="img" aria-label={`${dayLabel(p.day)}: ${formatPercent(p.percent)}, ${p.sharedTrips} of ${p.totalTrips} trips${p.estimate ? ", estimated" : ""}`}
                onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}
              />
              <circle cx={x(i)} cy={y(p.percent)} r={14} className="okr-hit" onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} />
              {(i === 0 || i === points.length - 1) && (
                <text x={x(i)} y={H - 8} textAnchor={i === 0 && points.length > 1 ? "start" : "end"} className="okr-axis">{dayLabel(p.day)}</text>
              )}
            </g>
          ))}
        </svg>
      )}
      {shown && (
        <p className="okr-readout" aria-live="polite" data-testid="okr2-readout">
          {dayLabel(shown.day)}: {formatPercent(shown.percent)} ({shown.sharedTrips} of {shown.totalTrips} trips){shown.estimate ? ", estimated" : ""}
        </p>
      )}
      <details>
        <summary>Show as a table</summary>
        <table className="okr-table">
          <thead><tr><th>Day</th><th>Shared trips</th><th>All trips</th><th>Share</th><th>Source</th></tr></thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.day}><td>{dayLabel(p.day)}</td><td>{p.sharedTrips}</td><td>{p.totalTrips}</td><td>{formatPercent(p.percent)}</td><td>{p.estimate ? "Estimated" : "Recorded"}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
