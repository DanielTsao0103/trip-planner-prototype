import { useEffect, useState } from "react";
import { getSupabase } from "../supabase";
import { Badge, Button } from "../ui";
import { PercentRing } from "./daniel-charts";

const target = 50;
type BudgetStats = { eligible_trips: number; within_budget_trips: number; trips_without_expenses: number };

export function BudgetOkrTracker() {
  const [stats, setStats] = useState<BudgetStats>();
  const [request, setRequest] = useState(0);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const { data, error } = await getSupabase().rpc("okr4_trip_budget_stats")
          .abortSignal(controller.signal).single<BudgetStats>();
        if (controller.signal.aborted) return;
        if (error || !data) throw new Error("Trip budget counts unavailable");
        setStats(data);
        setStatus("ready");
      } catch {
        if (!controller.signal.aborted) setStatus("error");
      }
    }
    void load();
    return () => controller.abort();
  }, [request]);

  const eligible = stats?.eligible_trips ?? 0;
  const withinBudget = stats?.within_budget_trips ?? 0;
  const noExpenses = stats?.trips_without_expenses ?? 0;
  const rate = eligible > 0 ? withinBudget * 100 / eligible : null;

  return <section className="card okr1-visual-card" aria-labelledby="okr4-title">
    <div className="okr1-section-head">
      <div>
        <span className="okr-eyebrow">OKR #4</span>
        <h2 id="okr4-title">Help people stay within their trip budgets</h2>
      </div>
      <span className="okr1-target-key">Goal {target}%</span>
    </div>
    <p>At least 50% of completed trips with a budget set before departure finish at or below that budget.</p>
    {status === "loading" && <p role="status">Loading trip budget results…</p>}
    {status === "error" && <p role="alert">Trip budget results is unavailable.</p>}
    {status === "ready" && <>
      <PercentRing value={rate} label="of eligible trips within budget" target={target} />
      {rate === null ? <p>No completed trips with a recorded pre-departure budget yet.</p> : <>
        <Badge tone={rate >= target ? "ok" : ""}>{rate >= target ? "Target met" : "Below target"}</Badge>
        <p><strong>{withinBudget.toLocaleString()} of {eligible.toLocaleString()}</strong> eligible trips finished within budget based on logged expenses.</p>
        {noExpenses > 0 && <p>Eligible trips with no logged expenses: {noExpenses.toLocaleString()}.</p>}
      </>}
    </>}
    <Button variant="outline" disabled={status === "loading"} onClick={() => {
      setStatus("loading");
      setRequest(previous => previous + 1);
    }}>{status === "error" ? "Retry budget results" : "Refresh budget results"}</Button>
    <details className="okr1-method">
      <summary>How staying within budget is measured</summary>
      <p>Each account trip counts once after its end date. We compare all logged trip expenses with the last positive group budget saved before the trip started. Trips with no logged expenses count toward eligibility only. Sample trips, individual budgets, and trips without a recorded pre-departure budget are excluded. Spending totals depend on what travelers log.</p>
    </details>
  </section>;
}
