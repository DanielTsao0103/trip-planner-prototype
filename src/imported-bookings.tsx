import React, { useEffect, useRef, useState } from "react";
import { Bed, Calendar, Car, Copy, Mail, MapPin, Plane, Ticket, Train, Trash2, Utensils } from "lucide-react";
import { Button, ErrorBox, Modal } from "./ui";
import { useApp } from "./state";
import { canEdit } from "./domain";
import {
  bookingEventParams,
  bookingEventId,
  tripForBooking,
  bookingsInboxAddress,
  getBookingForwardingCode,
  setBookingTrip,
  formatBookingDate,
  KIND_LABELS,
  loadForwardedBookings,
  removeForwardedBooking,
  type BookingKind,
  type ForwardedBooking,
} from "./bookings";

const ICONS: Record<BookingKind, typeof Plane> = {
  flight: Plane,
  lodging: Bed,
  rental_car: Car,
  train: Train,
  restaurant: Utensils,
  event: Ticket,
  other: Calendar,
};

function dateRange(b: ForwardedBooking): string {
  const start = formatBookingDate(b.startDate);
  const end = formatBookingDate(b.endDate);
  if (start && end && start !== end) return `${start} to ${end}`;
  return start || end;
}

/** Bookings the signed-in account forwarded by email. Shown on Home for real accounts only. */
export function ImportedBookings() {
  const { s, go, mutate } = useApp();
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [items, setItems] = useState<ForwardedBooking[] | null>(null);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingFirst, setLoadingFirst] = useState(true);
  const [moreError, setMoreError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const nextOffset = useRef(0);
  const loadGeneration = useRef(0);
  const [removing, setRemoving] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [confirmRemoval, setConfirmRemoval] = useState<ForwardedBooking | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const restoreHeading = useRef(false);

  useEffect(() => {
    if (confirmRemoval || !restoreHeading.current) return;
    restoreHeading.current = false;
    // Modal cleanup must remove its background inert state before focus can
    // reach this replacement for the deleted opener. A frame can run too early.
    heading.current?.focus();
  }, [confirmRemoval]);

  useEffect(() => {
    let live = true;
    loadGeneration.current++;
    setLoadingFirst(true);
    setLoadError("");
    setMoreError("");
    loadForwardedBookings().then(
      (rows) => { if (live) { setItems(rows); nextOffset.current = rows.length; setHasMore(rows.length === 50); } },
      () => live && setLoadError("We could not load your forwarded bookings right now."),
    ).finally(() => { if (live) setLoadingFirst(false); });
    return () => {
      live = false;
      loadGeneration.current++;
    };
  }, [loadAttempt]);

  async function loadMore() {
    if (loadingMore || loadingFirst) return;
    const generation = loadGeneration.current;
    setLoadingMore(true);
    setMoreError("");
    try {
      const rows = await loadForwardedBookings(nextOffset.current);
      if (generation !== loadGeneration.current) return;
      nextOffset.current += rows.length;
      setHasMore(rows.length === 50);
      setItems(current => {
        const known = new Set((current ?? []).map(item => item.bookingId));
        return [...(current ?? []), ...rows.filter(item => !known.has(item.bookingId))];
      });
    } catch {
      if (generation === loadGeneration.current) setMoreError("We could not load more bookings. Try again.");
    } finally {
      if (generation === loadGeneration.current) setLoadingMore(false);
    }
  }

  // Only account trips where this person may add an event on the day the form would open on.
  function tripsFor(b: ForwardedBooking) {
    return s.trips.filter(
      (t) => t.persistence === "account" && canEdit(t, s.userId, bookingEventParams(b, t).date),
    );
  }

  // Preselect the one trip whose dates contain the booking, unless the person picked another.
  function selectedTrip(b: ForwardedBooking): string {
    return choice[b.bookingId] ?? tripForBooking(b, tripsFor(b)) ?? "";
  }

  function savedTripFor(b: ForwardedBooking) {
    const eventId = bookingEventId(b.bookingId);
    return eventId ? s.trips.find(item => item.persistence === "account" && item.events.some(event => event.id === eventId)) : undefined;
  }

  async function review(b: ForwardedBooking) {
    // A failed list update must never create a second event on retry.
    const eventId = bookingEventId(b.bookingId);
    const savedTrip = savedTripFor(b);
    if (savedTrip && eventId) {
      setError("");
      try {
        await setBookingTrip(b.bookingId, savedTrip.id);
        mutate(store => { store.tripId = savedTrip.id; });
        const event = savedTrip.events.find(event => event.id === eventId)!;
        go(11, { date: event.date, event: eventId });
      } catch { setError("This plan has not been confirmed yet. Retry its save before updating the booking list."); }
      return;
    }
    const trip = s.trips.find((t) => t.id === selectedTrip(b));
    if (!trip) return;
    mutate((v) => {
      v.tripId = trip.id;
    });
    go(7, bookingEventParams(b, trip));
  }

  async function undo(b: ForwardedBooking) {
    setError("");
    try {
      await setBookingTrip(b.bookingId, null);
      setItems((current) => current && current.map((x) => (x.bookingId === b.bookingId ? { ...x, tripId: null } : x)));
    } catch {
      setError("We could not move that booking back. Try again.");
    }
  }

  async function remove(id: string) {
    if (removing) return;
    setRemoving(id);
    setError("");
    setNotice("");
    try {
      await removeForwardedBooking(id);
      nextOffset.current = Math.max(0, nextOffset.current - 1);
      setItems((current) => current && current.filter((b) => b.bookingId !== id));
      setNotice("Booking removed from this list.");
      restoreHeading.current = true;
      setConfirmRemoval(null);
    } catch {
      setError("We could not remove that booking. Try again.");
    } finally {
      setRemoving(null);
    }
  }

  const waiting = (items ?? []).filter((b) => !b.tripId);
  const added = (items ?? []).filter((b) => !!b.tripId);

  const card = (b: ForwardedBooking) => {
    const Icon = ICONS[b.kind];
    const dates = dateRange(b);
    return (
      <>
        <Icon size={20} aria-hidden="true" />
        <div>
          <span className="muted">{KIND_LABELS[b.kind]}</span>
          <h3>{b.title}</h3>
          {dates && (
            <p>
              <Calendar size={14} aria-hidden="true" /> {dates}
            </p>
          )}
          {b.location && (
            <p>
              <MapPin size={14} aria-hidden="true" /> {b.location}
            </p>
          )}
          {b.confirmationCode && <p>Confirmation: {b.confirmationCode}</p>}
        </div>
      </>
    );
  };
  const removeButton = (b: ForwardedBooking) => (
    <button
      type="button"
      className="icon-btn"
      aria-label={removing === b.bookingId ? `Removing ${b.title}` : `Remove ${b.title}`}
      disabled={removing !== null || loadingMore || loadingFirst}
      onClick={() => { setError(""); setConfirmRemoval(b); }}
    >
      <Trash2 size={16} />
    </button>
  );

  return (
    <section className="forwarded-bookings" aria-labelledby="forwarded-bookings-title">
      <div className="section-title">
        <div>
          <h2 id="forwarded-bookings-title" ref={heading} tabIndex={-1}>Forwarded bookings</h2>
          <p className="muted">
            Forward confirmation emails with your private subject code to collect them here.
          </p>
        </div>
        <Button variant="outline" disabled={loadingMore || loadingFirst || !!removing} onClick={() => setLoadAttempt(value => value + 1)}>Refresh bookings</Button>
      </div>
      {bookingsInboxAddress ? <ForwardingInstructions /> : (
        <p className="muted">Email forwarding is not set up for this site yet.</p>
      )}
      {!confirmRemoval && <ErrorBox text={error} />}
      {notice && <p role="status" className="fine-print">{notice}</p>}
      {!items && !loadError && <p role="status" className="muted">Loading your bookings…</p>}
      {loadError && <div className="booking-load-error">
        <p role="alert">{loadError}</p>
        <Button variant="outline" onClick={() => setLoadAttempt(value => value + 1)}>Retry bookings</Button>
      </div>}
      {items && waiting.length === 0 && !error && (
        <p className="muted">
          {items.length === 0
            ? "Nothing forwarded yet. Open the instructions to get started."
            : hasMore ? "These bookings have been added. Load more to see earlier bookings." : "Everything forwarded so far has been added to a trip."}
        </p>
      )}
      {waiting.length > 0 && (
        <ul className="booking-list">
          {waiting.map((b) => {
            const trips = tripsFor(b);
            const savedTrip = savedTripFor(b);
            return (
              <li className="card booking-item" key={b.bookingId}>
                {card(b)}
                <div className="booking-sort">
                  {savedTrip ? (
                    <Button variant="outline" onClick={() => review(b)}>View saved plan</Button>
                  ) : trips.length > 0 ? (
                    <>
                      <select
                        aria-label={`Trip for ${b.title}`}
                        value={selectedTrip(b)}
                        onChange={(e) => setChoice((c) => ({ ...c, [b.bookingId]: e.target.value }))}
                      >
                        <option value="">Choose a trip</option>
                        {trips.map((t) => (
                          <option key={t.id} value={t.id}>{t.title}</option>
                        ))}
                      </select>
                      <Button variant="outline" disabled={!selectedTrip(b)} onClick={() => review(b)}>
                        Review and add
                      </Button>
                    </>
                  ) : (
                    <span className="muted">Create a trip, or ask for edit access to one, to add this.</span>
                  )}
                  {removeButton(b)}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {added.length > 0 && (
        <>
          <h3 className="booking-group-title">Added to trips</h3>
          <ul className="booking-list">
            {added.map((b) => {
              const trip = s.trips.find((t) => t.id === b.tripId);
              return (
                <li className="card booking-item booking-added" key={b.bookingId}>
                  {card(b)}
                  <div className="booking-sort">
                    <span className="muted">Added to {trip ? trip.title : "a trip"}</span>
                    <Button variant="text" onClick={() => undo(b)}>Move back</Button>
                    {removeButton(b)}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {moreError && <p role="alert">{moreError}</p>}
      {hasMore && <Button variant="outline" disabled={loadingMore || loadingFirst || !!removing} onClick={() => void loadMore()}>{loadingMore ? "Loading bookings…" : "Load more bookings"}</Button>}
      {confirmRemoval && <Modal title="Remove this booking?" onClose={() => { if (!removing) setConfirmRemoval(null); }}>
        <p><strong>{confirmRemoval.title}</strong></p>
        <p>This removes the forwarded confirmation from your list. It does not cancel your reservation. You can forward the original email again to add it back.</p>
        <ErrorBox text={error}/>
        <div className="form-actions"><Button variant="outline" disabled={!!removing} onClick={() => setConfirmRemoval(null)}>Keep booking</Button><Button variant="danger" disabled={!!removing} onClick={() => void remove(confirmRemoval.bookingId)}>{removing ? "Removing…" : "Remove booking"}</Button></div>
      </Modal>}
    </section>
  );
}

/** Codes are requested only after the traveler opens these instructions. */
function ForwardingInstructions() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [copyError, setCopyError] = useState("");
  const [confirmRotation, setConfirmRotation] = useState(false);
  const mounted = useRef(true);
  const pending = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function prepare(rotate = false) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(""); setCopied("");
    if (rotate) setCode("");
    try {
      const next = await getBookingForwardingCode(rotate);
      if (mounted.current) { setCode(next); setConfirmRotation(false); }
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : "Could not prepare forwarding. Try again.");
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function copy(value: string, kind: string) {
    setCopyError("");
    try { await navigator.clipboard.writeText(value); if (mounted.current) setCopied(kind); }
    catch { if (mounted.current) setCopyError("Copy is unavailable. Select the address or code and copy it manually."); }
  }
  return <details className="booking-forwarding" onToggle={event => {
    if (event.currentTarget.open && !code && !pending.current) void prepare();
  }}>
    <summary>How to forward a booking</summary>
    <ol>
      <li>Forward your confirmation email to the address below.</li>
      <li>Add your private code to the subject, keeping the original subject too.</li>
      <li>Return here to review the booking and add it to a trip.</li>
    </ol>
    <div className="card booking-inbox">
      <Mail size={20} aria-hidden="true" />
      <div><strong>Forwarding address</strong><p className="booking-address">{bookingsInboxAddress}</p></div>
      <Button variant="outline" onClick={() => void copy(bookingsInboxAddress, "address")} aria-label="Copy forwarding address"><Copy size={16}/>{copied === "address" ? "Copied" : "Copy address"}</Button>
    </div>
    {busy && <p role="status">{confirmRotation ? "Replacing your code…" : "Preparing your code…"}</p>}
    {code && <>
      <div className="card booking-inbox">
        <div><strong>Private subject code</strong><p className="booking-address" style={{overflowWrap:"anywhere"}}>{code}</p></div>
        <Button variant="outline" disabled={busy} onClick={() => void copy(code, "code")} aria-label="Copy subject code"><Copy size={16}/>{copied === "code" ? "Copied" : "Copy code"}</Button>
      </div>
      <p className="muted">You can forward from any email address. Keep this code private: anyone with it can send bookings to your account.</p>
      <Button variant="text" disabled={busy} onClick={() => { setError(""); setConfirmRotation(true); }}>Replace forwarding code</Button>
    </>}
    {!confirmRotation && error && <div role="alert"><p>{error}</p><Button variant="outline" disabled={busy} onClick={() => void prepare()}>Retry forwarding setup</Button></div>}
    {copyError && <p role="status">{copyError}</p>}
    {confirmRotation && <Modal title="Replace your forwarding code?" onClose={() => { if (!busy) setConfirmRotation(false); }}>
      <p>Your old code will stop working. Update any saved forwarding rules and resend emails that have not arrived. Existing bookings stay in your account.</p>
      <ErrorBox text={error}/>
      <div className="form-actions"><Button variant="outline" disabled={busy} onClick={() => setConfirmRotation(false)}>Keep current code</Button><Button disabled={busy} onClick={() => void prepare(true)}>{busy ? "Replacing…" : "Replace code"}</Button></div>
    </Modal>}
  </details>;
}
