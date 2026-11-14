import React, { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Clock, Footprints, TrainFront, Car, Navigation, MapPin, Plus, AlertCircle, ChevronRight } from "lucide-react";
import { useApp } from "./state";
import { Button, Empty, ErrorBox, PageHead } from "./ui";
import { canEdit, dateText, isActive, timeText, uid, zoneText, type Event, type Trip } from "./domain";
import { TEXT_LIMITS, textError } from "./limits";
import { ARRIVAL_BUFFER, MODE_LABELS, TRAVEL_MODES, clockTime, dayProgress, departureAdvice, eventLocation, itineraryInstant, minutesOfDay, navigationUrl, type RouteLocation, type TravelMode } from "./today-guide";
import { useTravelRoutes } from "./use-travel-routes";
import "./today-guide.css";

export function TodayGuide() {
  const { trip, s, go, open } = useApp();
  if (!trip) return null;
  if (!isActive(trip, s.date)) return <Empty
    title={s.date > trip.end ? "This trip has wrapped up." : "This trip’s moment is still to come."}
    body={`Your travel-day guide opens during ${dateText(trip.start, true)}–${dateText(trip.end, true)}.`}
    action={<><Button onClick={() => go(8)}>See the itinerary</Button>{trip.persistence !== "account" && <Button variant="text" onClick={() => open("demo", { section: "time" })}>Change demo date</Button>}</>}
  />;
  return <ActiveDay key={`${trip.id}:${s.date}`} trip={trip} />;
}

function ActiveDay({ trip: t }: { trip: Trip }) {
  const { s, go, updateTrip } = useApp();
  const [todoError, setTodoError] = useState("");
  const [todo, setTodo] = useState("");
  const remindersPanel = useRef<HTMLDivElement>(null);
  const { today, ongoing, next, previous, overlaps } = dayProgress(t.events, s.date, s.time);
  const remaining = today.filter(event => event.end > s.time);
  const target = next ?? ongoing[0];
  const reminders = t.todos.filter(item => item.date === s.date);
  const count = reminders.filter(item => !item.done).length;
  const reminderJump = reminders.length > 0 && <Button variant="text" onClick={() => {
    remindersPanel.current?.scrollIntoView({ block: "start" });
    remindersPanel.current?.focus({ preventScroll: true });
  }}>{count ? `${count} reminder${count === 1 ? "" : "s"} left` : "Reminders complete"}</Button>;
  return <div className="today-guide">
    <PageHead title="Today" eyebrow={`${dateText(s.date)} · ${timeText(s.time)} · ${t.persistence === "account" ? zoneText(t.zone) : "DEMO TIME"}`}
      description={t.title} action={<Button variant="outline" onClick={() => go(11, { date: s.date })}>Open itinerary <ArrowUpRight size={16} /></Button>} />
    {ongoing.length > 0 && next && <section className="today-happening" aria-label="Happening now">
      <span className="eyebrow">HAPPENING NOW</span>
      {ongoing.map(event => <button type="button" className="text-link" key={event.id} onClick={() => go(11, { date: event.date, event: event.id })}>{event.name} · until {timeText(event.end)} <ChevronRight size={16} /></button>)}
    </section>}
    {target ? <NextStop key={JSON.stringify([t.id, s.date, target, previous])} trip={t} event={target} previous={next ? previous : undefined} ongoing={!next} reminderJump={reminderJump} />
      : <section className="card today-finished"><span className="eyebrow">{today.length ? "THE DAY IS YOURS" : "A LITTLE OPEN SPACE"}</span>
        <h2>{today.length ? "No more plans today" : "No events today"}</h2><p>{today.length ? "Your scheduled events have finished." : "Keep it open, or add something you’ve been meaning to do."}</p>
        <div className="row">{canEdit(t, s.userId, s.date) && <Button variant="outline" onClick={() => go(7, { date: s.date, return: "10" })}>Add a plan</Button>}{reminderJump}</div>
      </section>}
    {overlaps.length > 0 && <section className="today-attention" aria-label="Schedule conflicts"><h2><AlertCircle size={19} />Needs attention</h2>
      {overlaps.map(([first, second]) => <div key={`${first.id}:${second.id}`}><p><strong>{first.name}</strong> overlaps with <strong>{second.name}</strong> by {Math.min(minutesOfDay(first.end), minutesOfDay(second.end)) - minutesOfDay(second.start)} minutes.</p><Button variant="text" onClick={() => go(11, { date: second.date, event: second.id })}>Review timing <ArrowUpRight size={15} /></Button></div>)}
    </section>}
    <div className="today-support">
        <div className="card todo-card" ref={remindersPanel} tabIndex={-1}>
          <h2>Before you go</h2>
          <p className="reminder-date">Today’s reminders · {dateText(s.date, true)}</p>
          {t.todos
            .filter((x) => x.date === s.date)
            .map((todo) => (
              <div className="todo-item" key={todo.id}>
                <input
                  type="checkbox"
                  id={`reminder-${todo.id}`}
                  checked={todo.done}
                  disabled={!canEdit(t, s.userId, todo.date)}
                  onChange={() =>
                    updateTrip((t) => {
                      t.todos.find((x) => x.id === todo.id)!.done = !todo.done;
                    })
                  }
                />
                {canEdit(t, s.userId, todo.date) && (
                  <button
                    type="button"
                    aria-label={`Delete reminder: ${todo.text}`}
                    onClick={(event) => {
                      event.preventDefault();
                      updateTrip((trip) => {
                        trip.todos = trip.todos.filter(
                          (item) => item.id !== todo.id,
                        );
                      });
                    }}
                  >
                    Remove
                  </button>
                )}
                <label htmlFor={`reminder-${todo.id}`} className={todo.done ? "done" : ""}>{todo.text}</label>
              </div>
            ))}
          {!t.todos.some((x) => x.date === s.date) && (
            <p>No reminders for today.</p>
          )}
          {canEdit(t, s.userId, s.date) && (
            <form
              className="input-action"
              onSubmit={(e) => {
                e.preventDefault();
                const problem = textError(
                  todo,
                  "Reminder",
                  TEXT_LIMITS.todo,
                  true,
                );
                setTodoError(problem);
                if (problem) return;
                if (todo.trim()) {
                  updateTrip((t) =>
                    t.todos.push({
                      id: uid(),
                      text: todo.trim(),
                      date: s.date,
                      done: false,
                    }),
                  );
                  setTodo("");
                }
              }}
            >
              <input
                aria-label="New to-do"
                maxLength={TEXT_LIMITS.todo}
                value={todo}
                onChange={(e) => setTodo(e.target.value)}
                placeholder="Add a reminder"
              />
              <button className="icon-btn" aria-label="Add to-do">
                <Plus size={17} />
              </button>
            </form>
          )}
          <ErrorBox text={todoError} />
          <div className="note">Shared with your group.</div>
        </div>
      <section className="card today-rest">
        <details><summary><span>Rest of today</span><span className="muted">{remaining.length} {remaining.length === 1 ? "plan" : "plans"} remaining</span></summary>
          {remaining.length ? <ol>{remaining.map(event => <li key={event.id}><span>{timeText(event.start)}</span><button type="button" onClick={() => go(11, { date: event.date, event: event.id })}><strong>{event.name}</strong><small>{event.place || "Location not set"}</small><ChevronRight size={16} /></button></li>)}</ol> : <p>No scheduled plans left today.</p>}
        </details>
        <Button variant="text" onClick={() => go(11, { date: s.date })}>View the full day <ArrowUpRight size={15} /></Button>
      </section>
    </div>
  </div>;
}

function NextStop({ trip, event, previous, ongoing, reminderJump }: { trip: Trip; event: Event; previous?: Event; ongoing: boolean; reminderJump: React.ReactNode }) {
  const { s, go } = useApp();
  const destination = eventLocation(event);
  const plannedOrigin = previous && eventLocation(previous);
  const [origin, setOrigin] = useState<RouteLocation | undefined>(plannedOrigin);
  const [originKind, setOriginKind] = useState<"planned" | "custom" | "location">("planned");
  const [editingOrigin, setEditingOrigin] = useState(!plannedOrigin);
  const [address, setAddress] = useState("");
  const [originError, setOriginError] = useState("");
  const [locating, setLocating] = useState(false);
  const locationRequest = useRef(0);
  useEffect(() => () => { locationRequest.current++; }, []);
  const [mode, setMode] = useState<TravelMode>("WALK");
  const [requestedAt, setRequestedAt] = useState(() => new Date());
  const plannedDeparture = originKind === "planned" && previous && trip.persistence === "account" ? itineraryInstant(s.date, previous.end, trip.zone) : requestedAt;
  const departure = new Date(Math.max(requestedAt.getTime(), plannedDeparture.getTime())).toISOString();
  const routes = useTravelRoutes(origin, destination, departure);
  const estimate = routes.results[mode]?.estimate;
  const availableAt = originKind === "planned" && previous ? previous.end : s.time;
  const advice = estimate && !ongoing ? departureAdvice(event.start, s.time, estimate.minutes, availableAt) : undefined;
  const preferredWalk = trip.prefs[s.userId || ""]?.walk;
  const walking = routes.results.WALK?.estimate;
  const fastest = TRAVEL_MODES.map(value => routes.results[value]?.estimate).filter(value => value != null).sort((a, b) => a.minutes - b.minutes)[0];
  const suggestWalking = walking && fastest && typeof preferredWalk === "number" && walking.meters <= preferredWalk && walking.minutes <= 20 && walking.minutes - fastest.minutes <= 10 && !trip.prefs[s.userId || ""]?.access.length;
  const useLocation = () => {
    const request = ++locationRequest.current;
    setOriginError("");
    if (!navigator.geolocation) { setOriginError("Location isn't available here. Enter your starting point instead."); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(position => {
      if (request !== locationRequest.current) return;
      setLocating(false); setOriginKind("location"); setEditingOrigin(false); setRequestedAt(new Date());
      setOrigin({ label: "Your location when requested", point: { lat: position.coords.latitude, lng: position.coords.longitude } });
    }, () => {
      if (request !== locationRequest.current) return;
      setLocating(false); setOriginError("Couldn't get your location. Allow location access or enter a starting point.");
    }, { timeout: 8000, maximumAge: 60000 });
  };
  const icons = { WALK: Footprints, TRANSIT: TrainFront, DRIVE: Car };
  return <section className="card today-next-guide" aria-label={ongoing ? "Current stop" : "Next stop"}>
    <div className="today-stop-heading"><div><span className="eyebrow">{ongoing ? "HAPPENING NOW" : "UP NEXT"} · {timeText(event.start)}</span><h2>{event.name}</h2><p className="today-destination"><MapPin size={17} />{event.place || "Location not set"}</p></div><div className="today-stop-actions"><Button variant="text" onClick={() => go(11, { date: event.date, event: event.id })}>Open event <ArrowUpRight size={16} /></Button>{reminderJump}</div></div>
    {destination ? <div className="today-transport">
      <div className="today-origin"><div><span className="eyebrow">STARTING POINT</span><p>{origin?.label || "Where are you leaving from?"}</p>{originKind === "planned" && origin && <small>Previous itinerary stop · planned departure after {timeText(previous!.end)}</small>}</div>{origin && <Button variant="text" onClick={() => { locationRequest.current++; setLocating(false); setEditingOrigin(value => !value); }}>{editingOrigin ? "Close" : "Change"}</Button>}</div>
      {editingOrigin && <form className="today-origin-form" onSubmit={e => {
        e.preventDefault();
        if (!address.trim()) { setOriginError("Enter a starting point or use your location."); return; }
        locationRequest.current++; setLocating(false); setOriginKind("custom"); setOrigin({ label: address.trim(), place: address.trim() }); setEditingOrigin(false); setOriginError(""); setRequestedAt(new Date());
      }}><label htmlFor="today-start">Starting address or place</label><div className="input-action"><input id="today-start" value={address} maxLength={2048} placeholder="Hotel name and city, or address" onChange={e => setAddress(e.target.value)} /><Button type="submit" variant="outline">Use start</Button></div><Button variant="text" disabled={locating} onClick={useLocation}><Navigation size={15} />{locating ? "Finding location…" : "Use my location"}</Button><ErrorBox text={originError} /></form>}
      <div className="today-modes" role="group" aria-label="Transportation">
        {TRAVEL_MODES.map(value => { const Icon = icons[value]; const result = routes.results[value]; return <button type="button" key={value} aria-pressed={mode === value} onClick={() => setMode(value)}><span><Icon size={19} />{MODE_LABELS[value]}</span><strong>{!origin ? "Choose start" : routes.loading ? "Checking…" : result?.estimate ? `${result.estimate.minutes} min` : "Unavailable"}</strong></button>; })}
      </div>
      <div aria-live="polite" className="today-route-status">
        {advice && <div className={`today-departure ${advice.lateBy ? "needs-attention" : ""}`}><Clock size={23} /><div><strong>{advice.lateBy ? `Arrival about ${advice.lateBy} min late` : advice.bufferShortBy ? "Leave now · arrival buffer is tight" : `Leave by ${timeText(clockTime(advice.leave))}${advice.leave < 0 ? " the previous day" : ""}`}</strong><p>{estimate!.minutes} min {mode === "WALK" ? "walking" : mode === "DRIVE" ? "driving" : "by transit"} · {ARRIVAL_BUFFER} min arrival buffer{originKind === "planned" && previous ? ` · from ${previous.name}` : ""}</p></div></div>}
        {origin && !routes.loading && !estimate && <p className="today-route-error">{routes.results[mode]?.error || "No route estimate is available."}</p>}
        {estimate && <p className="today-route-detail">{estimate.meters < 1000 ? `${Math.round(estimate.meters)} m` : `${(estimate.meters / 1000).toFixed(1)} km`}{mode === "DRIVE" ? " · Traffic and parking time not included." : mode === "TRANSIT" ? " · May include walking; recheck departures in Maps." : " · Check sidewalks, crossings, and access in Maps."}</p>}
        {walking && typeof preferredWalk === "number" && <p className="today-route-detail">{walking.meters <= preferredWalk ? "Walking fits" : "Walking exceeds"} your saved {preferredWalk.toLocaleString()} m walking comfort.</p>}
        {suggestWalking ? <p className="today-route-detail"><strong>Consider walking.</strong> It’s a short route within your distance preference, without finding parking.</p> : fastest && <p className="today-route-detail">{MODE_LABELS[fastest.mode]} has the shortest available travel estimate{fastest.mode === "DRIVE" ? ", before parking" : ""}.</p>}
        {estimate?.warnings.map(warning => <p className="today-route-detail" key={warning}>{warning}</p>)}
      </div>
      <div className="today-navigation"><a className="btn" data-ui="button" href={navigationUrl(destination, mode, origin)} target="_blank" rel="noreferrer"><Navigation size={17} />{origin ? `Open ${MODE_LABELS[mode].toLowerCase()} directions` : "Navigate in Google Maps"}<ArrowUpRight size={15} /></a>{origin && <Button variant="text" disabled={routes.loading} onClick={() => { setRequestedAt(new Date()); routes.retry(); }}>Refresh estimates</Button>}</div>
      {origin && !routes.loading && <p className="today-attribution"><span translate="no">Google Maps</span>{routes.checkedAt && <> · Checked {timeText(new Intl.DateTimeFormat("en-GB", { timeZone: trip.zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(routes.checkedAt))}</>}{trip.persistence !== "account" && " · Current routes for a sample schedule"}</p>}
      {advice && (advice.lateBy > 0 || advice.bufferShortBy > 0) && <Button variant="text" onClick={() => go(11, { date: event.date, event: event.id })}>Review timing <ArrowUpRight size={15} /></Button>}
    </div> : <p className="today-missing-location">Add a location in the event to get directions and travel estimates.</p>}
    {event.notes && <details className="today-event-notes"><summary>Before you arrive</summary><p>{event.notes}</p></details>}
    {ongoing && <p className="today-route-detail">No more scheduled plans after this stop.</p>}
  </section>;
}
