import { useEffect, useState } from "react";
import { useApp } from "./state";
import { Button, Modal } from "./ui";
import { getSupabase } from "./supabase";

type PendingTrip = { trip_id: string; title: string; completed_on: string };
export function TripFeedback({ disabled = false }: { disabled?: boolean }) {
  const { user, accountInfo } = useApp();
  const [trip, setTrip] = useState<PendingTrip | null>(null);
  const [answers, setAnswers] = useState<{ metExpectations?: boolean; wouldRecommend?: boolean }>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    if (disabled || !accountInfo.cloud || !user?.id) { setTrip(null); return; }
    let live = true;
    const key = `trip-feedback-deferred:${user.id}`;
    try { if (sessionStorage.getItem(key) === new Date().toISOString().slice(0, 10)) { setClosed(true); return; } } catch { /* Still allow the survey if storage is unavailable. */ }
    setClosed(false);
    void getSupabase().rpc("pending_trip_experience_feedback").then(({ data, error: failure }) => {
      if (!live || failure) return;
      const completed = Array.isArray(data)
        ? data.find((candidate: PendingTrip) => /^\d{4}-\d{2}-\d{2}$/.test(candidate.completed_on))
        : undefined;
      setTrip(completed || null);
      setAnswers({});
    });
    return () => { live = false; };
  }, [disabled, accountInfo.cloud, user?.id]);
  const defer = () => {
    try { if (user?.id) sessionStorage.setItem(`trip-feedback-deferred:${user.id}`, new Date().toISOString().slice(0, 10)); } catch { /* Dismissing lasts for this render. */ }
    setClosed(true);
  };
  async function submit() {
    if (!trip || answers.metExpectations === undefined || answers.wouldRecommend === undefined) return;
    setSaving(true); setError("");
    const { error: failure } = await getSupabase().rpc("submit_trip_experience_feedback", {
      p_trip: trip.trip_id, p_met_expectations: answers.metExpectations, p_would_recommend: answers.wouldRecommend,
    });
    setSaving(false);
    if (failure) { setError("Your answers could not be saved. Please try again."); return; }
    setTrip(null);
  }
  if (!trip || closed || disabled) return null;
  const question = (name: "metExpectations" | "wouldRecommend", text: string) => <fieldset className="feedback-question">
    <legend>{text}</legend><div className="form-actions">
      {[true, false].map(value => <Button key={String(value)} variant={answers[name] === value ? "selected" : "outline"} aria-pressed={answers[name] === value} onClick={() => setAnswers(current => ({ ...current, [name]: value }))}>{value ? "Yes" : "No"}</Button>)}
    </div>
  </fieldset>;
  return <Modal title="How was your trip?" onClose={defer}>
    <p>Now that your trip to <strong>{trip.title}</strong> has ended:</p>
    {question("metExpectations", "Did the trip as a whole meet your expectations?")}
    {question("wouldRecommend", "Would you recommend this trip experience to someone else?")}
    {error && <p role="alert">{error}</p>}
    <div className="form-actions"><Button variant="outline" onClick={defer}>Not now</Button><Button disabled={saving || answers.metExpectations === undefined || answers.wouldRecommend === undefined} onClick={() => void submit()}>{saving ? "Saving…" : "Send feedback"}</Button></div>
    <small className="muted">Your answers are stored with this trip and used as aggregate trip feedback.</small>
  </Modal>;
}
