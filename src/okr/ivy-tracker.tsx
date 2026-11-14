import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, ErrorBox } from "../ui";
import { OkrTrackerShell } from "./okr-shell";
import { fetchSharingStats, formatPercent, sharingProgress, type SharingStats } from "../okr2";

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
  const [refreshing, setRefreshing] = useState(false);
  const alive = useRef(true);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await fetchSharingStats();
      if (!alive.current) return;
      setStats(next);
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
