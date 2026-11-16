import { useEffect, useRef, useState } from "react";
import { ChevronDown, ExternalLink, MapPin, Search, Navigation } from "lucide-react";
import { useApp } from "./state";
import { Button, Field, Modal } from "./ui";
import { canEdit, days, dateText, eventError, member, money, timeText, uid } from "./domain";
import { MONEY_LIMITS, TEXT_LIMITS, textError } from "./limits";
import { getSupabase } from "./supabase";
import { EventLocationInput } from "./event-location-input";
import { searchNearbyPlaces, hasLocatedPlace, type LocatedSuggestion, type SearchLocation } from "./nearby-places";
import { searchDestinationPhotos, trackUnsplashSelection, type UnsplashPhoto } from "./trip-photos";
import { suggestionPhotoSearch } from "./nearby-photo-search";
import { planningContext, reviewCandidates, safeSource, nearbyListingLinks, NEARBY_EMPTY_MESSAGES, type EmptyReason, type Intent, type NearbyResult } from "../supabase/functions/_shared/nearby.ts";
import { distinctRecommendationThoughts, recommendationLocation, recommendationTitle, recommendationNotes, recommendationSlot, recommendationGroupCost, sentenceExcerpt } from "../supabase/functions/_shared/nearby-content.ts";
import "./nearby-suggestions.css";

type NearbyPhoto = { url: string; alt: string; label: string; credit?: UnsplashPhoto["credit"]; selection?: UnsplashPhoto };
const cityIdeasSearch = (area: string) => {
  const search = new URL("https://www.google.com/search");
  search.searchParams.set("q", `official tourism city and region ideas ${area}`);
  return search.href;
};

export function NearbySuggestions({ embedded = false, initialDate }: { embedded?: boolean; initialDate?: string } = {}) {
  const { trip, s, overlay, route, updateTrip, updateTripConfirmed, pendingTripIds, go } = useApp();
  const preferredDate = initialDate || overlay?.data?.date;
  const anchorId = embedded ? undefined : overlay?.data?.event;
  const [date, setDate] = useState(preferredDate && trip && preferredDate >= trip.start && preferredDate <= trip.end ? preferredDate : trip && s.date >= trip.start && s.date <= trip.end ? s.date : trip?.start || "");
  const [intent, setIntent] = useState<Intent>("lunch");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<LocatedSuggestion[] | null>(null);
  const [photos, setPhotos] = useState<Record<string, NearbyPhoto>>({});
  const [preparing, setPreparing] = useState(false);
  const [preparingLabel, setPreparingLabel] = useState("Preparing the event editor…");
  const [addError, setAddError] = useState("");
  const [emptyReason, setEmptyReason] = useState<EmptyReason>("filtered");
  const [location, setLocation] = useState<SearchLocation>();
  const [editingLocation, setEditingLocation] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [checkedAt, setCheckedAt] = useState<string>();
  const [resultSource, setResultSource] = useState<"google" | "web">("web");
  const locationRequest = useRef(0);
  const request = useRef<AbortController | null>(null);
  useEffect(() => { if (initialDate) setDate(initialDate); }, [initialDate]);
  useEffect(() => () => { locationRequest.current++; }, []);
  const contextKey = JSON.stringify([trip?.id, trip?.destinations, trip?.zone, trip?.start, trip?.end, trip?.members, trip?.prefs, trip?.budget, trip?.budgetMode, trip?.individual, trip?.expenses, date, intent, anchorId, location]);
  const eventsKey = JSON.stringify(trip?.events);
  const continuation = useRef(0);
  useEffect(() => { continuation.current += 1; setPreparing(false); return () => { continuation.current += 1; }; }, [contextKey]);
  useEffect(() => { request.current?.abort(); setResults(null); setPhotos({}); setAddError(""); setError(""); setLoading(false); return () => { request.current?.abort(); }; }, [contextKey]);
  useEffect(() => { continuation.current += 1; request.current?.abort(); setLoading(false); setPreparing(false); }, [eventsKey]);
  useEffect(() => {
    if (!results?.length || !trip) return;
    const controller = new AbortController();
    const photoArea = location?.label || planningContext(trip, s.userId || "", date, intent, anchorId).area;
    const searches = new Map<string, Promise<UnsplashPhoto[]>>();
    const search = (query: string) => {
      if (!query || controller.signal.aborted) return Promise.resolve([]);
      if (!searches.has(query)) searches.set(query, searchDestinationPhotos(query, controller.signal).catch(() => []));
      return searches.get(query)!;
    };
    void Promise.all(results.slice(0, 3).map(async result => {
      const plan = suggestionPhotoSearch(result, trip.destinations, result.researchArea || photoArea);
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
  }, [results, trip?.id, s.userId, date, intent, anchorId, location?.label]);
  if (!trip) return <Modal title="Nearby suggestions"><p>Choose a trip to research nearby places.</p></Modal>;
  const baseContext = planningContext(trip, s.userId || "", date, intent, anchorId);
  const context = location?.label.trim() ? { ...baseContext, area: location.label.trim(), locationNote: "" } : baseContext;
  const nextAvailableDay = context.gaps.length ? undefined : days(trip.start, trip.end).find(day =>
    day > date && planningContext(trip, s.userId || "", day, intent).gaps.length > 0);
  const isDemo = trip.persistence !== "account";
  const pending = pendingTripIds.includes(trip.id);
  const bundledPhoto: NearbyPhoto = { url: `${import.meta.env.BASE_URL}images/city.jpg`, alt: "Illustrative city scene", label: "Illustrative photo · not the suggested venue" };
  const fallbackPhoto = bundledPhoto;
  function useCurrentLocation() {
    const generation = ++locationRequest.current;
    setLocationError("");
    if (!navigator.geolocation) { setLocationError("Location is unavailable. Enter a place or address instead."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(position => {
      if (generation !== locationRequest.current) return;
      setLocating(false); setEditingLocation(false);
      setLocation({ label: "Current location", point: { lat: position.coords.latitude, lng: position.coords.longitude } });
    }, () => {
      if (generation !== locationRequest.current) return;
      setLocating(false); setLocationError("Couldn't get your location. Allow location access or enter an address.");
    }, { timeout: 7000, maximumAge: 30000, enableHighAccuracy: false });
  }
  async function research(webOnly = false) {
    if (!trip || isDemo || pending) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setLoading(true); if (!webOnly) setResults(null); setError(""); setAddError("");
    const timeout = setTimeout(() => controller.abort("timeout"), 45000);
    try {
      if (!webOnly) {
        const anchor = trip.events.find(event => event.id === context.anchorId);
        const searchLocation = location || (anchor?.point ? { label: context.area, point: anchor.point, googlePlaceId: anchor.googlePlaceId || undefined } : undefined);
        const fast = await searchNearbyPlaces(context, searchLocation, controller.signal, import.meta.env.VITE_GOOGLE_MAPS_DEMO_API_KEY?.trim() || "").catch(() => []);
        if (controller.signal.aborted) return;
        if (fast.length) {
          setResults(fast.map(result => ({ ...result, researchArea: context.area })));
          setResultSource("google"); setCheckedAt(new Date().toISOString()); return;
        }
      }
      const client = getSupabase();
      const { data, error: failure } = await client.functions.invoke("nearby-suggestions", {
        body: { tripId: trip.id, revision: trip.revision, date, intent, anchorId, ...(location ? { location } : {}) }, signal: controller.signal,
      });
      if (failure) {
        const response = failure.context;
        const detail = response instanceof Response ? await response.clone().json().catch(() => null) : null;
        throw new Error(detail?.message || "Nearby research is unavailable. Please try again.");
      }
      if (!data || !Array.isArray(data.results)) throw new Error("Research returned an invalid response.");
      if (!controller.signal.aborted) {
        if (webOnly && !data.results.length && results?.length) {
          setError("No additional source-backed options found. Your current places are still available.");
        } else {
          setResults(distinctRecommendationThoughts(data.results.map((result: NearbyResult)=>({...result,researchArea:context.area}))));
          setResultSource("web"); setCheckedAt(typeof data.checkedAt === "string" ? data.checkedAt : new Date().toISOString());
        }
        setEmptyReason(typeof data.emptyReason === "string" && Object.hasOwn(NEARBY_EMPTY_MESSAGES, data.emptyReason) ? data.emptyReason as EmptyReason : "filtered");
      }
    } catch (e) {
      if (!controller.signal.aborted || controller.signal.reason === "timeout") setError(controller.signal.reason === "timeout" ? "Research took too long. Please try again." : e instanceof Error ? e.message : "Could not research nearby places.");
    } finally { clearTimeout(timeout); if (request.current === controller) setLoading(false); }
  }
  const canSave = ["Owner", "Editor"].includes(member(trip,s.userId)?.role || "");
  const resultPlace = (result: NearbyResult) => recommendationLocation(result, context);
  const resultTitle = (result: NearbyResult) => recommendationTitle(result, context);
  const eventTitle = (result: NearbyResult) => resultTitle(result).slice(0,TEXT_LIMITS.eventName).trim();
  const resultNotes = (result: NearbyResult) => recommendationNotes(result, context);
  const matchesIdea = (place: { name: string; place: string; notes: string }, result: NearbyResult) => result.kind === "guide" ? !!result.facts[0]?.sourceUrl && place.notes.includes(result.facts[0].sourceUrl) : place.name.trim().toLocaleLowerCase() === eventTitle(result).toLocaleLowerCase() && place.place.trim().toLocaleLowerCase() === resultPlace(result).trim().toLocaleLowerCase();
  const alreadyAdded = (result: NearbyResult) => trip.events.some(event => matchesIdea(event, result));
  const alreadyKept = (result: NearbyResult) => [...(trip.savedPlaces || []), ...trip.events].some(place => matchesIdea(place, result));
  function saveForLater(result: NearbyResult) {
    if (!trip || !canSave || alreadyKept(result) || !hasLocatedPlace(result)) return;
    const place = resultPlace(result), notes = resultNotes(result);
    const problem = textError(eventTitle(result), "Place name", TEXT_LIMITS.eventName, true) || textError(place,"Location",TEXT_LIMITS.eventAddress,true) || textError(notes,"Notes",TEXT_LIMITS.notes);
    if (problem) { setAddError(problem); return; }
    let applied = false;
    updateTrip(current => {
      if (!["Owner","Editor"].includes(member(current,s.userId)?.role || "") || (current.savedPlaces?.length || 0) >= 200) return;
      if ([...(current.savedPlaces || []), ...current.events].some(item => matchesIdea(item, result))) return;
      current.savedPlaces = [...(current.savedPlaces || []), {id:uid(),name:eventTitle(result),place:place.trim(),notes,point:(result as LocatedSuggestion).point || null,googlePlaceId:(result as LocatedSuggestion).googlePlaceId || null}];
      applied = true;
    });
    setAddError(applied ? "" : "Could not add this place. Check your editing access or remove a place if your shortlist is full.");
  }
  async function continueToEvent(selected: NearbyResult) {
    if (!trip || preparing || !canEdit(trip,s.userId,date) || !hasLocatedPlace(selected)) return;
    const generation = ++continuation.current;
    setPreparingLabel("Preparing the event editor…"); setPreparing(true); setAddError("");
    const photo = photos[selected.name] || fallbackPhoto;
    try {
      if (photo.selection) void trackUnsplashSelection(photo.selection.downloadLocation).catch(() => undefined);
      if (generation !== continuation.current) return;
      const sourceNotes = resultNotes(selected);
      const photoNote = "\n" + photo.label + (photo.credit ? ". Photo by " + photo.credit.name + " on Unsplash: " + photo.credit.photoUrl : "");
      const params: Record<string, string> = {
        suggestion: eventTitle(selected),
        place: resultPlace(selected),
        ...((selected as LocatedSuggestion).point ? {lat:String((selected as LocatedSuggestion).point!.lat),lng:String((selected as LocatedSuggestion).point!.lng)} : {}),
        ...((selected as LocatedSuggestion).googlePlaceId ? {googlePlaceId:(selected as LocatedSuggestion).googlePlaceId!} : {}),
        date,
        notes: sourceNotes + photoNote,
        return: String(route.page === 16 ? 10 : route.page),
        ...(route.page === 8 ? {view:"calendar"} : {}),
        ...(route.page === 17 && route.params.get("days") ? {days:route.params.get("days")!} : {}),
        ...(route.params.get("map") === "hidden" ? {map:"hidden"} : {}),
      };
      const slot = recommendationSlot(selected, context.gaps);
      if (slot) { params.start = slot.start; params.end = slot.end; }
      else if ((selected as LocatedSuggestion).openingWindows) { params.start = ""; params.end = ""; }
      if (selected.pricePerPersonCents !== null && selected.currency === "USD") params.cost = (recommendationGroupCost(selected,trip.members.filter(member=>member.status === "accepted").length) / 100).toFixed(2);
      params.image = photo.url;
      go(7, params);
    } catch (cause) {
      if (generation === continuation.current) setAddError(cause instanceof Error ? cause.message : "Could not prepare this itinerary item. Try again.");
    } finally { if (generation === continuation.current) setPreparing(false); }
  }
  async function addToItinerary(selected: NearbyResult) {
    if (!trip || pending || preparing || !canEdit(trip,s.userId,date) || alreadyAdded(selected) || !hasLocatedPlace(selected)) return;
    const generation = ++continuation.current;
    setPreparingLabel("Adding to itinerary…"); setPreparing(true); setAddError("");
    const photo = photos[selected.name] || fallbackPhoto;
    try {
      if (photo.selection) void trackUnsplashSelection(photo.selection.downloadLocation).catch(() => undefined);
      if (generation !== continuation.current) return;
      let problem = "", applied = false;
      await updateTripConfirmed(current => {
        if (current.id !== trip.id || !canEdit(current,s.userId,date) || current.events.some(event => matchesIdea(event,selected))) return;
        const fresh = planningContext(current,s.userId || "",date,intent,anchorId);
        const slot = recommendationSlot(selected,fresh.gaps);
        if (!slot) { problem = "No free slot remains. Choose another time in the event editor."; return; }
        if (selected.kind !== "guide" && !reviewCandidates([selected],fresh,selected.facts.map(fact=>fact.sourceUrl)).length) { problem = "Your plans or budget changed. Review this idea before adding it."; return; }
        const name = recommendationTitle(selected,fresh).slice(0,TEXT_LIMITS.eventName).trim();
        const place = recommendationLocation(selected,fresh);
        const attendees = current.members.filter(member=>member.status === "accepted").map(member=>member.id);
        const cost = recommendationGroupCost(selected,attendees.length);
        if (!Number.isSafeInteger(cost) || cost < 0 || cost > MONEY_LIMITS.expense) { problem = "The group estimate is too large. Review the event cost before adding it."; return; }
        const notes = recommendationNotes(selected,fresh) + "\n" + photo.label + (photo.credit ? `. Photo by ${photo.credit.name}: ${photo.credit.photoUrl}` : "");
        problem = textError(name,"Event name",TEXT_LIMITS.eventName,true) || textError(place,"Location",TEXT_LIMITS.eventAddress,true) || textError(notes,"Notes",TEXT_LIMITS.notes);
        if (problem) return;
        const event = {id:uid(),name,place,notes,image:photo.url,date,start:slot.start,end:slot.end,cost,attendees,point:(selected as LocatedSuggestion).point || null,googlePlaceId:(selected as LocatedSuggestion).googlePlaceId || null};
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
  const content = <>
    <p className="nearby-intro">Find real places around your plans, with addresses ready to add to your itinerary.</p>
    <div className="nearby-research-controls">
      {!embedded && <Field label="Trip day"><select value={date} onChange={e => setDate(e.target.value)}>{days(trip.start, trip.end).map(day => <option key={day} value={day}>{dateText(day)}</option>)}</select></Field>}
      <Field label="Find"><select value={intent} onChange={e => setIntent(e.target.value as Intent)}><option value="lunch">Lunch</option><option value="dinner">Dinner</option><option value="activity">Things to do</option></select></Field>
    </div>
    <div className="nearby-context-panel">
      <p><MapPin size={17} aria-hidden="true" /><strong>{context.area || "Add a trip destination first"}</strong></p>
      {context.locationNote && <p>{context.locationNote}</p>}
      <div className="nearby-location-actions"><Button variant="text" onClick={() => setEditingLocation(value => !value)}>{editingLocation ? "Close location search" : "Change location"}</Button><Button variant="text" disabled={locating} onClick={useCurrentLocation}><Navigation size={16}/>{locating ? "Finding location…" : "Use my location"}</Button>{location && <Button variant="text" onClick={() => { locationRequest.current++; setLocating(false); setLocation(undefined); }}>Use itinerary location</Button>}</div>
      {editingLocation && <EventLocationInput label="Search around" required={false} value={location?.label || ""} destinations={trip.destinations} itinerary={{events:trip.events,date,start:context.gaps[0]?.start || "12:00"}} onChange={(label,point,googlePlaceId) => { setLocationError(""); locationRequest.current++; setLocating(false); setLocation({label,...(point ? {point}:{}),...(googlePlaceId?{googlePlaceId}:{})}); }} />}
      {locationError && <p role="alert" className="error-box">{locationError}</p>}
      <p>{context.answered} of {context.travelers} travelers shared preferences.</p>
      <details><summary>Planning details used</summary>
        <dl><dt>Dietary needs</dt><dd>{context.diet.join(", ") || "None shared"}</dd><dt>Accessibility</dt><dd>{context.access.join(", ") || "None shared"}</dd><dt>Walking limit</dt><dd>{context.walkMeters === null ? "Not shared" : `${context.walkMeters} m (most restrictive response)`}</dd><dt>Budget reservation</dt><dd>{context.remainingGroupCents === null ? context.individualRemaining.length ? "Individual budgets checked separately" : "No group budget set" : `${money(context.remainingGroupCents)} remaining for the group`}</dd></dl>
        <p>{context.budgetNote}</p>
      </details>
    </div>
    {isDemo && <p className="info-banner">Nearby research is available on account trips.</p>}
    {pending && <p role="status">Waiting for your trip changes to finish saving before researching.</p>}
    {!context.gaps.length && <div className="nearby-day-recovery"><p role="status">No free hour in this day’s {intent === "activity" ? "planning" : intent} window including 30 minutes between stops.</p>{nextAvailableDay ? <Button variant="outline" onClick={() => setDate(nextAvailableDay)}>Try {dateText(nextAvailableDay, true)}</Button> : <p>Choose another day or a different kind of idea.</p>}</div>}
    <Button onClick={() => void research()} disabled={loading || isDemo || pending || !context.area || !context.gaps.length}><Search size={17} />{loading ? "Finding nearby places…" : "Find nearby suggestions"}</Button>
    {loading && <p role="status">Looking for places with real addresses. Your plans and preferences stay in view.</p>}
    {error && <p role="alert" className="error-box">{error}</p>}
    {results !== null && <section className="nearby-results" aria-label="Research results" aria-live="polite">
      <div className="nearby-results-heading"><h3>{intent === "activity" ? "Activities to do" : "Places to eat"}</h3>{checkedAt && Number.isFinite(Date.parse(checkedAt)) && <span className="fine-print">Checked {new Intl.DateTimeFormat(undefined,{hour:"numeric",minute:"2-digit"}).format(new Date(checkedAt))}</span>}</div>
      {results.length > 0 && resultSource === "google" && <p className="nearby-provider" translate="no">Google Maps</p>}
      {!results.length && <div className="nearby-empty-explanation"><h4>{NEARBY_EMPTY_MESSAGES[emptyReason].title}</h4><p>{NEARBY_EMPTY_MESSAGES[emptyReason].message}</p><p>{NEARBY_EMPTY_MESSAGES[emptyReason].action}</p></div>}
      <div className="nearby-result-grid">{results.map((result, index) => { const links = nearbyListingLinks(result, context); const photo = photos[result.name] || fallbackPhoto; const scheduled = trip.events.find(event=>matchesIdea(event,result)); const slot = scheduled ? {start:scheduled.start,end:scheduled.end} : recommendationSlot(result,context.gaps); const added = !!scheduled; return <article className="nearby-result" key={result.name + index}>
        <img className="nearby-result-photo" src={photo.url} alt={photo.alt} loading="lazy" onError={() => setPhotos(current => current[result.name]?.url === bundledPhoto.url ? current : { ...current, [result.name]: bundledPhoto })} />
        <small className="nearby-photo-credit">{photo.label}{photo.credit && <> · Photo by <a href={photo.credit.profileUrl} target="_blank" rel="noreferrer">{photo.credit.name}</a> on <a href={photo.credit.photoUrl} target="_blank" rel="noreferrer">Unsplash</a></>}</small>
        <h4>{resultTitle(result)}</h4>
        <aside className="nearby-fit-note"><strong>A thought for your day</strong><p>{result.fitNote || "Explore this option alongside your plans."}</p></aside>
        <dl className="nearby-planning-details">
          <dt>{added ? "Scheduled time" : "Proposed time"}</dt><dd>{slot ? `${timeText(slot.start)}–${timeText(slot.end)} · ${context.zone}` : result.openingWindows ? "Regular hours do not fit this day’s free time" : "No suitable time gap found"}</dd>
          <dt>Address</dt><dd>{hasLocatedPlace(result) ? resultPlace(result) : "Choose the exact place before adding this idea"}{result.facts.filter(f => safeSource(f.sourceUrl) && f.topic === "Venue" && f.detail !== result.address).map((fact, i) => <p className="nearby-venue-description" key={i}>{fact.detail}</p>)}</dd>
          {result.provider === "google" && <><dt>Regular hours</dt><dd>{result.openingHours?.length ? result.openingHoursSummary || "See the weekly hours below" : "Not available — check Google Maps"}{!!result.openingHours?.length && <small className="nearby-hours-zone">Venue local time{result.openingHoursZone ? ` · ${result.openingHoursZone.replaceAll("_"," ")}` : ""}</small>}{result.openingWindows === undefined && <small className="nearby-hours-zone">Confirm hours for the proposed time.</small>}</dd></>}
          <dt>Price</dt><dd>{result.pricePerPersonCents !== null && result.currency ? `${(result.pricePerPersonCents / 100).toFixed(2)} ${result.currency} per person · source estimate` : "Price not confirmed"}</dd>
          {result.facts.filter(f => safeSource(f.sourceUrl) && f.topic !== "Venue").map((fact, i) => <div className="nearby-planning-fact" key={i}><dt>{fact.topic === "Price" ? "Price details" : fact.topic}</dt><dd>{fact.topic === "Guide excerpt" ? sentenceExcerpt(fact.detail) || "Read the complete guide in More to consider." : fact.detail}</dd></div>)}
        </dl>
        {!hasLocatedPlace(result) && <div className="nearby-location-confirm"><EventLocationInput label={`Location for ${result.name}`} required={false} value={result.address || ""} destinations={[location?.label || context.area]} onChange={(address,point,googlePlaceId) => setResults(current => current?.map(item => item === result ? {...item,address,point:point || undefined,googlePlaceId:googlePlaceId || undefined,addressVerified:!!point || !!googlePlaceId,kind:undefined,recommendationType:intent === "activity" ? "activity" : "place"} : item) || null)} /></div>}
        {!!result.attributions?.length && <p className="nearby-provider">{result.attributions.map((source,index) => source.uri ? <a key={index} href={source.uri} target="_blank" rel="noreferrer">{source.displayName}</a> : <span key={index}>{source.displayName}</span>)}</p>}
        <details className="nearby-more"><summary>More to consider <ChevronDown size={16} aria-hidden="true" /></summary>
          <div className="nearby-listing-links">
            {result.website && safeSource(result.website) && <a href={result.website} target="_blank" rel="noopener noreferrer">Official website <ExternalLink size={14} aria-hidden="true" /></a>}
            {links.maps ? <a href={links.maps} target="_blank" rel="noopener noreferrer">View on Google Maps <ExternalLink size={14} aria-hidden="true" /></a> : <a href={links.google} target="_blank" rel="noopener noreferrer">Search on Google <ExternalLink size={14} aria-hidden="true" /></a>}
            {links.yelp && <a href={links.yelp} target="_blank" rel="noopener noreferrer" title={links.yelpIsListing ? `Open the sourced Yelp business page for ${result.name}` : `Search Yelp for ${result.name}`}>View on Yelp <ExternalLink size={14} aria-hidden="true" /></a>}
            {result.kind === "guide" && result.facts.find(fact=>safeSource(fact.sourceUrl))
              ? <a href={result.facts.find(fact=>safeSource(fact.sourceUrl))!.sourceUrl} target="_blank" rel="noopener noreferrer">Explore city and region ideas <ExternalLink size={14} aria-hidden="true" /></a>
              : <a href={cityIdeasSearch(context.area)} target="_blank" rel="noopener noreferrer">Explore city and region ideas <ExternalLink size={14} aria-hidden="true" /></a>}
          </div>
          {!!result.openingHours?.length && <><h5>Regular weekly hours</h5><ul className="nearby-weekly-hours">{result.openingHours.map((hours,index) => <li key={index}>{hours}</li>)}</ul><p className="fine-print">Holiday hours and future schedules may change. Confirm the date in Google Maps.</p></>}
          <h5>Sources</h5>
          <ul className="nearby-source-links">{[...new Set(result.facts.filter(f => safeSource(f.sourceUrl)).map(fact=>fact.sourceUrl))].map(url => <li key={url}><a href={url} target="_blank" rel="noopener noreferrer">{url} <ExternalLink size={12} aria-hidden="true" /></a></li>)}</ul>
          <div className="nearby-considerations fine-print"><p>Research ideas, not confirmed bookings. Check current hours, availability, travel time and your group’s needs.</p>{slot && <p>Proposed times include time between stops. Check the route before setting out.</p>}<ul>{result.concerns.map((concern, i) => <li key={i}>{concern}</li>)}</ul></div>
        </details>
        {trip.persistence === "account" && <div className="nearby-result-actions"><Button variant="text" disabled={pending || preparing || added || !canEdit(trip,s.userId,date) || !hasLocatedPlace(result)} onClick={() => void continueToEvent(result)}>{slot ? "Review and add to this day" : "Choose another time"}</Button>{canSave && <Button variant="text" disabled={pending || alreadyKept(result) || !hasLocatedPlace(result)} onClick={() => saveForLater(result)}>{alreadyKept(result) ? "Already in your plans" : "Save for later"}</Button>}<Button variant="nearby-add" disabled={pending || preparing || added || !slot || !canEdit(trip,s.userId,date) || !hasLocatedPlace(result)} onClick={() => void addToItinerary(result)}>{added ? pending ? "Adding to itinerary…" : "Added to itinerary" : "Add to itinerary"}</Button></div>}
      </article>; })}</div>
      {results.length > 0 && resultSource === "google" && <Button variant="text" disabled={loading || pending} onClick={() => void research(true)}>Research more options</Button>}
    </section>}
    {!canEdit(trip,s.userId,date) && <p className="fine-print">You can research ideas. An editor with access to this day will need to schedule them.</p>}
    {preparing && <p role="status">{preparingLabel}</p>}
    {addError && <p role="alert" className="error-box">{addError}</p>}
  </>;
  return embedded ? <section className="nearby-research-page" aria-label="Nearby suggestions">{content}</section> : <Modal title="Nearby suggestions" wide className="nearby-research-modal">{content}</Modal>;
}
