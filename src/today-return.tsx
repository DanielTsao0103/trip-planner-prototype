import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Navigation } from "lucide-react";
import { EventLocationInput } from "./event-location-input";
import { Button, ErrorBox } from "./ui";
import { useApp } from "./state";
import { timeText, type Event, type Trip } from "./domain";
import { eventLocation, itineraryInstant, minutesOfDay, MODE_LABELS, navigationUrl, type RouteLocation, type TravelMode } from "./today-guide";
import { arrivalText } from "./today-connections";
import { useRouteEstimates } from "./use-travel-routes";

export function ReturnJourney({ trip, last, destination, mode, onChange }: { trip: Trip; last?: Event; destination?: RouteLocation; mode: TravelMode; onChange: (place?: RouteLocation) => void }) {
  const { s } = useApp();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<RouteLocation | undefined>(destination);
  const [customOrigin, setCustomOrigin] = useState<RouteLocation>();
  const [originDraft, setOriginDraft] = useState<RouteLocation>();
  const [error, setError] = useState("");
  const [locating, setLocating] = useState(false);
  const [requestedAt, setRequestedAt] = useState(() => new Date());
  const requestId = useRef(0);
  useEffect(() => () => { requestId.current++; }, []);
  const clockRequest = useMemo(() => new Date(), [s.date, s.time]);
  const currentRequest = trip.persistence === "account" && clockRequest > requestedAt ? clockRequest : requestedAt;
  const origin = customOrigin || (last && eventLocation(last));
  const departureTime = !customOrigin && last && last.end > s.time ? last.end : s.time;
  const departure = trip.persistence === "account" && !customOrigin && last && last.end > s.time ? itineraryInstant(s.date, last.end, trip.zone).toISOString() : currentRequest.toISOString();
  const routes = useRouteEstimates(origin && destination ? [{ id: "return", origin, destination, departure, mode }] : []);
  const result = routes.results.return;
  const choices = [...(trip.savedPlaces || []).map(place => ({ label: place.name, place: place.place, point: place.point, googlePlaceId: place.googlePlaceId })), ...trip.events.map(event => ({ ...eventLocation(event), label: event.name }))].filter(place => place.place || place.point || place.googlePlaceId) as RouteLocation[];
  const startHere = () => {
    const id = ++requestId.current; setError("");
    if (!navigator.geolocation) { setError("Location isn't available. Enter a return starting point instead."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(position => {
      if (id !== requestId.current) return;
      setLocating(false); setRequestedAt(new Date());
      setCustomOrigin({ label: "Your location when requested", point: { lat: position.coords.latitude, lng: position.coords.longitude } });
    }, () => { if (id === requestId.current) { setLocating(false); setError("Couldn't get your location. Enter a return starting point instead."); } }, { timeout: 8000, maximumAge: 60000 });
  };
  return <section className="card today-return" aria-label="Return journey">
    <h2>Getting back</h2>
    {!destination && <p>Choose your hotel, parked car, or another place to return to.</p>}
    {destination ? <><p className="today-return-destination">{destination.label}</p><div className="row"><Button variant="text" onClick={() => { setDraft(destination); setEditing(value => !value); setError(""); }}>Change return place</Button><Button variant="text" onClick={() => { onChange(undefined); setDraft(undefined); setEditing(false); requestId.current++; setLocating(false); }}>Remove return place</Button></div></> : <Button variant="outline" onClick={() => { setEditing(value => !value); setError(""); }}>{editing ? "Cancel" : "Choose return place"}</Button>}
    {editing && <form className="today-origin-form" onSubmit={e => { e.preventDefault(); if (!draft?.label.trim()) { setError("Choose or enter a return place."); return; } onChange(draft); setEditing(false); setError(""); }}>
      {choices.length > 0 && <label className="today-saved-place-choice">Use a place from this trip<select aria-label="Return to a trip place" value="" onChange={e => { if (e.target.value) setDraft(choices[Number(e.target.value)]); }}><option value="">Choose a saved or scheduled place</option>{choices.map((place, index) => <option key={index} value={index}>{place.label}</option>)}</select></label>}
      <EventLocationInput label="Return address or place" required={false} maxLength={2048} value={draft?.label || ""} destinations={trip.destinations} itinerary={{ events: trip.events, date: s.date, start: last?.end || s.time }} onChange={(label, point, googlePlaceId) => { setDraft({ label, place: label, point, googlePlaceId }); setError(""); }} />
      <div className="today-origin-actions"><Button type="submit" variant="outline" onMouseDown={(e: React.MouseEvent) => e.preventDefault()}>Use return place</Button><Button variant="text" onMouseDown={(e: React.MouseEvent) => e.preventDefault()} onClick={() => { setEditing(false); setError(""); }}>Cancel</Button></div>
    </form>}
    {destination && <div className="today-return-route">
      <p><strong>From:</strong> {origin?.label || "Choose a starting point"}</p>
      {!customOrigin && last && <p className="today-route-detail">Last planned stop{last.end > s.time ? ` · leaving after ${timeText(last.end)}` : " · change this if you have moved"}.</p>}
      {origin && <div aria-live="polite">{!result ? <p>Checking return travel…</p> : result.estimate ? <><p className="today-connection-title"><strong>{MODE_LABELS[mode]} · about {result.estimate.minutes} min</strong></p><p>Depart {timeText(departureTime)} → arrive {arrivalText(minutesOfDay(departureTime) + result.estimate.minutes)}</p></> : <p>{result.error}</p>}</div>}
      <details className="today-return-start"><summary>Change starting point</summary><Button variant="text" disabled={locating} onClick={startHere}><Navigation size={16} />{locating ? "Finding return location…" : "Use my location for return"}</Button>{customOrigin && last && eventLocation(last) && <Button variant="text" onClick={() => { requestId.current++; setLocating(false); setCustomOrigin(undefined); setRequestedAt(new Date()); }}>Use last planned stop</Button>}
        <form className="today-origin-form" onSubmit={e => { e.preventDefault(); if (!originDraft?.label.trim()) { setError("Enter a return starting point."); return; } requestId.current++; setLocating(false); setCustomOrigin(originDraft); setRequestedAt(new Date()); setError(""); }}><EventLocationInput label="Return starting point" required={false} maxLength={2048} value={originDraft?.label || ""} destinations={trip.destinations} itinerary={{ events: trip.events, date: s.date, start: s.time }} onChange={(label, point, googlePlaceId) => setOriginDraft({ label, place: label, point, googlePlaceId })} /><div className="today-origin-actions"><Button type="submit" variant="outline" onMouseDown={(e: React.MouseEvent) => e.preventDefault()}>Use return start</Button></div></form>
      </details>
      <p className="today-route-detail">Using your default {MODE_LABELS[mode].toLowerCase()} preference.{mode === "DRIVE" ? " Traffic, pickup and parking are not included." : mode === "TRANSIT" ? " Recheck service and departures in Maps." : " Check crossings and access in Maps."}</p>
      {result?.estimate?.warnings.map(warning => <p className="today-route-detail" key={warning}>{warning}</p>)}
      <div className="today-navigation"><a className="btn" data-ui="button" href={navigationUrl(destination, mode, origin)} target="_blank" rel="noreferrer">Return directions <ArrowUpRight size={15} /></a>{origin && <Button variant="text" disabled={routes.loading} onClick={() => { setRequestedAt(new Date()); routes.retry(); }}>Refresh return estimate</Button>}</div>
      {result?.checkedAt && <p className="today-attribution"><span translate="no">Google Maps</span> · Checked {new Intl.DateTimeFormat(undefined, { timeZone: trip.zone, hour: "numeric", minute: "2-digit" }).format(result.checkedAt)}{trip.persistence !== "account" && " · Current routes for a sample schedule"}</p>}
    </div>}
    <ErrorBox text={error} />
    <p className="today-route-detail">Your return place stays on this device for this trip. It doesn’t add an event or change the group’s plans.</p>
  </section>;
}
