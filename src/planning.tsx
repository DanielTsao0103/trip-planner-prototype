import React, { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  ImagePlus,
  MapPin,
  Plus,
  Sparkles,
  Users,
  Wallet,
  Upload,
  Route,
  CheckCircle2,
} from "lucide-react";
import { useApp } from "./state";
import {
  Avatar,
  Badge,
  Button,
  Empty,
  ErrorBox,
  EventCard,
  Field,
  PageHead,
  Photo,
  ReadOnly,
} from "./ui";
import { IMAGES } from "./data";
import {
  days,
  dateText,
  timeText,
  canEdit,
  eventError,
  member,
  isOwner,
  isActive,
  money,
  orderedEvents,
  spent,
  uid,
  type Event,
} from "./domain";
import { TravelMap } from "./travelmap";
export function Itinerary() {
  const { trip: t, s, go, open } = useApp();
  if (!t) return null;
  const role = member(t, s.userId)!.role;
  const allDays = days(t.start, t.end);
  return (
    <>
      <div className="trip-hero">
        <Photo src={t.image} alt={t.destinations.join(" and ")} />
        <div className="trip-hero-shade" />
        <div className="trip-hero-content">
          <div className="row">
            <Badge tone="white">
              {t.sample ? "THE SAMPLE GETAWAY" : "YOUR NEXT ADVENTURE"}
            </Badge>
            {isOwner(t, s.userId) && (
              <button
                className="hero-edit"
                onClick={() => go(6, { edit: "true" })}
              >
                Edit trip <ArrowUpRight size={14} />
              </button>
            )}
          </div>
          <h1>{t.title}</h1>
          <p>
            <MapPin size={16} />
            {t.destinations.join(" & ")}
          </p>
        </div>
      </div>
      <div className="trip-summary">
        <span>
          <CalendarDays size={18} />
          {dateText(t.start, true)} – {dateText(t.end, true)},{" "}
          {t.start.slice(0, 4)}
        </span>
        <span>
          <Users size={18} />
          {t.members.filter((m) => m.status === "accepted").length} travelers
        </span>
        <span>
          <Route size={18} />
          {allDays.length} days, {t.events.length} plans
        </span>
        <button onClick={() => go(13)}>
          Meet your group <ArrowRight size={15} />
        </button>
      </div>
      <div className="section-title itinerary-heading">
        <div>
          <span className="eyebrow">ONE DAY AT A TIME</span>
          <h2>Your days, taking shape.</h2>
        </div>
        <Button
          disabled={role === "Viewer"}
          onClick={() =>
            go(7, {
              date:
                role === "Day Editor"
                  ? member(t, s.userId)!.days[0] || t.start
                  : t.start,
            })
          }
        >
          <Plus size={17} />
          Add event
        </Button>
      </div>
      {role === "Viewer" && <ReadOnly />}
      {role === "Day Editor" && <ReadOnly day />}
      <div className="itinerary-layout">
        <div>
          <div className="day-chips">
            {allDays.map((date, i) => (
              <a
                href={`#day-${date}`}
                key={date}
                onClick={(e) => {
                  e.preventDefault();
                  document
                    .getElementById(`day-${date}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                Day {i + 1}
                <span>{dateText(date, true)}</span>
              </a>
            ))}
          </div>
          {allDays.map((date, i) => (
            <section className="day-section" id={`day-${date}`} key={date}>
              <div className="day-title">
                <span className="day-number">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3>
                    Day {i + 1} <span>— {date.slice(5).replace("-", "/")}</span>
                  </h3>
                  <p>
                    {new Date(date + "T12:00:00").toLocaleDateString("en-US", {
                      weekday: "long",
                    })}{" "}
                    · {orderedEvents(t, date).length} plans
                  </p>
                </div>
                <button
                  className="text-link push"
                  onClick={() => go(11, { date })}
                >
                  View day <ArrowUpRight size={15} />
                </button>
              </div>
              {orderedEvents(t, date).length ? (
                <div className="events-list">
                  {orderedEvents(t, date).map((e) => (
                    <EventCard key={e.id} event={e} />
                  ))}
                </div>
              ) : (
                <div className="empty-day">
                  <span>A little room to wander.</span>
                  <p>Nothing planned yet. Sometimes that’s a good thing.</p>
                  {canEdit(t, s.userId, date) && (
                    <button
                      className="text-link"
                      onClick={() => go(7, { date })}
                    >
                      <Plus size={15} />
                      Add something to this day
                    </button>
                  )}
                </div>
              )}
            </section>
          ))}
        </div>
        <aside className="itinerary-aside">
          <div className="card inspiration-card">
            <span className="little-icon">
              <Sparkles size={22} />
            </span>
            <span className="eyebrow">A LITTLE LOCAL KNOW-HOW</span>
            <h3>
              Good things <br />
              around the corner.
            </h3>
            <p>
              Ideas that fit your plans, your people, and the time in between.
            </p>
            <Button variant="outline full" onClick={() => go(9)}>
              Find some inspiration <ArrowRight size={16} />
            </Button>
          </div>
          <div className="card budget-peek">
            <span className="eyebrow">THE BIG PICTURE</span>
            <div className="row">
              <h3>Trip budget</h3>
              <Wallet size={18} />
            </div>
            <strong>
              {t.budget !== null ? money(t.budget - spent(t)) : "Not set yet"}
            </strong>
            <p>
              {t.budget !== null
                ? "left for making memories"
                : "Set a budget when you’re ready."}
            </p>
            {t.budget !== null && (
              <div className="progress">
                <i
                  style={{
                    width: `${Math.min(100, (spent(t) / Math.max(t.budget, 1)) * 100)}%`,
                  }}
                />
              </div>
            )}
            <button className="text-link" onClick={() => go(12)}>
              See the details <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="card group-peek">
            <div className="avatar-stack">
              {t.members
                .filter((m) => m.status === "accepted")
                .map((m, i) => (
                  <Avatar key={m.id} name={m.name} index={i} />
                ))}
            </div>
            <h3>Everyone gets a say.</h3>
            <p>Add your preferences so the plan feels good for everyone.</p>
            <button className="text-link" onClick={() => go(15)}>
              Your travel preferences <ArrowRight size={15} />
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}
export function EventForm() {
  const { trip: t, s, route, go, updateTrip, toast } = useApp();
  if (!t) return null;
  const original = t.events.find((e) => e.id === route.params.get("event"));
  const dateParam = route.params.get("date") || t.start;
  const suggested = route.params.get("suggestion");
  const [mode, setMode] = useState("manual"),
    [name, setName] = useState(original?.name || suggested || ""),
    [place, setPlace] = useState(
      original?.place || route.params.get("place") || "",
    ),
    [date, setDate] = useState(original?.date || dateParam),
    [start, setStart] = useState(
      original?.start || route.params.get("start") || "15:00",
    ),
    [end, setEnd] = useState(
      original?.end || route.params.get("end") || "16:00",
    ),
    [cost, setCost] = useState(
      original ? String(original.cost / 100) : route.params.get("cost") || "0",
    ),
    [attendees, setAttendees] = useState(
      original?.attendees ||
        t.members.filter((m) => m.status === "accepted").map((m) => m.id),
    ),
    [notes, setNotes] = useState(original?.notes || ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [scan, setScan] = useState(""),
    [preview, setPreview] = useState("");
  const extract = (fail = false) => {
    setScan("loading");
    setTimeout(() => {
      if (fail) {
        setScan("failed");
        return;
      }
      setName("An afternoon at the gallery");
      setPlace(
        t.sample
          ? "Cedar Gallery · downtown"
          : `Sample gallery · ${t.destinations[0]}`,
      );
      setStart("15:00");
      setEnd("16:00");
      setCost("40");
      setScan("review");
      setMode("manual");
    }, 700);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const event: Event = {
      id: original?.id || uid(),
      name: name.trim(),
      place: place.trim(),
      date,
      start,
      end,
      cost: Math.round(Number(cost) * 100),
      attendees,
      image: original?.image || IMAGES.museum,
      notes,
    };
    const err = eventError(t, s.userId, event, original);
    if (err) {
      setError(err);
      return;
    }
    setBusy(true);
    setTimeout(() => {
      updateTrip((v) => {
        const index = v.events.findIndex((e) => e.id === event.id);
        if (index >= 0) v.events[index] = event;
        else v.events.push(event);
      });
      toast(
        original
          ? "Event updated everywhere in your trip."
          : "A new plan, added to your day.",
      );
      go(original && route.params.get("return") === "11" ? 11 : 8, { date });
    }, 350);
  };
  const role = member(t, s.userId)?.role;
  return (
    <>
      <PageHead
        eyebrow={t.title}
        title={original ? "A little change of plans." : "Make a little plan."}
        description="Something to see, somewhere to be, someone to share it with."
      />
      <div className="form-layout">
        <form className="card form-card" onSubmit={submit}>
          {role === "Viewer" && <ReadOnly />}
          {role === "Day Editor" && <ReadOnly day />}
          <div className="tabs">
            <button
              type="button"
              className={mode === "manual" ? "active" : ""}
              onClick={() => setMode("manual")}
            >
              Enter details
            </button>
            <button
              type="button"
              className={mode === "upload" ? "active" : ""}
              onClick={() => setMode("upload")}
            >
              <ImagePlus size={16} />
              Use a confirmation
            </button>
          </div>
          {mode === "upload" && (
            <div className="upload-panel">
              <Upload size={33} />
              <h3>A screenshot is a good start.</h3>
              <p>
                Choose a confirmation image, then review the details.
                <br />
                Extraction is simulated with sample fields.
              </p>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                aria-label="Upload confirmation image"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (
                    !["image/png", "image/jpeg", "image/webp"].includes(
                      f.type,
                    ) ||
                    f.size > 10 * 1024 * 1024
                  ) {
                    setError("Choose a PNG, JPEG, or WebP under 10 MB.");
                    return;
                  }
                  setPreview(URL.createObjectURL(f));
                  extract();
                }}
              />
              {preview && (
                <img
                  className="upload-preview"
                  src={preview}
                  alt="Your locally selected confirmation"
                />
              )}
              <Button
                variant="outline"
                disabled={scan === "loading"}
                onClick={() => extract()}
              >
                {scan === "loading"
                  ? "Reading sample details…"
                  : "Try a sample confirmation"}
              </Button>
              <button
                type="button"
                className="text-link"
                onClick={() => extract(true)}
              >
                Try extraction failure
              </button>
              {scan === "failed" && (
                <ErrorBox text="We couldn’t read this confirmation. Try again or enter the details manually." />
              )}
            </div>
          )}
          {mode === "manual" && (
            <>
              {scan === "review" && (
                <div className="info-banner">
                  <CheckCircle2 size={20} />
                  <span>
                    Sample details filled in. Review every field and fill any
                    gaps. This is simulated extraction.
                  </span>
                </div>
              )}
              <Field label="Event name">
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="A morning at the museum"
                />
              </Field>
              <Field label="Where">
                <input
                  required
                  value={place}
                  onChange={(e) => setPlace(e.target.value)}
                  placeholder="Location or meeting point"
                />
              </Field>
              <Field label="Day">
                <select value={date} onChange={(e) => setDate(e.target.value)}>
                  {days(t.start, t.end).map((d, i) => (
                    <option key={d} value={d}>
                      Day {i + 1} — {dateText(d, true)}
                      {!canEdit(t, s.userId, d) ? " (view only)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="form-columns">
                <Field label="Start time">
                  <input
                    required
                    type="time"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </Field>
                <Field label="End time">
                  <input
                    required
                    type="time"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </Field>
              </div>
              <p className="fine-print">
                Times in {t.zone}. For overnight activities, add one event per
                day.
              </p>
              {place && (
                <div className="crowd-card">
                  <div>
                    <strong>
                      Usually{" "}
                      {Number(start.slice(0, 2)) >= 12 &&
                      Number(start.slice(0, 2)) <= 14
                        ? "a little busy"
                        : "pretty relaxed"}
                    </strong>
                    <p>Illustrative crowd estimate · not live data</p>
                  </div>
                  <div className="crowd-bars">
                    {[24, 42, 65, 85, 56, 35, 20].map((h, i) => (
                      <i
                        key={i}
                        style={{ height: h + "%", opacity: i === 3 ? 1 : 0.25 }}
                      />
                    ))}
                  </div>
                </div>
              )}
              <Field
                label="Estimated cost (USD)"
                hint="Planning estimate only. Log actual payments in Budget."
              >
                <input
                  required
                  min="0"
                  step="0.01"
                  type="number"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                />
              </Field>
              <fieldset>
                <legend>Who’s coming?</legend>
                <div className="attendee-list">
                  {t.members
                    .filter((m) => m.status === "accepted")
                    .map((m) => (
                      <label className="attendee" key={m.id}>
                        <input
                          type="checkbox"
                          checked={attendees.includes(m.id)}
                          onChange={(e) =>
                            setAttendees(
                              e.target.checked
                                ? [...attendees, m.id]
                                : attendees.filter((id) => id !== m.id),
                            )
                          }
                        />
                        <Avatar name={m.name} />
                        {m.name}
                      </label>
                    ))}
                </div>
              </fieldset>
              <Field label="Notes (optional)">
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="A meeting point, ticket details, or a little reminder…"
                />
              </Field>
            </>
          )}
          <ErrorBox text={error} />
          <div className="form-actions">
            <Button
              variant="text"
              onClick={() => {
                if (
                  (name || place) &&
                  !window.confirm("Leave without saving this event?")
                )
                  return;
                go(original ? 11 : 8, { date });
              }}
            >
              Cancel
            </Button>
            {mode === "manual" && (
              <Button
                type="submit"
                disabled={busy || !canEdit(t, s.userId, date)}
              >
                {busy
                  ? "Saving…"
                  : original
                    ? "Save changes"
                    : "Add to itinerary"}
                <Plus size={16} />
              </Button>
            )}
          </div>
        </form>
        <aside className="form-aside">
          <div className="card">
            <span className="eyebrow">ALREADY ON THIS DAY</span>
            <h2>{dateText(date, true)}</h2>
            {orderedEvents(t, date).length ? (
              orderedEvents(t, date).map((e) => (
                <div className="mini-event" key={e.id}>
                  <span>{timeText(e.start)}</span>
                  <strong>{e.name}</strong>
                  <small>Until {timeText(e.end)}</small>
                </div>
              ))
            ) : (
              <p>An open day. Make it your own.</p>
            )}
          </div>
          <div className="note">
            <Clock size={17} />
            We’ll point out overlapping plans before you save.
          </div>
        </aside>
      </div>
    </>
  );
}
export function Suggestions() {
  const { trip: t, s, go, updateTrip, toast } = useApp();
  if (!t) return null;
  const [loading, setLoading] = useState(false);
  const prefs = t.prefs[s.userId || ""];
  const items = [
    {
      id: "gallery",
      title: "An afternoon with local art",
      place: t.sample
        ? "Cedar Gallery · downtown"
        : `Gallery near ${t.destinations[0]}`,
      image: IMAGES.museum,
      cost: 40,
      tag: "ART & CULTURE",
      reason: t.events.some((e) => e.id === "museum")
        ? "Since you planned Seattle Art Museum, you might enjoy a smaller local gallery."
        : `A cultural stop near ${t.destinations[0]} that fits an open afternoon.`,
    },
    {
      id: "garden",
      title: "Take the scenic pause",
      place: t.sample
        ? "Harbor garden · waterfront"
        : `Garden near ${t.destinations[0]}`,
      image: IMAGES.coast,
      cost: 0,
      tag: "A LITTLE BREATHING ROOM",
      reason:
        "A short, easy stop between plans. The sample route has places to rest.",
    },
    {
      id: "local",
      title: "A taste of the neighborhood",
      place: t.sample
        ? "Juniper Table · downtown"
        : `Sample local restaurant · ${t.destinations[0]}`,
      image: IMAGES.food,
      cost: 30,
      tag: "SOMETHING LOCAL",
      reason:
        prefs?.food === "Familiar favorites"
          ? "Familiar flavors with a local twist, based on your food preferences."
          : "Local flavors, with fictional menu options for the group’s saved preferences.",
    },
  ];
  const dates = days(t.start, t.end).filter((d) => canEdit(t, s.userId, d));
  const preferred = isActive(t, s.date)
    ? [s.date, ...dates.filter((d) => d !== s.date)]
    : dates;
  let slot: { date: string; start: string; end: string } | undefined;
  for (const d of preferred) {
    if (!canEdit(t, s.userId, d)) continue;
    for (let hour = 9; hour < 18; hour++) {
      const start = String(hour).padStart(2, "0") + ":00",
        end = String(hour + 1).padStart(2, "0") + ":00";
      if (
        !t.events.some((e) => e.date === d && start < e.end && end > e.start)
      ) {
        slot = { date: d, start, end };
        break;
      }
    }
    if (slot) break;
  }
  const walkLimit = Math.min(
    100000,
    ...Object.values(t.prefs).map((p) => p.walk),
  );
  const eligibleItems = items.filter(
    (i) =>
      walkLimit >= (i.id === "gallery" ? 180 : i.id === "garden" ? 300 : 80),
  );
  return (
    <>
      <PageHead
        eyebrow="LEAVE ROOM FOR SOMETHING GOOD"
        title="A little inspiration."
        description={`${isActive(t, s.date) && s.location ? "Near your simulated location" : "Around your planned stops"}, with your people in mind.`}
        action={
          <Button
            variant="outline"
            onClick={() => {
              setLoading(true);
              setTimeout(() => setLoading(false), 600);
            }}
          >
            <Sparkles size={16} />
            Refresh ideas
          </Button>
        }
      />
      <div className="suggestion-context">
        <Badge tone="green">
          <MapPin size={13} />
          {t.destinations[0]}
        </Badge>
        <Badge>Based on your itinerary</Badge>
        <Badge>{Object.keys(t.prefs).length} preference surveys</Badge>
        <button className="text-link" onClick={() => go(15)}>
          Update your preferences <ArrowRight size={14} />
        </button>
      </div>
      {!prefs && (
        <div className="info-banner">
          Tell us what you enjoy in My preferences to make these ideas more
          personal.
        </div>
      )}
      {loading ? (
        <div className="skeleton-grid" aria-live="polite">
          Finding sample ideas…
          <div />
          <div />
          <div />
        </div>
      ) : (
        <div className="suggestions-grid">
          {eligibleItems
            .filter((i) => !t.dismissed.includes(i.id))
            .map((i) => (
              <article className="suggestion-card" key={i.id}>
                <Photo src={i.image} alt={i.title} />
                <div className="suggestion-body">
                  <div className="eyebrow">{i.tag}</div>
                  <h2>{i.title}</h2>
                  <p>{i.reason}</p>
                  <div className="suggestion-meta">
                    <span>
                      <Clock size={14} />
                      About 1 hour
                    </span>
                    <span>{i.cost ? `Est. $${i.cost}` : "Free"}</span>
                  </div>
                  <div className="compatibility">
                    <Check size={14} />
                    Sample match · details need checking
                  </div>
                  <p className="available-slot">
                    {slot
                      ? `Open: ${dateText(slot.date, true)} at ${timeText(slot.start)}`
                      : "No editable one-hour slot available"}
                  </p>
                  <div className="card-actions">
                    <Button
                      variant="text"
                      onClick={() => {
                        updateTrip((t) => t.dismissed.push(i.id));
                        toast("Suggestion dismissed.");
                      }}
                    >
                      Not this time
                    </Button>
                    <Button
                      disabled={!slot}
                      onClick={() =>
                        slot &&
                        go(7, {
                          suggestion: i.title,
                          place: i.place,
                          date: slot.date,
                          start: slot.start,
                          end: slot.end,
                          cost: String(i.cost),
                        })
                      }
                    >
                      Choose a time <Plus size={15} />
                    </Button>
                  </div>
                </div>
              </article>
            ))}
        </div>
      )}
      {eligibleItems.length === 0 && (
        <Empty
          title="No sample matches fit the group right now."
          body="The sample activities exceed a saved walking limit. Review preferences or plan an activity manually."
        />
      )}
      {eligibleItems.length > 0 &&
        eligibleItems.every((i) => t.dismissed.includes(i.id)) && (
          <Empty
            title="A little space for your own ideas."
            body="You’ve reviewed all the sample suggestions."
            action={
              <Button onClick={() => updateTrip((t) => (t.dismissed = []))}>
                Show suggestions again
              </Button>
            }
          />
        )}
      <p className="fine-print">
        These recommendations, costs, crowd levels, and suitability details are
        illustrative. No live location or social account is accessed.
      </p>
    </>
  );
}
export function Dashboard() {
  const { trip: t, s, go, open, updateTrip } = useApp();
  const [todo, setTodo] = useState(""),
    [weekOffset, setWeekOffset] = useState(0);
  if (!t) return null;
  if (!isActive(t, s.date))
    return (
      <Empty
        title="This trip’s moment is still to come."
        body={`Today opens during ${dateText(t.start, true)}–${dateText(t.end, true)}. Change the demo date to preview it.`}
        action={
          <>
            <Button onClick={() => open("demo")}>Change demo date</Button>
            <Button variant="outline" onClick={() => go(8)}>
              See the itinerary
            </Button>
          </>
        }
      />
    );
  const todays = orderedEvents(t, s.date),
    next = todays.find((e) => e.end > s.time);
  const start = new Date(s.date + "T12:00:00Z");
  start.setUTCDate(start.getUTCDate() - start.getUTCDay() + weekOffset * 7);
  const last = new Date(start);
  last.setUTCDate(last.getUTCDate() + 6);
  const week = days(
    start.toISOString().slice(0, 10),
    last.toISOString().slice(0, 10),
  );
  return (
    <>
      <PageHead
        eyebrow={`${dateText(s.date)} · ${s.time} · DEMO TIME`}
        title="A good day to be here."
        description={t.title}
        action={
          <Button variant="outline" onClick={() => open("nearby")}>
            <Sparkles size={16} />
            Discover nearby
          </Button>
        }
      />
      <div className="dashboard-grid">
        <div className="card week-card">
          <div className="section-title">
            <h2>This week, together.</h2>
            <div className="week-arrows">
              <button
                className="icon-btn"
                aria-label="Previous week"
                disabled={week[0] <= t.start}
                onClick={() => setWeekOffset(weekOffset - 1)}
              >
                <ChevronLeft size={15} />
              </button>
              <button
                className="icon-btn"
                aria-label="Next week"
                disabled={week[6] >= t.end}
                onClick={() => setWeekOffset(weekOffset + 1)}
              >
                <ChevronRight size={15} />
              </button>
            </div>
            <button
              className="text-link"
              onClick={() => go(11, { date: s.date })}
            >
              Calendar <ArrowUpRight size={16} />
            </button>
          </div>
          <div className="week-grid">
            {week.map((d) => (
              <button
                className={`week-day ${d === s.date ? "selected" : ""}`}
                key={d}
                disabled={d < t.start || d > t.end}
                onClick={() => go(11, { date: d })}
              >
                <span>
                  {new Date(d + "T12:00:00").toLocaleDateString("en-US", {
                    weekday: "short",
                  })}
                </span>
                <strong>{Number(d.slice(8))}</strong>
                <div>
                  {orderedEvents(t, d).map((e) => (
                    <span className="week-event" key={e.id}>
                      {e.start}
                      <b>{e.name}</b>
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>
          <div className="mobile-agenda">
            {todays.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </div>
        </div>
        <div className="card todo-card">
          <span className="eyebrow">THE LITTLE THINGS</span>
          <h2>Before you go.</h2>
          {t.todos
            .filter((x) => x.date === s.date)
            .map((todo) => (
              <label className="todo-item" key={todo.id}>
                <input
                  type="checkbox"
                  checked={todo.done}
                  disabled={!canEdit(t, s.userId, todo.date)}
                  onChange={() =>
                    updateTrip((t) => {
                      t.todos.find((x) => x.id === todo.id)!.done = !todo.done;
                    })
                  }
                />
                <span className={todo.done ? "done" : ""}>{todo.text}</span>
              </label>
            ))}
          {!t.todos.some((x) => x.date === s.date) && (
            <p>No little reminders for today.</p>
          )}
          {canEdit(t, s.userId, s.date) && (
            <form
              className="input-action"
              onSubmit={(e) => {
                e.preventDefault();
                if (todo.trim()) {
                  updateTrip((t) =>
                    t.todos.push({
                      id: uid(),
                      text: todo,
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
                value={todo}
                onChange={(e) => setTodo(e.target.value)}
                placeholder="Add a little reminder"
              />
              <button className="icon-btn" aria-label="Add to-do">
                <Plus size={17} />
              </button>
            </form>
          )}
          <div className="note">Shared with your group.</div>
        </div>
      </div>
      <div className="section-title">
        <div>
          <span className="eyebrow">ONE STEP AHEAD</span>
          <h2>
            {next ? "Here’s where you’re headed." : "A little room to wander."}
          </h2>
        </div>
        <Button
          variant="outline"
          onClick={() => go(17, next ? { place: next.place } : {})}
        >
          Open map <ArrowUpRight size={16} />
        </Button>
      </div>
      <TravelMap compact selectedPlace={next?.place} />
      {!todays.length && (
        <Empty
          title="Your day is wide open."
          body="Find an idea or add a plan to the itinerary."
          action={<Button onClick={() => go(9)}>Find inspiration</Button>}
        />
      )}
    </>
  );
}
export function DayDetail() {
  const { trip: t, s, route, go } = useApp();
  if (!t) return null;
  const requested = route.params.get("date");
  const date =
    requested && requested >= t.start && requested <= t.end
      ? requested
      : isActive(t, s.date)
        ? s.date
        : t.start;
  const list = days(t.start, t.end),
    index = list.indexOf(date),
    events = orderedEvents(t, date),
    allowed = canEdit(t, s.userId, date);
  return (
    <>
      <PageHead
        eyebrow={`DAY ${index + 1} · ${t.title}`}
        title={
          new Date(date + "T12:00:00").toLocaleDateString("en-US", {
            weekday: "long",
          }) +
          ", " +
          dateText(date, true)
        }
        description={`A closer look at your day · ${t.zone}`}
        action={
          <Button disabled={!allowed} onClick={() => go(7, { date })}>
            <Plus size={17} />
            Add event
          </Button>
        }
      />
      <div className="day-control">
        <Button
          variant="outline"
          aria-label="Previous day"
          disabled={index === 0}
          onClick={() => go(11, { date: list[index - 1] })}
        >
          <ChevronLeft size={18} />
        </Button>
        <Field label="Choose a day">
          <input
            type="date"
            min={t.start}
            max={t.end}
            value={date}
            onChange={(e) => {
              if (e.target.value >= t.start && e.target.value <= t.end)
                go(11, { date: e.target.value });
            }}
          />
        </Field>
        <Button
          variant="outline"
          aria-label="Next day"
          disabled={index === list.length - 1}
          onClick={() => go(11, { date: list[index + 1] })}
        >
          <ChevronRight size={18} />
        </Button>
      </div>
      {!allowed && (
        <ReadOnly day={member(t, s.userId)?.role === "Day Editor"} />
      )}
      <div className="day-detail-layout">
        <div className="timeline">
          {events.map((e, i) => (
            <div className="timeline-item" key={e.id}>
              <div className="timeline-hour">
                {timeText(e.start)}
                <span>{timeText(e.end)}</span>
              </div>
              <div className="timeline-dot" />
              <article
                className={`card detail-event ${route.params.get("event") === e.id ? "focused" : ""}`}
              >
                <Photo src={e.image} alt={e.place} />
                <div>
                  <span className="eyebrow">
                    {e.end} · {e.attendees.length} TRAVELERS
                  </span>
                  <h2>{e.name}</h2>
                  <button
                    className="text-link"
                    onClick={() => go(17, { place: e.place })}
                  >
                    <MapPin size={14} />
                    {e.place}
                  </button>
                  <p>{e.notes || "A little something to look forward to."}</p>
                  <div className="row">
                    <Badge>
                      {e.cost
                        ? `${money(e.cost)} estimated`
                        : "No cost planned"}
                    </Badge>
                    <Button
                      variant="outline small"
                      disabled={!allowed}
                      onClick={() => go(7, { event: e.id, date, return: "11" })}
                    >
                      Edit event
                    </Button>
                  </div>
                </div>
              </article>
            </div>
          ))}
          {!events.length && (
            <Empty
              title="An open day, all yours."
              body="Add a plan or see what’s nearby."
              action={
                allowed ? (
                  <Button onClick={() => go(7, { date })}>
                    Add the first event
                  </Button>
                ) : undefined
              }
            />
          )}
        </div>
        <aside className="card day-summary">
          <span className="eyebrow">AT A GLANCE</span>
          <h2>{events.length} little plans.</h2>
          <p>
            {events.length
              ? "Leave yourself a little breathing room between stops."
              : "Good things can happen without a full schedule."}
          </p>
          <button className="text-link" onClick={() => go(9)}>
            Find something nearby <ArrowRight size={15} />
          </button>
          <hr />
          <button className="text-link" onClick={() => go(8)}>
            See the whole trip <ArrowUpRight size={15} />
          </button>
        </aside>
      </div>
    </>
  );
}
