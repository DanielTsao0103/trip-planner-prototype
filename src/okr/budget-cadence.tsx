import { useEffect, useState } from "react";
import { RefreshCw, Target } from "lucide-react";
import { getSupabase } from "../supabase";
import { useApp } from "../state";
import { Button } from "../ui";

type Metrics = { windowStart: string; windowEnd: string; windowDays: number; observedDays: number; eligibleUsers: number; consistentUsers: number; percent: number | null; targetPercent: number; definition: string };
export function BudgetCadenceMetrics() {
  const { accountInfo } = useApp();
  const [refresh, setRefresh] = useState(0), [data, setData] = useState<Metrics | null>(null), [error, setError] = useState(""), [busy, setBusy] = useState(true);
  useEffect(() => {
    if (!accountInfo.cloud) { setBusy(false); setData(null); setError("Budget cadence metrics require a signed-in account and database access."); return; }
    const controller = new AbortController(); setBusy(true); setError("");
    void (async () => {
      try {
        const { data: result, error: failure } = await getSupabase().rpc("get_budget_cadence_metrics", { p_days: 14 }).abortSignal(controller.signal);
        if (controller.signal.aborted) return;
        if (failure) { setError("Budget cadence metrics are unavailable."); setData(null); }
        else setData(result as Metrics);
      } catch { if (!controller.signal.aborted) { setError("Budget cadence metrics are unavailable."); setData(null); } }
      finally { if (!controller.signal.aborted) setBusy(false); }
    })();
    return () => controller.abort();
  }, [accountInfo.cloud, refresh]);
  const percent = data?.percent;
  return <section className="card account-section budget-cadence-page" aria-labelledby="budget-cadence-title">
    <div className="section-heading"><div><span className="eyebrow">Team key result</span><h2 id="budget-cadence-title">Budget cadence</h2><p>Measure whether travelers keep trip budgets current during active trips.</p></div><Button variant="outline" disabled={busy} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={16}/>{busy ? "Loading…" : "Refresh"}</Button></div>
    {error && <div role="alert"><h3>Dashboard unavailable</h3><p>{error}</p><Button onClick={() => setRefresh(value => value + 1)}>Retry</Button></div>}
    {busy && !data && !error && <p role="status">Loading budget cadence…</p>}
    {data && <>
      <div><span className="eyebrow"><Target size={15}/> Key result · 14 UTC days</span>
        <h3>At least one budget update in every rolling two-day window of an active trip</h3>
        <p className="budget-cadence-value">{percent === null ? "—" : `${percent}%`}</p>
        <p>{data.consistentUsers} of {data.eligibleUsers} eligible users met the cadence{percent !== null ? ` · target ${data.targetPercent}%` : ""}.</p>
        <p className="muted">Reporting window: {data.windowStart} to {data.windowEnd} (UTC)</p>
        <details><summary>How this is counted</summary><p>{data.definition} Today is still in progress. A qualifying update is a real change to the trip budget, an individual budget, or an expense saved through the trip editor. This is an access and budget-change proxy; it does not identify users in the dashboard.</p></details>
      </div>
    </>}
  </section>;
}
