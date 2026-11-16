import { useEffect, useState } from "react";
import { getSupabase } from "../supabase";
import { Badge, Button } from "../ui";
import { PercentRing } from "./daniel-charts";

const target = 50;
type ReceiptStats = { eligible_travelers: number; repeat_travelers: number };

export function ReceiptOkrTracker() {
  const [stats, setStats] = useState<ReceiptStats>();
  const [request, setRequest] = useState(0);
  const [status, setStatus] = useState<"loading" | "error" | "ready">("loading");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const { data, error } = await getSupabase().rpc("okr4_receipt_stats")
          .abortSignal(controller.signal).single<ReceiptStats>();
        if (controller.signal.aborted) return;
        if (error || !data) throw new Error("Receipt scan counts unavailable");
        setStats(data);
        setStatus("ready");
      } catch {
        if (!controller.signal.aborted) setStatus("error");
      }
    }
    void load();
    return () => controller.abort();
  }, [request]);

  const eligible = stats?.eligible_travelers ?? 0;
  const repeat = stats?.repeat_travelers ?? 0;
  const rate = eligible > 0 ? repeat * 100 / eligible : null;

  return <section className="card okr1-visual-card" aria-labelledby="okr4-title">
    <div className="okr1-section-head">
      <div>
        <span className="okr-eyebrow">OKR #4</span>
        <h2 id="okr4-title">Help people stay within their trip budgets</h2>
      </div>
      <span className="okr1-target-key">Goal {target}%</span>
    </div>
    <p>50% of travelers save at least two scanned receipts on the same trip.</p>
    {status === "loading" && <p role="status">Loading receipt scan activity…</p>}
    {status === "error" && <p role="alert">Receipt scan activity is unavailable.</p>}
    {status === "ready" && <>
      <PercentRing value={rate} label="of eligible travelers" target={target} />
      {rate === null ? <p>No eligible travelers yet.</p> : <>
        <Badge tone={rate >= target ? "ok" : ""}>{rate >= target ? "Target met" : "Below target"}</Badge>
        <p><strong>{repeat.toLocaleString()} of {eligible.toLocaleString()}</strong> eligible travelers saved two or more scanned receipts on one trip.</p>
      </>}
    </>}
    <Button variant="outline" disabled={status === "loading"} onClick={() => {
      setStatus("loading");
      setRequest(previous => previous + 1);
    }}>{status === "error" ? "Retry receipt activity" : "Refresh receipt activity"}</Button>
    <details className="okr1-method">
      <summary>How receipt use is measured</summary>
      <p>Trip owners and accepted account collaborators count once across trips that have started. A traveler qualifies when two saved receipt scans on one trip have expense dates within that trip. Sample trips, failed scans, and manually entered expenses are excluded.</p>
    </details>
  </section>;
}
