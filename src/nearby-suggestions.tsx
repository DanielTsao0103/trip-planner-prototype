import { useEffect, useRef, useState } from "react";
import { Clock, ExternalLink, MapPin, Search, ShieldCheck } from "lucide-react";
import { useApp } from "./state";
import { Button, Field, Modal } from "./ui";
import { days, dateText, member, money, timeText } from "./domain";
import { getSupabase } from "./supabase";
import { planningContext, safeSource, nearbyListingLinks, isYelpSource, YELP_SEARCH_MESSAGES, NEARBY_EMPTY_MESSAGES, type YelpSearchStatus, type EmptyReason, type ReviewRejections, type Intent, type NearbyResult } from "../supabase/functions/_shared/nearby.ts";
import "./nearby-suggestions.css";

export function NearbySuggestions() {
  const { trip, s, overlay, pendingTripIds } = useApp();
  const preferredDate = overlay?.data?.date;
  const [date, setDate] = useState(preferredDate && trip && preferredDate >= trip.start && preferredDate <= trip.end ? preferredDate : trip && s.date >= trip.start && s.date <= trip.end ? s.date : trip?.start || "");
  const [intent, setIntent] = useState<Intent>("lunch");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<NearbyResult[] | null>(null);
  const [emptyReason, setEmptyReason] = useState<EmptyReason>("filtered");
  const [diagnostics, setDiagnostics] = useState<{ sourcesFound: number; sourcesUsed: number; candidatesReturned: number; rejected: ReviewRejections; yelpStatus?: YelpSearchStatus; yelpSourcesUsed?: number } | null>(null);
  const request = useRef<AbortController | null>(null);
  const contextKey = JSON.stringify([trip, date, intent, overlay?.data?.event]);
  useEffect(() => { request.current?.abort(); setResults(null); setDiagnostics(null); setError(""); setLoading(false); return () => { request.current?.abort(); }; }, [contextKey]);
  if (!trip) return <Modal title="Nearby suggestions"><p>Choose a trip to research nearby places.</p></Modal>;
  const context = planningContext(trip, s.userId || "", date, intent, overlay?.data?.event);
  const isDemo = trip.persistence !== "account";
  const pending = pendingTripIds.includes(trip.id);
  async function research() {
    if (!trip || isDemo || pending) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setLoading(true); setResults(null); setDiagnostics(null); setError("");
    const timeout = setTimeout(() => controller.abort("timeout"), 90000);
    try {
      const client = getSupabase();
      const { data, error: failure } = await client.functions.invoke("nearby-suggestions", {
        body: { tripId: trip.id, revision: trip.revision, date, intent, anchorId: overlay?.data?.event }, signal: controller.signal,
      });
      if (failure) {
        const response = failure.context;
        const detail = response instanceof Response ? await response.clone().json().catch(() => null) : null;
        throw new Error(detail?.message || "Nearby research is unavailable. Please try again.");
      }
      if (!data || !Array.isArray(data.results)) throw new Error("Research returned an invalid response.");
      if (!controller.signal.aborted) {
        setResults(data.results);
        setEmptyReason(typeof data.emptyReason === "string" && Object.hasOwn(NEARBY_EMPTY_MESSAGES, data.emptyReason) ? data.emptyReason as EmptyReason : "filtered");
        setDiagnostics(data.diagnostics || null);
      }
    } catch (e) {
      if (!controller.signal.aborted || controller.signal.reason === "timeout") setError(controller.signal.reason === "timeout" ? "Research took too long. Please try again." : e instanceof Error ? e.message : "Could not research nearby places.");
    } finally { clearTimeout(timeout); if (request.current === controller) setLoading(false); }
  }
  return <Modal title="Nearby suggestions" wide className="nearby-research-modal">
    <p className="nearby-intro">Find places around your plans, with your group’s needs in mind.</p>
    <p className="fine-print">Up to 3 ideas per generation · 5 generations per person each day · resets at midnight UTC.</p>
    <div className="nearby-research-controls">
      <Field label="Trip day"><select value={date} onChange={e => setDate(e.target.value)}>{days(trip.start, trip.end).map(day => <option key={day} value={day}>{dateText(day)}</option>)}</select></Field>
      <Field label="Find"><select value={intent} onChange={e => setIntent(e.target.value as Intent)}><option value="lunch">Lunch</option><option value="dinner">Dinner</option><option value="activity">Things to do</option></select></Field>
    </div>
    <div className="nearby-context-panel">
      <p><MapPin size={17} aria-hidden="true" /><strong>{context.area || "Add a trip destination first"}</strong></p>
      {context.locationNote && <p>{context.locationNote}</p>}
      <p>{context.answered} of {context.travelers} travelers shared preferences. Your preferences and the group’s responses are considered together.</p>
      <details><summary>Planning details used</summary>
        <dl><dt>Dietary needs</dt><dd>{context.diet.join(", ") || "None shared"}</dd><dt>Accessibility</dt><dd>{context.access.join(", ") || "None shared"}</dd><dt>Walking limit</dt><dd>{context.walkMeters === null ? "Not shared" : `${context.walkMeters} m (most restrictive response)`}</dd><dt>Budget reservation</dt><dd>{context.remainingGroupCents === null ? context.individualRemaining.length ? "Individual budgets checked separately" : "No group budget set" : `${money(context.remainingGroupCents)} remaining for the group`}</dd></dl>
        <p>{context.budgetNote}</p><p>Groq considers dining, spending, interests, destination requests, ticket preferences and shared notes. Account names, emails and payment records are excluded. Tavily searches use the area, category and general dietary or interest filters.</p>
      </details>
    </div>
    {isDemo && <p className="info-banner">Sample trip: you can explore the planning context here. Live research is available for saved account trips once the service is connected.</p>}
    {pending && <p role="status">Waiting for your trip changes to finish saving before researching.</p>}
    <p className="fine-print">Free service: the group shares a limited allowance. Research pauses when that allowance is used.</p>
    {!context.gaps.length && <p role="status">No free hour in this day’s {intent === "activity" ? "planning" : intent} window with a provisional 30-minute travel buffer. Choose another day.</p>}
    <Button onClick={research} disabled={loading || isDemo || pending || !context.area || !context.gaps.length}><Search size={17} />{loading ? "Researching places and sources…" : "Find nearby suggestions"}</Button>
    {loading && <p role="status">Checking current sources against your plans and preferences. You can close this window to cancel.</p>}
    {error && <p role="alert" className="error-box">{error}</p>}
    {results !== null && <section className="nearby-results" aria-label="Research results" aria-live="polite">
      <h3>Options to review</h3><p><ShieldCheck size={17} aria-hidden="true" /> These are researched candidates, not confirmed bookings or verified suitability.</p>
      {!results.length && <div className="nearby-empty-explanation"><h4>{NEARBY_EMPTY_MESSAGES[emptyReason].title}</h4><p>{NEARBY_EMPTY_MESSAGES[emptyReason].message}</p><p>{NEARBY_EMPTY_MESSAGES[emptyReason].action}</p></div>}
      {diagnostics && <details className="nearby-search-details"><summary>Search details</summary><p>{diagnostics.sourcesFound} sources found; {diagnostics.sourcesUsed} source excerpts used; {diagnostics.candidatesReturned} candidates returned.</p>
        {diagnostics.yelpStatus && Object.hasOwn(YELP_SEARCH_MESSAGES, diagnostics.yelpStatus) && <p>{YELP_SEARCH_MESSAGES[diagnostics.yelpStatus]} {diagnostics.yelpSourcesUsed ?? 0} Yelp excerpt{diagnostics.yelpSourcesUsed === 1 ? "" : "s"} used.</p>}
        {Object.entries(diagnostics.rejected).length > 0 && <ul>{Object.entries(diagnostics.rejected).map(([reason, count]) => <li key={reason}>{count} removed: {reason === "evidence" ? "insufficient source evidence" : reason === "budget" ? "above a saved budget" : reason === "conflicts" ? "flagged constraint conflict" : reason === "duplicates" ? "duplicate place" : "incomplete or invalid details"}</li>)}</ul>}
      </details>}
      {results.map((result, index) => { const links = nearbyListingLinks(result, context); return <article className="nearby-result" key={`${result.name}-${index}`}>
        <h4>{result.name}</h4><p>{result.address}</p><p>{result.reason}</p>
        <div className="nearby-listing-links">
          <a href={links.maps} target="_blank" rel="noopener noreferrer" title={`Search Google Maps for ${result.name}`}>View on Google Maps <ExternalLink size={14} aria-hidden="true" /></a>
          <a href={links.yelp} target="_blank" rel="noopener noreferrer" title={links.yelpIsListing ? `Open the sourced Yelp business page for ${result.name}` : `Search Yelp for ${result.name}`}>View on Yelp <ExternalLink size={14} aria-hidden="true" /></a>
        </div>
        <p className="nearby-proposed-time"><Clock size={17} aria-hidden="true" />{result.proposedTime ? `${timeText(result.proposedTime.start)}–${timeText(result.proposedTime.end)} · provisional gap in ${context.zone}` : "No suitable time gap found"}</p>
        <p>{result.pricePerPersonCents !== null && result.currency ? `${(result.pricePerPersonCents / 100).toFixed(2)} ${result.currency} per person · source estimate` : "Price not confirmed"}</p>
        <ul>{result.facts.filter(f => safeSource(f.sourceUrl)).map((fact, i) => <li key={i}><strong>{fact.topic}: </strong>{fact.detail} <a href={fact.sourceUrl} target="_blank" rel="noopener noreferrer">{isYelpSource(fact.sourceUrl) ? "Yelp source" : `Source ${i + 1}`}</a></li>)}</ul>
        <details><summary>What needs confirmation</summary><ul>{result.concerns.map((concern, i) => <li key={i}>{concern}</li>)}</ul></details>
      </article>; })}
    </section>}
    {member(trip, s.userId)?.role === "Viewer" && <p className="fine-print">You can research ideas. A trip editor will need to schedule them.</p>}
  </Modal>;
}
