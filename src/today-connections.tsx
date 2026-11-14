import React, { useState } from "react";
import { ArrowUpRight, Footprints, TrainFront, Car } from "lucide-react";
import { useApp } from "./state";
import { Button } from "./ui";
import { timeText, type Event, type Trip } from "./domain";
import { ARRIVAL_BUFFER, clockTime, eventLocation, itineraryInstant, minutesOfDay, MODE_LABELS, navigationUrl, TRAVEL_MODES, type TravelMode } from "./today-guide";
import { useRouteEstimates, type RouteRequest } from "./use-travel-routes";
import type { TodayChoices } from "./today-personal";

const icons = { WALK: Footprints, TRANSIT: TrainFront, DRIVE: Car };
export const connectionId = (date: string, from: Event, to: Event) => `${date}:${from.id}:${to.id}`;
export const arrivalText = (minutes: number) => `${timeText(clockTime(minutes))}${minutes >= 1440 ? ` (+${Math.floor(minutes / 1440)} day)` : ""}`;

export function DayMode({ mode, onChange }: { mode: TravelMode; onChange: (mode: TravelMode) => void }) {
  return <div className="today-day-mode"><span>Default travel preference</span><div role="group" aria-label="Default travel preference">{TRAVEL_MODES.map(value => { const Icon = icons[value]; return <button type="button" key={value} aria-pressed={value === mode} onClick={() => onChange(value)}><Icon size={17} />{MODE_LABELS[value]}</button>; })}</div></div>;
}

export function RestOfToday({ trip, events, choices, onChange }: { trip: Trip; events: Event[]; choices: TodayChoices; onChange: (choices: TodayChoices) => void }) {
  const { s, go } = useApp();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Pin sample routing to the real clock once. A sample itinerary's historical transit date is not service data.
  const [sampleNow] = useState(() => new Date());
  const legs = events.slice(1).map((to, index) => {
    const from = events[index], id = connectionId(s.date, from, to);
    const origin = eventLocation(from), destination = eventLocation(to), mode = choices.overrides[id] || choices.mode;
    const departure = trip.persistence === "account" ? itineraryInstant(s.date, from.end, trip.zone).toISOString() : sampleNow.toISOString();
    return { from, to, id, origin, destination, mode, departure };
  });
  const requests: RouteRequest[] = legs.flatMap(leg => !leg.origin || !leg.destination ? [] : (expanded[leg.id] ? TRAVEL_MODES : [leg.mode]).map(mode => ({ id: `${leg.id}:${mode}`, origin: leg.origin!, destination: leg.destination!, departure: leg.departure, mode })));
  const routes = useRouteEstimates(requests);
  let total = 0, known = 0, tight = 0;
  for (const leg of legs) {
    const estimate = routes.results[`${leg.id}:${leg.mode}`]?.estimate;
    if (!estimate) continue;
    total += estimate.minutes; known++;
    if (minutesOfDay(leg.from.end) + estimate.minutes + ARRIVAL_BUFFER > minutesOfDay(leg.to.start)) tight++;
  }
  const summary = legs.length ? `${known ? ` · about ${total} min travel${known < legs.length ? " estimated so far" : " between stops"}` : ""}${tight ? ` · ${tight} tight connection${tight > 1 ? "s" : ""}` : ""}${known < legs.length ? ` · ${legs.length - known} estimate${legs.length - known > 1 ? "s" : ""} ${routes.loading ? "pending" : "unavailable"}` : ""}` : "";
  return <section className="card today-rest">
    <details className="today-rest-disclosure"><summary><span>Rest of today</span><span className="muted" aria-live="polite">{events.length} {events.length === 1 ? "plan" : "plans"} remaining{summary}</span></summary>
      <p className="today-route-detail">Each journey starts where the previous stop ends. Custom choices stay selected when you change the default.</p>
      {events.length ? <ol className="today-timeline">{events.map((event, index) => {
        const leg = legs[index];
        const result = leg && routes.results[`${leg.id}:${leg.mode}`];
        const estimate = result?.estimate;
        const arrival = leg && estimate ? minutesOfDay(leg.from.end) + estimate.minutes : undefined;
        const late = leg && arrival != null ? arrival - minutesOfDay(leg.to.start) : 0;
        const Icon = leg ? icons[leg.mode] : Footprints;
        return <React.Fragment key={event.id}>
          <li className="today-timeline-stop"><span>{timeText(event.start)}–{timeText(event.end)}</span><button type="button" onClick={() => go(11, { date: event.date, event: event.id })}><strong>{event.name}</strong><small>{event.place || "Location not set"}</small><ArrowUpRight size={15} /></button></li>
          {leg && <li className="today-connection" aria-label={`Travel from ${leg.from.name} to ${leg.to.name}`}>
            <p className="today-connection-title"><Icon size={17} /><strong>{MODE_LABELS[leg.mode]}{estimate ? ` · about ${estimate.minutes} min` : ""}</strong>{choices.overrides[leg.id] && <span className="today-custom">Custom</span>}</p>
            {!leg.origin || !leg.destination ? <p>Location missing for {!leg.origin ? leg.from.name : leg.to.name}. Open the event to add it.</p> : !result ? <p>Checking travel time…</p> : !estimate ? <p>{result.error}</p> : <>
              <p>Depart {timeText(leg.from.end)} → arrive {arrivalText(arrival!)}</p>
              <p className={late > 0 ? "today-late" : "today-route-detail"}>{late > 0 ? `About ${late} min after ${leg.to.name} starts.` : late + ARRIVAL_BUFFER > 0 ? `On time, with ${-late} min before the start; less than your ${ARRIVAL_BUFFER} min arrival buffer.` : `${-late - ARRIVAL_BUFFER} min spare after a ${ARRIVAL_BUFFER} min arrival buffer.`}</p>
            </>}
            <details className="today-connection-details" onToggle={e => { const open = e.currentTarget.open; setExpanded(value => value[leg.id] === open ? value : { ...value, [leg.id]: open }); }}>
              <summary>Travel options</summary>
              <label>For this connection<select aria-label={`Travel mode from ${leg.from.name} to ${leg.to.name}`} value={choices.overrides[leg.id] || ""} onChange={e => { const overrides = { ...choices.overrides }; if (e.target.value) overrides[leg.id] = e.target.value as TravelMode; else delete overrides[leg.id]; onChange({ ...choices, overrides }); }}><option value="">Use default ({MODE_LABELS[choices.mode]})</option>{TRAVEL_MODES.map(mode => <option value={mode} key={mode}>{MODE_LABELS[mode]}</option>)}</select></label>
              <div className="today-comparison">{TRAVEL_MODES.map(mode => <span key={mode}>{MODE_LABELS[mode]}: {routes.results[`${leg.id}:${mode}`]?.estimate ? `${routes.results[`${leg.id}:${mode}`]!.estimate!.minutes} min` : !leg.origin || !leg.destination ? "location needed" : !routes.results[`${leg.id}:${mode}`] ? "checking…" : "unavailable"}</span>)}</div>
              <p className="today-route-detail">{leg.mode === "DRIVE" ? "Traffic, parking and pickup time are not included." : leg.mode === "TRANSIT" ? "May include walking. Recheck service and departures in Maps." : "Check crossings, sidewalks and access in Maps."}</p>
              {estimate?.warnings.map(warning => <p className="today-route-detail" key={warning}>{warning}</p>)}
              {leg.origin && leg.destination && <a href={navigationUrl(leg.destination, leg.mode, leg.origin)} target="_blank" rel="noreferrer">Directions to {leg.to.name} <ArrowUpRight size={14} /></a>}
              {result?.checkedAt && <p className="today-attribution"><span translate="no">Google Maps</span> · Checked {new Intl.DateTimeFormat(undefined, { timeZone: trip.zone, hour: "numeric", minute: "2-digit" }).format(result.checkedAt)}</p>}
            </details>
          </li>}
        </React.Fragment>;
      })}</ol> : <p>No scheduled plans left today.</p>}
      {legs.length > 0 && <><p className="today-attribution"><span translate="no">Google Maps</span> · Estimates, not guaranteed arrival times.{trip.persistence !== "account" && " Current routes applied to a sample schedule."}</p><Button variant="text" disabled={routes.loading} onClick={routes.retry}>Refresh connections</Button></>}
    </details>
    <Button variant="text" onClick={() => go(11, { date: s.date })}>View the full day <ArrowUpRight size={15} /></Button>
  </section>;
}
