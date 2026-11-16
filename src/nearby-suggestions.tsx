import { useEffect, useRef, useState } from "react";
import { ChevronDown, ExternalLink, MapPin, Search } from "lucide-react";
import { useApp } from "./state";
import { Button, Field, Modal } from "./ui";
import { canEdit, days, dateText, eventError, member, money, timeText, uid } from "./domain";
import { MONEY_LIMITS, TEXT_LIMITS, textError } from "./limits";
import { getSupabase } from "./supabase";
import { searchDestinationPhotos, trackUnsplashSelection, type UnsplashPhoto } from "./trip-photos";
import { suggestionPhotoSearch } from "./nearby-photo-search";
import { planningContext, reviewCandidates, safeSource, nearbyListingLinks, YELP_SEARCH_MESSAGES, NEARBY_EMPTY_MESSAGES, type YelpSearchStatus, type EmptyReason, type ReviewRejections, type Intent, type NearbyResult } from "../supabase/functions/_shared/nearby.ts";
import { distinctRecommendationThoughts, recommendationLocation, recommendationTitle, recommendationNotes, recommendationSlot, recommendationGroupCost, sentenceExcerpt } from "../supabase/functions/_shared/nearby-content.ts";
import "./nearby-suggestions.css";

type NearbyPhoto = { url: string; alt: string; label: string; credit?: UnsplashPhoto["credit"]; selection?: UnsplashPhoto };

export function NearbySuggestions() {
  const { trip, s, overlay, route, updateTrip, pendingTripIds, go } = useApp();
  const preferredDate = overlay?.data?.date;
  const [date, setDate] = useState(preferredDate && trip && preferredDate >= trip.start && preferredDate <= trip.end ? preferredDate : trip && s.date >= trip.start && s.date <= trip.end ? s.date : trip?.start || "");
  const [intent, setIntent] = useState<Intent>("lunch");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<NearbyResult[] | null>(null);
  const [photos, setPhotos] = useState<Record<string, NearbyPhoto>>({});
  const [preparing, setPreparing] = useState(false);
  const [preparingLabel, setPreparingLabel] = useState("Preparing the event editor…");
  const [addError, setAddError] = useState("");
  const [emptyReason, setEmptyReason] = useState<EmptyReason>("filtered");
  const [diagnostics, setDiagnostics] = useState<{ sourcesFound: number; sourcesUsed: number; candidatesReturned: number; recoveryAttempted?: boolean; rejected: ReviewRejections; yelpStatus?: YelpSearchStatus; yelpSourcesUsed?: number } | null>(null);
  const request = useRef<AbortController | null>(null);
  const contextKey = JSON.stringify([trip?.id, trip?.destinations, trip?.zone, trip?.start, trip?.end, trip?.members, trip?.prefs, trip?.budget, trip?.budgetMode, trip?.individual, trip?.expenses, date, intent, overlay?.data?.event]);
  const eventsKey = JSON.stringify(trip?.events);
  const continuation = useRef(0);
  useEffect(() => { continuation.current += 1; setPreparing(false); return () => { continuation.current += 1; }; }, [contextKey]);
  useEffect(() => { request.current?.abort(); setResults(null); setPhotos({}); setAddError(""); setDiagnostics(null); setError(""); setLoading(false); return () => { request.current?.abort(); }; }, [contextKey]);
  useEffect(() => { continuation.current += 1; request.current?.abort(); setLoading(false); setPreparing(false); }, [eventsKey]);
  useEffect(() => {
    if (!results?.length || !trip) return;
    const controller = new AbortController();
    const photoArea = planningContext(trip, s.userId || "", date, intent, overlay?.data?.event).area;
    const searches = new Map<string, Promise<UnsplashPhoto[]>>();
    const search = (query: string) => {
      if (!query || controller.signal.aborted) return Promise.resolve([]);
      if (!searches.has(query)) searches.set(query, searchDestinationPhotos(query, controller.signal).catch(() => []));
      return searches.get(query)!;
    };
    void Promise.all(results.slice(0, 3).map(async result => {
      const plan = suggestionPhotoSearch(result, trip.destinations, photoArea);
      let photo = (await search(plan.exact)).find(photo => plan.matchesSubject(photo.searchText || ""));
      let label = "Illustrative photo of this place or activity";
      if (!photo && plan.category) {
        photo = (await search(plan.category)).find(photo => plan.matchesSubject(photo.searchText || ""));
        label = "Illustrative activity photo · not the exact venue";
      }
      if (!photo) {
        photo = (await search(plan.area)).find(photo => plan.matchesArea(photo.searchText || ""));
        label = `Area photo · ${plan.location}`;
      }
      return [result.name, photo ? { url: photo.url, alt: photo.alt, label, credit: photo.credit, selection: photo } : undefined] as const;
    })).then(entries => {
      if (!controller.signal.aborted) {
        const available: Record<string, NearbyPhoto> = {};
        for (const [name, photo] of entries) if (photo) available[name] = photo;
        setPhotos(available);
      }
    });
    return () => controller.abort();
  }, [results, trip?.id, s.userId, date, intent, overlay?.data?.event]);
  if (!trip) return <Modal title="Nearby suggestions"><p>Choose a trip to research nearby places.</p></Modal>;
  const context = planningContext(trip, s.userId || "", date, intent, overlay?.data?.event);
  const isDemo = trip.persistence !== "account";
  const pending = pendingTripIds.includes(trip.id);
  const bundledPhoto: NearbyPhoto = { url: `${import.meta.env.BASE_URL}images/city.jpg`, alt: "Illustrative city scene", label: "Illustrative photo · not the suggested venue" };
  const fallbackPhoto = bundledPhoto;
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
        setResults(distinctRecommendationThoughts(data.results));
        setEmptyReason(typeof data.emptyReason === "string" && Object.hasOwn(NEARBY_EMPTY_MESSAGES, data.emptyReason) ? data.emptyReason as EmptyReason : "filtered");
        setDiagnostics(data.diagnostics || null);
      }
    } catch (e) {
      if (!controller.signal.aborted || controller.signal.reason === "timeout") setError(controller.signal.reason === "timeout" ? "Research took too long. Please try again." : e instanceof Error ? e.message : "Could not research nearby places.");
    } finally { clearTimeout(timeout); if (request.current === controller) setLoading(false); }
  }
  const canSave = ["Owner", "Editor"].includes(member(trip,s.userId)?.role || "");
  const resultPlace = (result: NearbyResult) => recommendationLocation(result, context);
  const resultTitle = (result: NearbyResult) => recommendationTitle(result, context);
  const resultNotes = (result: NearbyResult) => recommendationNotes(result, context);
  const matchesIdea = (place: { name: string; place: string; notes: string }, result: NearbyResult) => result.kind === "guide" ? !!result.facts[0]?.sourceUrl && place.notes.includes(result.facts[0].sourceUrl) : place.name.trim().toLocaleLowerCase() === resultTitle(result).trim().toLocaleLowerCase() && place.place.trim().toLocaleLowerCase() === resultPlace(result).trim().toLocaleLowerCase();
  const alreadyAdded = (result: NearbyResult) => trip.events.some(event => matchesIdea(event, result));
  const alreadyKept = (result: NearbyResult) => [...(trip.savedPlaces || []), ...trip.events].some(place => matchesIdea(place, result));
  function saveForLater(result: NearbyResult) {
    if (!trip || !canSave || alreadyKept(result)) return;
    const place = resultPlace(result), notes = resultNotes(result);
    const problem = textError(resultTitle(result), "Place name", TEXT_LIMITS.eventName, true) || textError(place,"Location",TEXT_LIMITS.eventAddress,true) || textError(notes,"Notes",TEXT_LIMITS.notes);
    if (problem) { setAddError(problem); return; }
    let applied = false;
    updateTrip(current => {
      if (!["Owner","Editor"].includes(member(current,s.userId)?.role || "") || (current.savedPlaces?.length || 0) >= 200) return;
      if ([...(current.savedPlaces || []), ...current.events].some(item => matchesIdea(item, result))) return;
      current.savedPlaces = [...(current.savedPlaces || []), {id:uid(),name:resultTitle(result).trim(),place:place.trim(),notes,point:null,googlePlaceId:null}];
      applied = true;
    });
    setAddError(applied ? "" : "Could not add this place. Check your editing access or remove a place if your shortlist is full.");
  }
  async function continueToEvent(selected: NearbyResult) {
    if (!trip || preparing || !canEdit(trip,s.userId,date)) return;
    const generation = ++continuation.current;
    setPreparingLabel("Preparing the event editor…"); setPreparing(true); setAddError("");
    const photo = photos[selected.name] || fallbackPhoto;
    try {
      if (photo.selection) await trackUnsplashSelection(photo.selection.downloadLocation);
      if (generation !== continuation.current) return;
      const sourceNotes = resultNotes(selected);
      const photoNote = "\n" + photo.label + (photo.credit ? ". Photo by " + photo.credit.name + " on Unsplash: " + photo.credit.photoUrl : "");
      const params: Record<string, string> = {
        suggestion: resultTitle(selected),
        place: resultPlace(selected),
        date,
        notes: sourceNotes + photoNote,
        return: String(route.page === 16 ? 10 : route.page),
        ...(route.page === 8 ? {view:"calendar"} : {}),
        ...(route.page === 17 && route.params.get("days") ? {days:route.params.get("days")!} : {}),
        ...(route.params.get("map") === "hidden" ? {map:"hidden"} : {}),
      };
      const slot = recommendationSlot(selected, context.gaps);
      if (slot) { params.start = slot.start; params.end = slot.end; }
      if (selected.pricePerPersonCents !== null && selected.currency === "USD") params.cost = (recommendationGroupCost(selected,trip.members.filter(member=>member.status === "accepted").length) / 100).toFixed(2);
      params.image = photo.url;
      go(7, params);
    } catch (cause) {
      if (generation === continuation.current) setAddError(cause instanceof Error ? cause.message : "Could not prepare this itinerary item. Try again.");
    } finally { if (generation === continuation.current) setPreparing(false); }
  }
  async function addToItinerary(selected: NearbyResult) {
    if (!trip || pending || preparing || !canEdit(trip,s.userId,date) || alreadyAdded(selected)) return;
    const generation = ++continuation.current;
    setPreparingLabel("Adding to itinerary…"); setPreparing(true); setAddError("");
    const photo = photos[selected.name] || fallbackPhoto;
    try {
      if (photo.selection) await trackUnsplashSelection(photo.selection.downloadLocation);
      if (generation !== continuation.current) return;
      let problem = "", applied = false;
      updateTrip(current => {
        if (current.id !== trip.id || !canEdit(current,s.userId,date) || current.events.some(event => matchesIdea(event,selected))) return;
        const fresh = planningContext(current,s.userId || "",date,intent,overlay?.data?.event);
        const slot = recommendationSlot(selected,fresh.gaps);
        if (!slot) { problem = "No free slot remains. Choose another time in the event editor."; return; }
        if (selected.kind !== "guide" && !reviewCandidates([selected],fresh,selected.facts.map(fact=>fact.sourceUrl)).length) { problem = "Your plans or budget changed. Review this idea before adding it."; return; }
        const name = recommendationTitle(selected,fresh);
        const place = recommendationLocation(selected,fresh);
        const attendees = current.members.filter(member=>member.status === "accepted").map(member=>member.id);
        const cost = recommendationGroupCost(selected,attendees.length);
        if (!Number.isSafeInteger(cost) || cost < 0 || cost > MONEY_LIMITS.expense) { problem = "The group estimate is too large. Review the event cost before adding it."; return; }
        const notes = recommendationNotes(selected,fresh) + "\n" + photo.label + (photo.credit ? `. Photo by ${photo.credit.name}: ${photo.credit.photoUrl}` : "");
        problem = textError(name,"Event name",TEXT_LIMITS.eventName,true) || textError(place,"Location",TEXT_LIMITS.eventAddress,true) || textError(notes,"Notes",TEXT_LIMITS.notes);
        if (problem) return;
        const event = {id:uid(),name,place,notes,image:photo.url,date,start:slot.start,end:slot.end,cost,attendees,point:null,googlePlaceId:null};
        problem = eventError(current,s.userId,event);
        if (problem) return;
        current.events.push(event);
        if (current.savedPlaces && ["Owner","Editor"].includes(member(current,s.userId)?.role || "")) current.savedPlaces = current.savedPlaces.filter(place=>!matchesIdea(place,selected));
        applied = true;
      });
      if (!applied && problem) setAddError(problem);
    } catch (cause) { if (generation === continuation.current) setAddError(cause instanceof Error ? cause.message : "Could not add this idea. Try again."); }
    finally { if (generation === continuation.current) setPreparing(false); }
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
        <p>{context.budgetNote}</p><p>Recommendations are generated from live retrieved sources, not model training. Group constraints are checked against the trip snapshot; account names and emails are excluded from provider searches.</p>
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
      <h3>Options to review</h3>
      {!results.length && <div className="nearby-empty-explanation"><h4>{NEARBY_EMPTY_MESSAGES[emptyReason].title}</h4><p>{NEARBY_EMPTY_MESSAGES[emptyReason].message}</p>{diagnostics?.recoveryAttempted && <p>The AI made one follow-up pass using the same sources and trip constraints; it still found no supportable candidate.</p>}<p>{NEARBY_EMPTY_MESSAGES[emptyReason].action}</p></div>}
      {diagnostics && <details className="nearby-search-details"><summary>Search details</summary><p>{diagnostics.sourcesFound} sources found; {diagnostics.sourcesUsed} source excerpts used; {diagnostics.candidatesReturned} candidates returned{diagnostics.recoveryAttempted ? " after one follow-up pass" : ""}.</p>
        {diagnostics.yelpStatus && Object.hasOwn(YELP_SEARCH_MESSAGES, diagnostics.yelpStatus) && <p>{YELP_SEARCH_MESSAGES[diagnostics.yelpStatus]} {diagnostics.yelpSourcesUsed ?? 0} Yelp excerpt{diagnostics.yelpSourcesUsed === 1 ? "" : "s"} used.</p>}
        {Object.entries(diagnostics.rejected).length > 0 && <ul>{Object.entries(diagnostics.rejected).map(([reason, count]) => <li key={reason}>{count} removed: {reason === "evidence" ? "insufficient source evidence" : reason === "budget" ? "above a saved budget" : reason === "conflicts" ? "flagged constraint conflict" : reason === "duplicates" ? "duplicate place" : "incomplete or invalid details"}</li>)}</ul>}
      </details>}
      <div className="nearby-result-grid">{results.map((result, index) => { const links = nearbyListingLinks(result, context); const photo = photos[result.name] || fallbackPhoto; const slot = recommendationSlot(result,context.gaps); const added = alreadyAdded(result); return <article className="nearby-result" key={result.name + index}>
        <img className="nearby-result-photo" src={photo.url} alt={photo.alt} loading="lazy" onError={() => setPhotos(current => current[result.name]?.url === bundledPhoto.url ? current : { ...current, [result.name]: bundledPhoto })} />
        <small className="nearby-photo-credit">{photo.label}{photo.credit && <> · Photo by <a href={photo.credit.profileUrl} target="_blank" rel="noreferrer">{photo.credit.name}</a> on <a href={photo.credit.photoUrl} target="_blank" rel="noreferrer">Unsplash</a></>}</small>
        <h4>{resultTitle(result)}</h4>
        <aside className="nearby-fit-note"><strong>A thought for your day</strong><p>{result.fitNote || "Explore this option alongside your plans."}</p></aside>
        <dl className="nearby-planning-details">
          <dt>Proposed time</dt><dd>{slot ? `${timeText(slot.start)}–${timeText(slot.end)} · ${context.zone}` : "No suitable time gap found"}</dd>
          <dt>{result.kind === "guide" ? "Area" : "Venue"}</dt><dd>{resultPlace(result)}{result.facts.filter(f => safeSource(f.sourceUrl) && f.topic === "Venue" && f.detail !== result.address).map((fact, i) => <p className="nearby-venue-description" key={i}>{fact.detail}</p>)}</dd>
          <dt>Price</dt><dd>{result.pricePerPersonCents !== null && result.currency ? `${(result.pricePerPersonCents / 100).toFixed(2)} ${result.currency} per person · source estimate` : "Price not confirmed"}</dd>
          {result.facts.filter(f => safeSource(f.sourceUrl) && f.topic !== "Venue").map((fact, i) => <div className="nearby-planning-fact" key={i}><dt>{fact.topic === "Price" ? "Price details" : fact.topic}</dt><dd>{fact.topic === "Guide excerpt" ? sentenceExcerpt(fact.detail) || "Read the complete guide in More to consider." : fact.detail}</dd></div>)}
        </dl>
        <details className="nearby-more"><summary>More to consider <ChevronDown size={16} aria-hidden="true" /></summary>
          <div className="nearby-listing-links">
            {links.maps ? <a href={links.maps} target="_blank" rel="noopener noreferrer">View on Google Maps <ExternalLink size={14} aria-hidden="true" /></a> : <a href={links.google} target="_blank" rel="noopener noreferrer">Search on Google <ExternalLink size={14} aria-hidden="true" /></a>}
            {links.yelp && <a href={links.yelp} target="_blank" rel="noopener noreferrer" title={links.yelpIsListing ? `Open the sourced Yelp business page for ${result.name}` : `Search Yelp for ${result.name}`}>View on Yelp <ExternalLink size={14} aria-hidden="true" /></a>}
            {result.kind === "guide" && result.facts.find(fact=>safeSource(fact.sourceUrl)) && <a href={result.facts.find(fact=>safeSource(fact.sourceUrl))!.sourceUrl} target="_blank" rel="noopener noreferrer">Explore city and region ideas <ExternalLink size={14} aria-hidden="true" /></a>}
          </div>
          <h5>Sources</h5>
          <ul className="nearby-source-links">{[...new Set(result.facts.filter(f => safeSource(f.sourceUrl)).map(fact=>fact.sourceUrl))].map(url => <li key={url}><a href={url} target="_blank" rel="noopener noreferrer">{url} <ExternalLink size={12} aria-hidden="true" /></a></li>)}</ul>
          <div className="nearby-considerations fine-print"><p>Research ideas, not confirmed bookings. Check current hours, availability, travel time and your group’s needs.</p>{slot && <p>Proposed times include a provisional travel buffer; the route has not been confirmed.</p>}<ul>{result.concerns.map((concern, i) => <li key={i}>{concern}</li>)}</ul></div>
        </details>
        {trip.persistence === "account" && <div className="nearby-result-actions"><Button variant="text" disabled={pending || preparing || !canEdit(trip,s.userId,date)} onClick={() => void continueToEvent(result)}>{slot ? "Review and add to this day" : "Choose another time"}</Button>{canSave && <Button variant="text" disabled={pending || alreadyKept(result)} onClick={() => saveForLater(result)}>{alreadyKept(result) ? "Already in your plans" : "Save for later"}</Button>}<Button variant="nearby-add" disabled={pending || preparing || added || !slot || !canEdit(trip,s.userId,date)} onClick={() => void addToItinerary(result)}>{added ? pending ? "Adding to itinerary…" : "Added to itinerary" : "Add to itinerary"}</Button></div>}
      </article>; })}</div>
    </section>}
    {!canEdit(trip,s.userId,date) && <p className="fine-print">You can research ideas. An editor with access to this day will need to schedule them.</p>}
    {preparing && <p role="status">{preparingLabel}</p>}
    {addError && <p role="alert" className="error-box">{addError}</p>}
  </Modal>;
}
