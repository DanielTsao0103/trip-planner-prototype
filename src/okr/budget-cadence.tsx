import { useEffect, useState } from "react";
import { RefreshCw, Target } from "lucide-react";
import { getSupabase } from "../supabase";
import { useApp } from "../state";
import { Button, PageHead } from "../ui";
import { AdminGate } from "../admin-gate";

type Metrics = { windowStart: string; windowEnd: string; windowDays: number; observedDays: number; eligibleUsers: number; consistentUsers: number; percent: number | null; targetPercent: number; definition: string };
export function BudgetCadenceOkr() {
  return <AdminGate><Dashboard /></AdminGate>;
}
function Dashboard() {
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
  return <div className="account-page admin-page budget-cadence-page">
    <PageHead eyebrow="Team OKR" title="Budget cadence" description="Measure whether travelers keep trip budgets current during active trips." action={<Button variant="outline" disabled={busy} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={16}/>{busy ? "Loading…" : "Refresh"}</Button>} />
    {error && <section className="card" role="alert"><h2>Dashboard unavailable</h2><p>{error}</p><Button onClick={() => setRefresh(value => value + 1)}>Retry</Button></section>}
    {busy && !data && !error && <p role="status">Loading budget cadence…</p>}
    {data && <>
      <section className="card account-section"><span className="eyebrow"><Target size={15}/> Key result · 14 UTC days</span>
        <h2>At least one budget update in every rolling two-day window of an active trip</h2>
        <p className="budget-cadence-value">{percent === null ? "—" : `${percent}%`}</p>
        <p>{data.consistentUsers} of {data.eligibleUsers} eligible users met the cadence{percent !== null ? ` · target ${data.targetPercent}%` : ""}.</p>
        <p className="muted">{data.observedDays} observed days · {data.windowStart} to {data.windowEnd} (UTC)</p>
        <details><summary>How this is counted</summary><p>{data.definition} A qualifying update is a real change to the trip budget, an individual budget, or an expense saved through the trip editor. This is an access and budget-change proxy; it does not identify users in the dashboard.</p></details>
      </section>
    </>}
  </div>;
}
