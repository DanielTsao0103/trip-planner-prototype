import { readPhotoDataUrl, validatePhoto } from "./image-validation";
import { resolveSavedLocation } from "./google-maps";
import { EventLocationInput } from "./event-location-input";
import { PlacePopularTimes } from "./place-popular-times";
import { WeeklyCalendar } from "./weekly-calendar";
/** Implementation status: Account events, todos, and dismissed choices save through updateTrip to Supabase. Confirmation extraction, crowds, costs, and suggestions remain fixtures; uploaded file previews are temporary. See ../IMPLEMENTATION_STATUS.md. */
import { DatePicker } from "./date-picker";
import { findAvailableHour } from "./planning-slots";
import { TEXT_LIMITS, MONEY_LIMITS, textError, moneyError } from "./limits.ts";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { searchDestinationPhotos, trackUnsplashSelection, uploadTripPhoto, type UnsplashPhoto } from "./trip-photos";
import {
  ArrowRight,
  X,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  ImagePlus,
  MapPin,
  Plus,
  Pencil,
  Sparkles,
  Users,
  Wallet,
  Upload,
  Trash2,
  Route,
  CheckCircle2,
} from "lucide-react";
import { useApp } from "./state";
import { setBookingTrip } from "./bookings";
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  Empty,
  ErrorBox,
  EventCard,
  Field,
  PageHead,
  Photo,
  PhotoCredit,
  ReadOnly,
  revealFocusedFormField,
} from "./ui";
import { IMAGES } from "./data";
import {
  days,
  dateText,
  timeText,
  durationText,
  zoneText,
  canEdit,
  EVENT_PERMISSION_MESSAGE,
  eventError,
  member,
  isOwner,
  isActive,
  money,
  orderedEvents,
  itineraryDay,
  spent,
  uid,
  type Event,
} from "./domain";
import { TravelMap } from "./travelmap";
export function Itinerary() {
  const { trip: t, s, go, open, route } = useApp();
  const view = route.params.get("view") === "list" ? "list" : "calendar";
  const [dayPage, setDayPage] = useState(0);
  const pageSizeAnchor = useRef<{ tripId: string; date: string; origin: Element | null } | null>(null);
  const pendingReveal = useRef<{ date: string; event: string | null; origin: Element | null } | null>(null);
  const [daysPerPage, setDaysPerPage] = useState(() => {
    try {
      const saved = Number(localStorage.getItem("trip-planner-list-days"));
      return [7, 10, 20].includes(saved) ? saved : 7;
    } catch { return 7; }
  });
  const changeDaysPerPage = (value: number) => {
    // Regroup around the current day rather than returning to the trip's beginning.
    const date = requestedDate && visibleDays.includes(requestedDate) ? requestedDate : visibleDays[0];
    pageSizeAnchor.current = t && date ? { tripId: t.id, date, origin: document.activeElement } : null;
    setDaysPerPage(value);
    // This is a device display preference; denied storage must not prevent paging.
    try { localStorage.setItem("trip-planner-list-days", String(value)); } catch { /* Keep the current view usable. */ }
  };
  const [activeDay, setActiveDay] = useState(t?.start || "");
  const requestedDate = route.params.get("date");
  const requestedEvent = route.params.get("event");
  useLayoutEffect(() => {
    const dates = t ? days(t.start, t.end) : [];
    const anchor = pageSizeAnchor.current?.tripId === t?.id ? pageSizeAnchor.current : null;
    pageSizeAnchor.current = null;
    const focusedDate = anchor?.date || requestedDate;
    const index = focusedDate ? dates.indexOf(focusedDate) : -1;
    setDayPage(index < 0 ? 0 : Math.floor(index / daysPerPage));
    setActiveDay(index < 0 ? dates[0] || "" : focusedDate!);
    pendingReveal.current = view === "list" && index >= 0 ? {
      date: focusedDate!, event: focusedDate === requestedDate ? requestedEvent : null,
      origin: anchor ? anchor.origin : document.activeElement,
    } : null;
  }, [t?.id, t?.start, t?.end, requestedDate, requestedEvent, view, daysPerPage]);
  // A frame count cannot prove React committed the regrouped page. Wait until
  // the actual target exists, then let the route's main-focus effect finish.
  useLayoutEffect(() => {
    const pending = pendingReveal.current;
    if (!pending) return;
    const target = (pending.event && document.getElementById(`itinerary-event-${pending.event}`)) || document.getElementById(`day-${pending.date}`);
    if (!target) return;
    const frame = requestAnimationFrame(() => {
      if (pendingReveal.current !== pending || !target.isConnected) return;
      pendingReveal.current = null;
      const active = document.activeElement;
      // Recovery controls and other deliberate keyboard choices take priority.
      if (active !== pending.origin && active !== document.body && active?.id !== "main-content") return;
      target.focus({preventScroll: true});
      target.scrollIntoView({block: "start"});
    });
    return () => cancelAnimationFrame(frame);
  });
  if (!t) return null;
  const traveler = member(t, s.userId)!;
  const role = traveler.role;
  const allDays = days(t.start, t.end);
  const pageCount = Math.ceil(allDays.length / daysPerPage);
  const currentPage = Math.min(dayPage, Math.max(0, pageCount - 1));
  const pageStart = currentPage * daysPerPage;
  const pageEnd = Math.min(pageStart + daysPerPage, allDays.length);
  const visibleDays = allDays.slice(pageStart, pageEnd);
  const dayRange = `Days ${allDays.length ? pageStart + 1 : 0}–${pageEnd} of ${allDays.length}`;
  const pageFromBottom = (nextPage: number) => {
    pendingReveal.current = { date: allDays[nextPage * daysPerPage], event: null, origin: document.activeElement };
    setDayPage(nextPage);
  };
  const renderDayPager = () => (
    <div className="day-page-controls" role="navigation" aria-label="Itinerary day pages">
      <label className="day-page-size">
        Show
        <select aria-label="Days to show" value={daysPerPage} onChange={event => changeDaysPerPage(Number(event.target.value))}>
          <option value={7}>7 days</option>
          <option value={10}>10 days</option>
          <option value={20}>20 days</option>
        </select>
      </label>
      <div className="day-page-navigation">
        {pageCount > 1 && <button type="button" className="day-page-arrow" onClick={() => setDayPage(currentPage - 1)} disabled={currentPage === 0} aria-label="Previous days"><ChevronLeft size={16} /></button>}
        <span aria-live="polite">{dayRange}</span>
        {pageCount > 1 && <button type="button" className="day-page-arrow" onClick={() => setDayPage(currentPage + 1)} disabled={currentPage >= pageCount - 1} aria-label="Next days"><ChevronRight size={16} /></button>}
      </div>
    </div>
  );
  const personalBudget = t.budgetMode === "individual";
  const budget = personalBudget ? (t.individual[traveler.id] ?? null) : t.budget;
  const totalSpent = spent(t, personalBudget ? traveler.id : undefined);
  return (
    <>
      <div className={`trip-hero ${view === "calendar" ? "calendar-trip-hero" : "list-trip-hero"}`}>
        <Photo src={t.image} alt={t.destinations.join(" and ")} />
        <PhotoCredit credit={t.imageCredit} />
        <div className="trip-hero-shade" />
        <div className="trip-hero-content">
          <div className="row">
            {t.sample && <Badge tone="white">Sample trip</Badge>}
            {isOwner(t, s.userId) && (
              <button
                className="hero-edit"
                aria-label="Edit trip"
                onClick={() => go(6, { edit: "true" })}
              >
                <span>Edit trip</span> <Pencil size={14} aria-hidden="true" />
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
          {t.members.filter((m) => m.status === "accepted").length} {t.members.filter((m) => m.status === "accepted").length === 1 ? "traveler" : "travelers"}
        </span>
        <span>
          <Route size={18} />
          {allDays.length} {allDays.length === 1 ? "day" : "days"}, {t.events.length} {t.events.length === 1 ? "plan" : "plans"}
        </span>
        <button onClick={() => go(13)}>
          Meet your group <ArrowRight size={15} />
        </button>
      </div>
      <div className="itinerary-controls">
      <div className="section-title itinerary-heading">
        <div>
          <h2>Your itinerary</h2>
        </div>
        {role !== "Viewer" && <Button
          onClick={() =>
            go(7, {
              view,
              date:
                role === "Day Editor"
                  ? traveler.days[0] || t.start
                  : t.start,
            })
          }
        >
          <Plus size={17} />
          Add event
        </Button>}
      </div>
      <div className="itinerary-view-switch" role="group" aria-label="Itinerary view">
        <button type="button" aria-pressed={view === "calendar"} onClick={() => go(8, { view: "calendar" })}>Calendar</button>
        <button type="button" aria-pressed={view === "list"} onClick={() => go(8, { view: "list" })}>List</button>
      </div>
      </div>
      {role === "Viewer" && <ReadOnly />}
      {role === "Day Editor" && <ReadOnly day />}
      {view === "calendar" ? <WeeklyCalendar key={t.id} /> : <div className="itinerary-layout">
        <div>
          <div className="day-chips" hidden={pageCount > 1}>
            {visibleDays.map((date, pageIndex) => (
              <a
                href={`#day-${date}`}
                aria-current={date === activeDay ? "date" : undefined}
                key={date}
                onClick={(e) => {
                  e.preventDefault();
                  setActiveDay(date);
                  document
                    .getElementById(`day-${date}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                Day {pageStart + pageIndex + 1}
                <span>{dateText(date, true)}</span>
              </a>
            ))}
          </div>
          {allDays.length > 7 && <div className="day-navigation-tools">
          {pageCount > 1 && <div className="day-jump"><label htmlFor="itinerary-day-jump">Jump to day</label><select id="itinerary-day-jump" value="" onChange={event => {
            const date=event.target.value; setDayPage(Math.floor(allDays.indexOf(date) / daysPerPage));
            requestAnimationFrame(() => document.getElementById(`day-${date}`)?.scrollIntoView({block:"start"}));
          }}><option value="" disabled>Choose a date</option>{allDays.map((date,index)=><option key={date} value={date}>Day {index+1} · {dateText(date)}</option>)}</select></div>}
          {renderDayPager()}
          </div>}
      {!t.events.length && role !== "Viewer" && (
        <section
          className="getting-started card"
          aria-label="Plan your first day"
        >
          <h2>No events yet</h2>
          <div className="getting-started-actions">
            <Button
              onClick={() =>
                go(7, {
                  view: "list",
                  date:
                    role === "Day Editor"
                      ? traveler.days[0] || t.start
                      : t.start,
                })
              }
            >
              <Plus size={17} />
              Add your first plan
            </Button>
            <Button variant="outline" onClick={() => go(12)}>
              <Wallet size={17} />
              Plan your budget
            </Button>
            <Button variant="text" onClick={() => go(15)}>
              Share your preferences <ArrowRight size={16} />
            </Button>
          </div>
        </section>
      )}
          {visibleDays.map((date, pageIndex) => {
            const i = pageStart + pageIndex;
            const events = orderedEvents(t, date);
            const weekday = new Date(date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long" });
            const dayLabel = `Day ${i + 1} — ${date.slice(5).replace("-", "/")}`;
            if (!events.length) return (
              <section className="day-section" id={`day-${date}`} tabIndex={-1} key={date}>
                <div className="day-title">
                  <h3>
                    <button className="empty-day-link" onClick={() => go(11, { date })}>
                      <span><strong>{dayLabel}</strong><small>{weekday} · 0 plans</small></span>
                      <ArrowUpRight size={15} aria-hidden="true" />
                    </button>
                  </h3>
                </div>
                <div className="empty-day">
                  {canEdit(t, s.userId, date) && <button
                    className="text-link"
                    aria-label="Add event to this day"
                    onClick={() => go(7, { date, view: "list" })}
                  ><Plus size={15} />Add event</button>}
                </div>
              </section>
            );
            return (
            <section className="day-section" id={`day-${date}`} tabIndex={-1} key={date}>
              <div className="day-title">
                <span className="day-number">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3>
                    Day {i + 1} <span>— {date.slice(5).replace("-", "/")}</span>
                  </h3>
                  <p>
                    {weekday} · {events.length} {events.length === 1 ? "plan" : "plans"}
                  </p>
                </div>
                <button
                  className="text-link push"
                  onClick={() => go(11, { date })}
                >
                  View day <ArrowUpRight size={15} />
                </button>
              </div>
                <div className="events-list">
                  {events.map((e) => (
                    <EventCard key={e.id} id={`itinerary-event-${e.id}`} event={e} />
                  ))}
                </div>
            </section>
            );
          })}
          {allDays.length > 7 && <div className="day-page-controls day-page-controls-bottom" role="navigation" aria-label="Day list pages">
            {pageCount > 1 && <button type="button" className="day-page-arrow" onClick={() => pageFromBottom(currentPage - 1)} disabled={currentPage === 0} aria-label="Previous days"><ChevronLeft size={16} /></button>}
            <span aria-live="polite">{dayRange}</span>
            {pageCount > 1 && <button type="button" className="day-page-arrow" onClick={() => pageFromBottom(currentPage + 1)} disabled={currentPage >= pageCount - 1} aria-label="Next days"><ChevronRight size={16} /></button>}
          </div>}
        </div>
        <aside className="itinerary-aside">
          <div className="card inspiration-card">
            <span className="little-icon">
              <Sparkles size={22} />
            </span>
            <h3>Suggestions</h3>
            <Button variant="outline full" onClick={() => go(9)}>
              View suggestions <ArrowRight size={16} />
            </Button>
          </div>
          <div className="card budget-peek">
            <div className="row">
              <h3>{personalBudget ? "Your budget" : "Trip budget"}</h3>
              <Wallet size={18} />
            </div>
            <strong>
              {budget !== null ? money(budget - totalSpent) : "Not set yet"}
            </strong>
            {budget !== null && <p>Remaining</p>}
            {budget !== null && (
              <div className="progress">
                <i
                  style={{
                    width: `${Math.min(100, (totalSpent / Math.max(budget, 1)) * 100)}%`,
                  }}
                />
              </div>
            )}
            <button className="text-link" onClick={() => go(12)}>
              View budget <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="card group-peek">
            <div className="avatar-stack">
              {t.members
                .filter((m) => m.status === "accepted")
                .map((m, i) => (
                  <Avatar key={m.id} name={m.name} index={i} id={m.accountId || m.id} />
                ))}
            </div>
            <h3>Travel preferences</h3>
            <button className="text-link" onClick={() => go(15)}>
              Your travel preferences <ArrowRight size={15} />
            </button>
          </div>
        </aside>
      </div>}
    </>
  );
}
function UnavailableItineraryItem({ onReturn, label }: { onReturn: () => void; label: string }) {
  return (
    <Empty
      title="Itinerary item unavailable"
      body="This item may have been removed from the trip."
      action={<Button onClick={onReturn}>{label}</Button>}
    />
  );
}

// The trip can refresh while this form is open. Only changes to the selected
// event invalidate the draft. Background Google place-ID lookups are harmless.
function eventFormVersion(event?: Event): string {
  if (!event) return "";
  return JSON.stringify([
    event.id, event.name, event.date, event.start, event.end, event.cost,
    event.place, event.notes, event.image, event.point?.lat, event.point?.lng,
    [...event.attendees].sort(),
  ]);
}

export function EventForm() {
  const { trip: t, s, route, go, mutate, updateTrip, toast } = useApp();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const cancelEventButton = useRef<HTMLButtonElement>(null);
  if (!t) return null;
  const original = t.events.find((e) => e.id === route.params.get("event"));
  const openedVersion = useRef(eventFormVersion(original));
  const changedElsewhere = (current?: Event) => openedVersion.current !== eventFormVersion(current);
  const stale = changedElsewhere(original);
  const dateParam = route.params.get("date") || t.start;
  const suggested = route.params.get("suggestion");
  // Seed only a new, unscheduled draft. Editing or an explicit calendar selection
  // must retain its time, and later background updates must not move the draft.
  const [initialSlot] = useState(() => !original && !route.params.has("start") && !route.params.has("end")
    ? findAvailableHour(t, s.userId, [dateParam]) : undefined);
  const [mode, setMode] = useState("manual"),
    [name, setName] = useState(original?.name || suggested || ""),
    [place, setPlace] = useState(
      original?.place || route.params.get("place") || "",
    ),
    [point, setPoint] = useState(original?.point ?? null),
    [selectedGooglePlaceId, setSelectedGooglePlaceId] = useState(original?.googlePlaceId ?? null),
    [date, setDate] = useState(original?.date || dateParam),
    [start, setStart] = useState(
      original?.start || route.params.get("start") || initialSlot?.start || "",
    ),
    [end, setEnd] = useState(
      original?.end || route.params.get("end") || initialSlot?.end || "",
    ),
    [cost, setCost] = useState(
      original ? String(original.cost / 100) : route.params.get("cost") || "0",
    ),
    [attendees, setAttendees] = useState(
      original?.attendees ||
        t.members.filter((m) => m.status === "accepted").map((m) => m.id),
    ),
    [notes, setNotes] = useState(original?.notes || route.params.get("notes") || ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [scan, setScan] = useState(""),
    [preview, setPreview] = useState("");
  const [eventPhotos, setEventPhotos] = useState<UnsplashPhoto[]>([]);
  const photoOptions = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!eventPhotos.length) return;
    const frame = requestAnimationFrame(() => {
      const first = photoOptions.current?.querySelector("button");
      const actions = document.querySelector(".event-editor-actions");
      if (!first || !first.getClientRects().length || !actions) return;
      const box = first.getBoundingClientRect();
      // The fixed action bar is inside the viewport, so nearest scrolling alone
      // can leave returned photo choices and their attribution underneath it.
      if (box.top < 16 || box.bottom > actions.getBoundingClientRect().top - 16)
        first.scrollIntoView({ block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [eventPhotos]);
  const [selectedEventPhoto, setSelectedEventPhoto] = useState<UnsplashPhoto | null>(null);
  const [uploadedEventPhoto, setUploadedEventPhoto] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [retryPhoto, setRetryPhoto] = useState<File | null>(null);
  const photoRequest = useRef(0);
  useEffect(() => () => { photoRequest.current += 1; }, []);
  async function chooseEventPhoto(file: File): Promise<void> {
    const request = ++photoRequest.current;
    setPhotoUploading(true);
    setPhotoSearchFailed(false);
    setPhotoError("");
    setRetryPhoto(null);
    let decoded = false;
    try {
      await validatePhoto(file);
      decoded = true;
      let image: string;
      if (t!.persistence === "account") {
        if (!s.userId) throw new Error("Sign in to upload an event photo.");
        image = await uploadTripPhoto(file, s.userId, t!.id);
      } else {
        image = await readPhotoDataUrl(file);
      }
      if (request === photoRequest.current) {
        setUploadedEventPhoto(image);
        setSelectedEventPhoto(null);
      }
    } catch (error) {
      if (request === photoRequest.current) {
        setPhotoError(error instanceof Error ? error.message : "Your photo couldn’t upload. Try again.");
        if (decoded) setRetryPhoto(file);
      }
    } finally {
      if (request === photoRequest.current) setPhotoUploading(false);
    }
  }
  const [photoError, setPhotoError] = useState("");
  const [photoSearchFailed, setPhotoSearchFailed] = useState(false);
  const photoFeedback = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!photoError) return;
    const frame = requestAnimationFrame(() => {
      const feedback = photoFeedback.current;
      const actions = document.querySelector(".event-editor-actions");
      if (!feedback || !actions) return;
      // Upload failures add a recovery action after the file picker returns. Keep both visible.
      if (feedback.getBoundingClientRect().bottom > actions.getBoundingClientRect().top) {
        feedback.scrollIntoView({ block: "center" });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [photoError]);
  const deletePanel = useRef<HTMLDivElement>(null);
  const extractionFailure = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scan === "failed") {
      extractionFailure.current?.scrollIntoView({block:"center"});
      extractionFailure.current?.focus({preventScroll:true});
    }
  }, [scan]);
  useEffect(() => {
    if (mode === "delete") { deletePanel.current?.scrollIntoView({block:"center"}); deletePanel.current?.focus({preventScroll:true}); }
  }, [mode]);
  const findEventPhotos = async () => {
    setPhotoSearchFailed(false);
    setPhotoBusy(true);
    setPhotoError("");
    setRetryPhoto(null);
    try {
      const eventQuery = [name, place, t.destinations[0]].filter(Boolean).join(" ");
      const eventMatches = await searchDestinationPhotos(eventQuery);
      if (eventMatches.length) {
        setEventPhotos(eventMatches);
        return;
      }

      // Specific venue searches can be too narrow. Fall back to a general
      // destination query so the event can still use a city or country photo.
      const destination = t.destinations.join(" ");
      const destinationMatches = await searchDestinationPhotos(destination);
      setEventPhotos(destinationMatches);
      if (!destinationMatches.length) setPhotoError(`No photos found for ${destination}. You can upload your own photo or continue without one.`);
    } catch (err) {
      setPhotoSearchFailed(true);
      setPhotoError(err instanceof Error ? err.message : "Could not find event photos.");
    } finally {
      setPhotoBusy(false);
    }
  };
  const extract = (fail = false) => {
    setScan("loading");
    setTimeout(() => {
      if (fail) {
        setScan("failed");
        return;
      }
      setName("A visit to the gallery");
      setPoint(null);
      setSelectedGooglePlaceId(null);
      setPlace(
        t.sample
          ? "Cedar Gallery · downtown"
          : `Sample gallery · ${t.destinations[0]}`,
      );
      const slot = findAvailableHour(t, s.userId, [date], original?.id);
      if (slot) { setStart(slot.start); setEnd(slot.end); setError(""); }
      else setError("This day has no open one-hour slot. Choose another date or adjust the time before adding the sample.");
      setCost("40");
      setScan("review");
      setMode("manual");
    }, 700);
  };
  const returnTo = route.params.get("return");
  const leaveForm = (day: string, eventId?: string) => {
    if (returnTo === "17") go(17, eventId ? { event: eventId } : {});
    else if (returnTo === "9") go(9);
    else if (returnTo === "16") go(16);
    else if (returnTo === "11") go(11, { date: day, ...(eventId ? { event: eventId } : {}) });
    else go(8, { date: day, ...(eventId ? {event: eventId} : {}), view: route.params.get("view") === "calendar" ? "calendar" : "list" });
  };
  const draft = JSON.stringify([name, place, point, selectedGooglePlaceId, date, start, end, cost, attendees, notes, uploadedEventPhoto, selectedEventPhoto?.url]);
  const initialDraft = useRef(draft);
  const timeError = /^(?:End time|This overlaps|Choose a day within)/.test(error);
  const timeErrorTarget = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (timeError) {
      timeErrorTarget.current?.scrollIntoView({ block: "center" });
      timeErrorTarget.current?.focus({ preventScroll: true });
    }
  }, [error, timeError]);
  if (route.params.has("event") && !original) {
    return <UnavailableItineraryItem
      label={returnTo === "17" ? "Back to map" : "View itinerary"}
      onReturn={() => leaveForm(dateParam)}
    />;
  }
  if (!canEdit(t, s.userId, original?.date ?? dateParam)) {
    return <Empty title="Event permissions" body={EVENT_PERMISSION_MESSAGE}
      action={<Button onClick={() => leaveForm(original?.date ?? dateParam, original?.id)}>Back to itinerary</Button>} />;
  }
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || stale || photoUploading) return;
    const inputProblem =
      textError(name, "Event name", TEXT_LIMITS.eventName, true) ||
      (!place.trim() && "Enter a location.") ||
      moneyError(cost, MONEY_LIMITS.expense, true);
    if (inputProblem) {
      setError(inputProblem);
      return;
    }
    const event: Event = {
      id: original?.id || uid(),
      name: name.trim(),
      place: place.trim(),
      googlePlaceId: point ? null : selectedGooglePlaceId,
      point,
      date,
      start,
      end,
      cost: Math.round(Number(cost) * 100),
      attendees,
      image: uploadedEventPhoto || selectedEventPhoto?.url || original?.image || "",
      notes,
    };
    const err = eventError(t, s.userId, event, original);
    if (err) {
      setError(err);
      requestAnimationFrame(() => {
        timeErrorTarget.current?.scrollIntoView({block:"center"});
        timeErrorTarget.current?.focus({preventScroll:true});
      });
      return;
    }
    setBusy(true);
    let applied = false;
    updateTrip((v) => {
      if (v.id !== t.id) return;
      const index = v.events.findIndex((e) => e.id === event.id);
      if (changedElsewhere(v.events[index])) return;
      if (index >= 0) v.events[index] = event;
      else v.events.push(event);
      applied = true;
    });
    if (!applied) {
      setBusy(false);
      setError("The itinerary changed. Reopen the item to try again.");
      return;
    }
    // Save the actual edit first. An optional lookup must never strand a submitted
    // event on the form or overwrite later edits, even when the user navigates away.
    if (!event.point && !event.googlePlaceId && original?.place !== event.place) {
      void resolveSavedLocation(event.place, t.destinations).then(placeId => {
        if (!placeId) return;
        mutate(store => {
          const target = store.trips.find(trip => trip.id === t.id);
          const current = target?.events.find(item => item.id === event.id);
          if (target && current && store.userId === s.userId && canEdit(target, store.userId, current.date)
            && current.place === event.place && !current.point && !current.googlePlaceId) current.googlePlaceId = placeId;
        });
      });
    }
    // A forwarded booking leaves the waiting list once its event is on the trip. This only records
    // which trip it went to; the event itself is saved and shared by the normal trip save above.
    const fromBooking = route.params.get("booking");
    if (!original && fromBooking) {
      void setBookingTrip(fromBooking, t.id).catch(() => toast("The event was added, but the booking is still in your forwarded list."));
    }
    toast(
      original
        ? "Event updated everywhere in your trip."
        : "A new plan, added to your day.",
    );
    leaveForm(date, event.id);
  };
  const eventIdentityFields = <>
              <Field label="Event name">
                <input
                  required
                  maxLength={TEXT_LIMITS.eventName}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="A morning at the museum"
                />
              </Field>
              <EventLocationInput value={place} onChange={(label, position, placeId) => { setPlace(label); setPoint(position ?? null); setSelectedGooglePlaceId(placeId ?? null); }} destinations={t.destinations} itinerary={{events:t.events,date,start,editingId:original?.id}} />

  </>;
  const role = member(t, s.userId)?.role;
  const attendingCount = t.members.filter((m) => m.status === "accepted" && attendees.includes(m.id)).length;
  const availableAttendees = t.members.filter((m) => m.status === "accepted").length;
  return (
    <>
      <PageHead
        eyebrow={suggested ? undefined : t.title}
        title={original ? "A little change of plans." : suggested ? "Choose a time." : "Make a little plan."}
        description="Something to see, somewhere to be, someone to share it with."
        action={original && <Button variant="outline event-delete-trigger" aria-label="Delete event" disabled={busy || stale || photoUploading} onClick={() => setMode("delete")}><Trash2 size={18} /> Delete</Button>}
      />
      <div className="form-layout">
        <form className={`card form-card event-editor-form${suggested ? " is-suggested" : ""}`} onSubmit={submit} onInvalidCapture={(event) => {
          // Native validation must be able to reveal a required field in a disclosure.
          let parent = (event.target as HTMLElement).parentElement;
          while (parent && parent !== event.currentTarget) {
            if (parent instanceof HTMLDetailsElement) parent.open = true;
            parent = parent.parentElement;
          }
        }} onFocusCapture={revealFocusedFormField} onKeyDown={event => {
          // Enter selects autocomplete options, but only the explicit Save button submits.
          const target = event.target;
          if (event.key === "Enter" && !event.nativeEvent.isComposing && target instanceof HTMLInputElement
            && !["submit", "button", "checkbox", "radio", "file"].includes(target.type)) event.preventDefault();
        }}>
          {stale && original && (
            <div role="alert" className="info-banner">
              <span>This event changed while you were editing. Review the latest details before saving or deleting it.</span>
              <Button variant="text" onClick={() => go(11, { date: original.date, event: original.id })}>
                View latest event
              </Button>
            </div>
          )}
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
          {mode === "delete" && original && <div className="delete-event-panel" ref={deletePanel} tabIndex={-1}><h3>Delete this event?</h3><p>Are you sure you want to delete “{original.name}” from this trip?</p><div className="form-actions"><Button variant="outline" onClick={() => setMode("manual")}>Keep editing</Button><Button type="button" variant="danger" disabled={busy || stale || photoUploading} onClick={() => { let deleted=false;updateTrip(trip=>{const current=trip.events.find(e=>e.id===original.id);if(!current||changedElsewhere(current))return;trip.events=trip.events.filter(e=>e.id!==original.id);deleted=true;});if(deleted)leaveForm(original.date);}}>Delete event</Button></div></div>}
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
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
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
                  try {
                    await validatePhoto(f, 10);
                    setError("");
                    setPreview(URL.createObjectURL(f));
                    extract();
                  } catch (error) {
                    setError(error instanceof Error ? error.message : "Choose a different image.");
                  }
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
                <div ref={extractionFailure} tabIndex={-1} className="extraction-recovery"><ErrorBox text="We couldn’t read this confirmation. Try again or enter the details manually." /><Button variant="outline" onClick={() => setMode("manual")}>Enter details manually</Button></div>
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
              {suggested && <div className="suggested-event-summary"><h2>{name}</h2><p>{place}</p></div>}
              {!suggested && <>{eventIdentityFields}</>}

              <Field label="Day">
                <select value={date} onChange={(e) => { setDate(e.target.value); setError(""); }}>
                  {days(t.start, t.end).map((d, i) => (
                    <option key={d} value={d} disabled={!canEdit(t, s.userId, d)}>
                      Day {i + 1} — {dateText(d, true)}
                      {!canEdit(t, s.userId, d) ? " (view only)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="form-columns event-time-fields">
                <Field label="Start time">
                  <input
                    required
                    type="time"
                    value={start}
                    onChange={(e) => { setStart(e.target.value); setError(""); }}
                  />
                </Field>
                <Field label="End time">
                  <input
                    required
                    type="time"
                    value={end}
                    onChange={(e) => { setEnd(e.target.value); setError(""); }}
                  />
                </Field>
              </div>
              {timeError && <div ref={timeErrorTarget} tabIndex={-1} className="event-time-error"><ErrorBox text={error} /></div>}
              <p className="fine-print">
                Times in {zoneText(t.zone)}. For overnight activities, add one event per
                day.
              </p>
              {suggested && <details className="suggested-event-details"><summary>Edit name or location</summary>{eventIdentityFields}</details>}
              <PlacePopularTimes
                  place={place.trim()}
                  googlePlaceId={selectedGooglePlaceId}
                  destinations={t.destinations}
                />
              <Field
                label="Estimated cost (USD)"
                hint="Log actual payments in Budget."
              >
                <input
                  required
                  min="0"
                  max={MONEY_LIMITS.expense / 100}
                  step="0.01"
                  type="number"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                />
              </Field>
              <details className="event-attendees">
                <summary><strong>Who’s coming?</strong><span>{attendingCount === availableAttendees && availableAttendees > 0 ? `Everyone · ${attendingCount}` : `${attendingCount} of ${availableAttendees} travelers`}</span></summary>
                <fieldset>
                <legend className="sr-only">Choose travelers</legend>
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
                        <Avatar name={m.name} id={m.accountId || m.id} />
                        {m.name}
                      </label>
                    ))}
                </div>
              </fieldset>
              </details>
              <Field label="Notes (optional)">
                <textarea
                  rows={3}
                  maxLength={TEXT_LIMITS.notes}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="A meeting point, ticket details, or a little reminder…"
                />
              </Field>
              <details className="photo-disclosure event-photo-disclosure"><summary>Event photo <span>Optional</span></summary><section className="event-photo-picker" aria-label="Event photo"><div className="event-photo-actions"><Button type="button" variant="event-photo-find" disabled={photoBusy || photoUploading} onClick={findEventPhotos}>{photoBusy ? "Finding photos…" : "Find with Unsplash"}</Button><span>OR</span><label className="event-photo-upload">Upload your own<input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Upload your own event photo" disabled={photoUploading || photoBusy} onChange={e => {
                const file = e.target.files?.[0]; e.target.value = "";
                if (file) void chooseEventPhoto(file);
              }}/></label></div>{photoUploading && <p role="status" className="fine-print">Preparing your photo…</p>}<div ref={photoFeedback}>{photoError && <ErrorBox text={photoError} />}{photoSearchFailed && <Button variant="outline" disabled={photoBusy} onClick={findEventPhotos}>Retry photo search</Button>}{retryPhoto && <Button variant="outline" disabled={photoUploading} onClick={() => void chooseEventPhoto(retryPhoto)}>Retry photo upload</Button>}</div>{eventPhotos.length>0&&<div ref={photoOptions} className="trip-photo-options">{eventPhotos.map(photo=><button type="button" key={photo.id} className={selectedEventPhoto?.id===photo.id?"selected":""} aria-pressed={selectedEventPhoto?.id===photo.id} onClick={()=>{setSelectedEventPhoto(photo);setUploadedEventPhoto("");setRetryPhoto(null);setPhotoError("");}}><img src={photo.thumb} alt={photo.alt}/><PhotoCredit credit={photo.credit} compact/></button>)}</div>}{selectedEventPhoto&&<PhotoCredit credit={selectedEventPhoto.credit} compact/>}{(uploadedEventPhoto || selectedEventPhoto?.url || original?.image) && <img className="upload-preview" src={uploadedEventPhoto || selectedEventPhoto?.url || original?.image} alt="Your event photo preview"/>}</section></details>
            </>
          )}
          <ErrorBox text={timeError ? "" : error} />
          {stale && original && <div className="note event-conflict-note" role="status"><p>This event changed elsewhere. Review the latest version before saving.</p><button type="button" className="text-link" onClick={() => go(11, {date:original.date,event:original.id})}>View latest event</button></div>}
          <div data-fixed-actions className={`form-actions event-editor-actions ${mode === "manual" ? "is-manual" : mode === "upload" ? "is-upload" : ""}`}>
            <Button
              ref={cancelEventButton}
              variant="text"
              onClick={() => {
                if (draft !== initialDraft.current) {
                  cancelEventButton.current?.focus({ preventScroll: true });
                  setConfirmDiscard(true);
                  return;
                }
                leaveForm(original?.date || dateParam, original?.id);
              }}
            >
              Cancel
            </Button>
            {mode === "manual" && (
              <Button
                type="submit"
                disabled={busy || stale || photoUploading || !canEdit(t, s.userId, date)}
              >
                {busy
                  ? "Saving…"
                  : original
                    ? "Save changes"
                    : "Add to itinerary"}
                {original ? <Check size={16} /> : <Plus size={16} />}
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
      {confirmDiscard && <ConfirmDialog title="Discard event changes?" onCancel={() => setConfirmDiscard(false)} onConfirm={() => leaveForm(original?.date || dateParam, original?.id)}>
        Your unsaved changes will be lost.
      </ConfirmDialog>}
    </>
  );
}
export function Suggestions() {
  const { trip: t, s, go, updateTrip, toast, message, dismissMessage } = useApp();
  const [loading, setLoading] = useState(false);
  if (!t) return null;
  const traveler = member(t, s.userId)!;
  const prefs = t.prefs[traveler.id];
  const canDismiss = traveler.role === "Owner" || traveler.role === "Editor";
  const items = [
    {
      id: "gallery",
      title: "A stop for local art",
      place: t.sample
        ? "Cedar Gallery · downtown"
        : `Gallery near ${t.destinations[0]}`,
      image: IMAGES.museum,
      cost: 40,
      tag: "ART & CULTURE",
      reason: t.events.some((e) => e.id === "museum")
        ? "Since you planned Seattle Art Museum, you might enjoy a smaller local gallery."
        : `A cultural stop near ${t.destinations[0]} to explore when you have time.`,
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
          : "Local flavors for the group’s saved preferences.",
    },
  ];
  const dates = days(t.start, t.end).filter((d) => canEdit(t, s.userId, d));
  const preferred = isActive(t, s.date)
    ? [s.date, ...dates.filter((d) => d !== s.date)]
    : dates;
  const slot = findAvailableHour(t, s.userId, preferred, undefined, { date: s.date, time: s.time });
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
        title="Suggestions"
        description="Sample ideas for your trip. Check venue details before you go."
        action={
          <Button
            variant="outline suggestion-refresh"
            aria-label="Refresh ideas"
            onClick={() => {
              setLoading(true);
              setTimeout(() => setLoading(false), 600);
            }}
          >
            <Sparkles size={16} />
            <span>Refresh</span>
          </Button>
        }
      />
      {message === "Trip preferences saved." && <div className="inline-success" role="status"><span>{message}</span><button className="icon-btn" aria-label="Dismiss message" onClick={dismissMessage}><X size={16}/></button></div>}
      <div className="suggestion-context">
        <Badge tone="green">
          <MapPin size={13} />
          {t.destinations[0]}
        </Badge>
        <Badge>{Object.keys(t.prefs).length} preference {Object.keys(t.prefs).length === 1 ? "survey" : "surveys"}</Badge>
        <button className="text-link" onClick={() => { dismissMessage(); go(15, { return: "9" }); }}>
          Update your preferences <ArrowRight size={14} />
        </button>
      </div>
      {!slot && dates.length > 0 && <p className="note suggestion-time-recovery">There are no upcoming one-hour slots on your editable days. <button className="text-link" onClick={() => go(8)}>Review your itinerary <ArrowRight size={14} /></button></p>}
      {!prefs && (
        <div className="info-banner">
          Tell us what you enjoy in My preferences to make these ideas more
          personal.
        </div>
      )}
      {loading ? (
        <div className="skeleton-grid" aria-live="polite">
          <span className="sr-only">Finding sample ideas…</span>
          <div />
          <div />
          <div />
        </div>
      ) : (
        <div className="suggestions-grid">
          {eligibleItems
            .filter((i) => !t.dismissed.includes(i.id))
            .map((i) => {
              // Recognize the existing sample by its editable title/location; deleting it makes it available again.
              const added = t.events.find(event => (event.name === i.title || (i.id === "gallery" && event.name === "An afternoon with local art")) && event.place === i.place);
              return <article className="suggestion-card" key={i.id}>
                <Photo src={i.image} alt={i.title} />
                <div className="suggestion-body">
                  <div className="eyebrow">{i.tag}</div>
                  <h2>{i.title}</h2>
                  <p className="suggestion-place"><MapPin size={14} aria-hidden="true" />{i.place}</p>
                  <p>{i.reason}</p>
                  <div className="suggestion-meta">
                    <span>
                      <Clock size={14} />
                      About 1 hour
                    </span>
                    <span>{i.cost ? `Est. $${i.cost}` : "Free"}</span>
                  </div>
                  <p className="available-slot">
                    {added ? `Added: ${dateText(added.date, true)} at ${timeText(added.start)}` : slot
                      ? `Free in your itinerary: ${dateText(slot.date, true)} at ${timeText(slot.start)}`
                      : dates.length ? "No upcoming one-hour slot on your editable days" : "Ask a trip editor to add this idea"}
                  </p>
                  <div className="card-actions">
                    {!added && canDismiss && <Button
                      variant="text"
                      onClick={() => {
                        updateTrip((t) => t.dismissed.push(i.id));
                        toast("Suggestion dismissed.");
                      }}
                    >
                      Not this time
                    </Button>}
                    <Button
                      disabled={!added && !slot}
                      onClick={() => {
                        if (added) { dismissMessage(); go(11, {date: added.date, event: added.id}); return; }
                        dismissMessage();
                        slot && go(7, {
                          suggestion: i.title,
                          return: "9",
                          place: i.place,
                          date: slot.date,
                          start: slot.start,
                          end: slot.end,
                          cost: String(i.cost),
                        });
                      }}
                    >
                      {added ? <>View added plan <ArrowRight size={15} /></> : <>Choose a time <Plus size={15} /></>}
                    </Button>
                  </div>
                </div>
              </article>;
            })}
        </div>
      )}
      {!loading && eligibleItems.length === 0 && (
        <Empty
          title="No sample matches fit the group right now."
          body="The sample activities exceed a saved walking limit. Review preferences or plan an activity manually."
        />
      )}
      {!loading && eligibleItems.length > 0 &&
        eligibleItems.every((i) => t.dismissed.includes(i.id)) && (
          <Empty
            title="A little space for your own ideas."
            body="You’ve reviewed all the sample suggestions."
            action={canDismiss &&
              <Button onClick={() => { updateTrip((t) => (t.dismissed = [])); dismissMessage(); }}>
                Show suggestions again
              </Button>
            }
          />
        )}
      {!loading && canDismiss && eligibleItems.some((item) => t.dismissed.includes(item.id)) &&
        eligibleItems.some((item) => !t.dismissed.includes(item.id)) && (
          <div className="suggestion-reset">
            <Button variant="text" onClick={() => { updateTrip((trip) => (trip.dismissed = [])); dismissMessage(); }}>
              Show suggestions again
            </Button>
          </div>
        )}
    </>
  );
}
export function Dashboard() {
  const { trip: t, s, go, open, updateTrip } = useApp();
  const [todoError, setTodoError] = useState("");
  const remindersPanel = useRef<HTMLDivElement>(null);
  const [agendaDate, setAgendaDate] = useState("");
  const [todo, setTodo] = useState(""),
    [weekOffset, setWeekOffset] = useState(0);
  if (!t) return null;
  if (!isActive(t, s.date))
    return (
      <Empty
        title={s.date > t.end ? "This trip has wrapped up." : "This trip’s moment is still to come."}
        body={`Today opens during ${dateText(t.start, true)}–${dateText(t.end, true)}. Change the demo date to preview it.`}
        action={
          <>
            <Button onClick={() => open("demo", {section:"time"})}>Change demo date</Button>
            <Button variant="outline" onClick={() => go(8)}>
              See the itinerary
            </Button>
          </>
        }
      />
    );
  const todays = orderedEvents(t, s.date),
    next = todays.find((e) => e.end > s.time);
  const reminders = t.todos.filter(todo => todo.date === s.date);
  const remainingReminders = reminders.filter(todo => !todo.done).length;
  const reminderJump = reminders.length > 0 && <Button variant="text" onClick={() => {
    remindersPanel.current?.scrollIntoView({block:"start"});
    remindersPanel.current?.focus({preventScroll:true});
  }}>{remainingReminders ? `${remainingReminders} reminder${remainingReminders === 1 ? "" : "s"} left` : "Reminders complete"}</Button>;
  const start = new Date(s.date + "T12:00:00Z");
  start.setUTCDate(start.getUTCDate() - start.getUTCDay() + weekOffset * 7);
  const last = new Date(start);
  last.setUTCDate(last.getUTCDate() + 6);
  const week = days(
    start.toISOString().slice(0, 10),
    last.toISOString().slice(0, 10),
  );
  const visibleAgendaDate = week.includes(agendaDate) ? agendaDate : week.includes(s.date) ? s.date : week.find(day => day >= t.start && day <= t.end) || week[0];
  const agendaEvents = orderedEvents(t, visibleAgendaDate);
  return (
    <>
      <PageHead
        eyebrow={`${dateText(s.date)} · ${timeText(s.time)} · DEMO TIME`}
        title="Today"
        description={t.title}
        action={
          <Button variant="outline" onClick={() => open("nearby")}>
            <Sparkles size={16} />
            Discover nearby
          </Button>
        }
      />
      {next && <section className="card today-next-stop" aria-label="Next stop">
        <div><span className="eyebrow">{next.start <= s.time ? "Happening now" : "Next stop"} · {timeText(next.start)}</span><h2>{next.name}</h2><p>{next.place}</p></div>
        <div className="today-next-actions"><Button onClick={() => go(17, {event:next.id})}>View on map <ArrowUpRight size={16}/></Button>{reminderJump}</div>
      </section>}
      {!next && <section className="card today-next-stop" aria-label="Today’s plans">
        <div><h2>{todays.length ? "No more plans today" : "No events today"}</h2><p>{todays.length ? "Your scheduled events have finished." : "Add a plan or enjoy the open time."}</p></div>
        <div className="today-next-actions">{reminderJump}{!todays.length && <Button variant="outline" onClick={() => go(9)}>Find an idea</Button>}</div>
      </section>}
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
              View today <ArrowUpRight size={16} />
            </button>
          </div>
          <p className="week-date-range" aria-live="polite">{dateText(week[0], true)} – {dateText(week[6], true)}</p>
          <div className="mobile-agenda">
            <div className="agenda-day-choices" role="group" aria-label="Choose a day this week">
              {week.map(day => <button key={day} disabled={day < t.start || day > t.end} aria-pressed={day === visibleAgendaDate} aria-label={dateText(day)} onClick={() => setAgendaDate(day)}>
                <span>{new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}</span>
                <strong>{Number(day.slice(8))}</strong>
              </button>)}
            </div>
            <h3>{dateText(visibleAgendaDate, true)}</h3>
            {agendaEvents.map(event => <EventCard key={event.id} event={event} />)}
            {!agendaEvents.length && <p className="fine-print">No plans for this day.</p>}
            <Button variant="text" onClick={() => go(11, {date:visibleAgendaDate})}>View day <ArrowUpRight size={16}/></Button>
          </div>
        </div>
        <div className="card todo-card" ref={remindersPanel} tabIndex={-1}>
          <span className="eyebrow">THE LITTLE THINGS</span>
          <h2>Before you go.</h2>
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
            <p>No little reminders for today.</p>
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
                placeholder="Add a little reminder"
              />
              <button className="icon-btn" aria-label="Add to-do">
                <Plus size={17} />
              </button>
            </form>
          )}
          <ErrorBox text={todoError} />
          <div className="note">Shared with your group.</div>
        </div>
      </div>
      <div className="section-title">
        <div>
          <h2>Today’s map</h2>
        </div>
        <Button
          variant="outline"
          onClick={() => go(17, next ? { event: next.id } : {})}
        >
          Open map <ArrowUpRight size={16} />
        </Button>
      </div>
      <TravelMap key={`${t.id}:${s.date}`} compact date={s.date} selectedEvent={next?.id} />

    </>
  );
}
/** Keep long optional notes readable without hiding the day's later plans. */
function EventNotes({ notes }: { notes: string }) {
  const [expanded, setExpanded] = useState(false);
  const id = React.useId();
  if (notes.length <= 320) return <p>{notes || "A little something to look forward to."}</p>;
  return <div className="event-notes">
    <p id={id} className={expanded ? "" : "is-collapsed"}>{notes}</p>
    <button type="button" className="text-link" aria-expanded={expanded} aria-controls={id} onClick={event => {
      const control = event.currentTarget;
      setExpanded(value => !value);
      if (expanded) requestAnimationFrame(() => {
        const bounds = control.getBoundingClientRect();
        const bottom = innerHeight - (document.querySelector('.mobile-nav')?.getBoundingClientRect().height || 0);
        if (bounds.top < 16 || bounds.bottom > bottom - 16) control.scrollIntoView({ block: 'center' });
      });
    }}>
      {expanded ? "Show less" : "Read full notes"}
    </button>
  </div>;
}

export function DayDetail() {
  const { trip: t, s, route, go } = useApp();
  const selectedEvent = route.params.get("event");
  const requested = route.params.get("date");
  const selectedDate = t?.events.find(event => event.id === selectedEvent)?.date;
  useEffect(() => {
    if (selectedEvent && selectedDate && selectedDate !== requested) {
      // Keep the displayed shared event's day in this history entry. If it is
      // later removed, recovery and reload still return to the day just viewed.
      go(11, { ...Object.fromEntries(route.params), date: selectedDate }, true);
    }
  }, [selectedEvent, selectedDate, requested, route.params, go]);
  if (!t) return null;
  const date = itineraryDay(t, selectedEvent, requested, s.date);
  if (selectedEvent && !t.events.some((event) => event.id === selectedEvent)) {
    return <UnavailableItineraryItem label="View day" onReturn={() => go(11, { date })} />;
  }
  const list = days(t.start, t.end),
    index = list.indexOf(date),
    events = orderedEvents(t, date),
    allowed = canEdit(t, s.userId, date);
  return (
    <>
      <PageHead
        eyebrow={`DAY ${index + 1} OF ${list.length}`}
        title={
          new Date(date + "T12:00:00").toLocaleDateString("en-US", {
            weekday: "long",
          }) +
          ", " +
          dateText(date, true)
        }
        description={`A closer look at your day · ${zoneText(t.zone)}`}
        action={allowed && events.length > 0 &&
          <Button onClick={() => go(7, { date, return: "11" })}>
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
        <DatePicker
          label="Choose a day"
          min={t.start}
          max={t.end}
          value={date}
          onChange={(next) => {
            if (next >= t.start && next <= t.end) go(11, { date: next });
          }}
        />
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
                <small>Start</small>
                <span>{timeText(e.start)}</span>
                <small>End</small>
                <span>{timeText(e.end)}</span>
                {durationText(e.start, e.end) && (
                  <span className="duration">
                    {durationText(e.start, e.end)}
                  </span>
                )}
              </div>
              <div className="timeline-dot" />
              <article
                id={`day-event-${e.id}`}
                tabIndex={selectedEvent === e.id ? -1 : undefined}
                aria-labelledby={`event-title-${e.id}`}
                className={`card detail-event ${selectedEvent === e.id ? "focused" : ""}`}
              >
                <Photo src={e.image} alt={e.place} optional />
                <div>
                  <span className="eyebrow">
                    {e.attendees.length}{" "}
                    {e.attendees.length === 1 ? "TRAVELER" : "TRAVELERS"}
                  </span>
                  <h2 id={`event-title-${e.id}`}>{e.name}</h2>
                  <button
                    className="text-link"
                    onClick={() => go(17, { event: e.id })}
                  >
                    <MapPin size={14} />
                    {e.place}
                  </button>
                  <div className="row">
                    <Badge>
                      {e.cost
                        ? `${money(e.cost)} estimated`
                        : "No cost planned"}
                    </Badge>
                    {canEdit(t, s.userId, e.date) && <Button
                      variant="outline small"
                      onClick={() => go(7, { event: e.id, date, return: "11" })}
                    >
                      Edit event
                    </Button>}
                  </div>
                  <EventNotes key={e.id} notes={e.notes} />
                </div>
              </article>
            </div>
          ))}
          {!events.length && (
            <Empty
              title="No events scheduled"
              action={
                allowed ? (
                  <Button onClick={() => go(7, { date, return: "11" })}>
                    Add the first event
                  </Button>
                ) : undefined
              }
            />
          )}
        </div>
        <aside className="card day-summary">
          {events.length > 0 && <h2>{events.length} {events.length === 1 ? "event" : "events"}</h2>}
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
