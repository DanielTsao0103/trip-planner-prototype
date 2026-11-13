import React, { useEffect, useRef, useState } from "react";
import { Bed, Calendar, Car, Copy, Mail, MapPin, Plane, Ticket, Train, Trash2, Utensils } from "lucide-react";
import { Button, ErrorBox, Modal } from "./ui";
import { useApp } from "./state";
import { canEdit } from "./domain";
import {
  bookingEventParams,
  bookingsInboxAddress,
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
  const [copied, setCopied] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [removing, setRemoving] = useState<string | null>(null);
  const [copyError, setCopyError] = useState("");
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
    setLoadError("");
    loadForwardedBookings().then(
      (rows) => live && setItems(rows),
      () => live && setLoadError("We could not load your forwarded bookings right now."),
    );
    return () => {
      live = false;
    };
  }, [loadAttempt]);

  // Only account trips where this person may add an event on the day the form would open on.
  function tripsFor(b: ForwardedBooking) {
    return s.trips.filter(
      (t) => t.persistence === "account" && canEdit(t, s.userId, bookingEventParams(b, t).date),
    );
  }

  function review(b: ForwardedBooking) {
    const trip = s.trips.find((t) => t.id === choice[b.bookingId]);
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

  async function copyAddress() {
    setCopyError("");
    try {
      await navigator.clipboard.writeText(bookingsInboxAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError("Copy isn’t available here. Select the address above and copy it manually.");
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
      disabled={removing !== null}
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
            Forward a confirmation email from the address on your account and it shows up here.
          </p>
        </div>
      </div>
      {bookingsInboxAddress ? (
        <div className="card booking-inbox">
          <Mail size={20} aria-hidden="true" />
          <div>
            <strong>Forward confirmations to</strong>
            <p className="booking-address">{bookingsInboxAddress}</p>
          </div>
          <Button variant="outline" onClick={copyAddress} aria-label="Copy forwarding address">
            <Copy size={16} />
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      ) : (
        <p className="muted">Email forwarding is not set up for this site yet.</p>
      )}
      {copyError && <p role="status" className="fine-print">{copyError}</p>}
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
            ? "Nothing forwarded yet. Bookings usually appear within a minute."
            : "Everything forwarded so far has been added to a trip."}
        </p>
      )}
      {waiting.length > 0 && (
        <ul className="booking-list">
          {waiting.map((b) => {
            const trips = tripsFor(b);
            return (
              <li className="card booking-item" key={b.bookingId}>
                {card(b)}
                <div className="booking-sort">
                  {trips.length > 0 ? (
                    <>
                      <select
                        aria-label={`Trip for ${b.title}`}
                        value={choice[b.bookingId] ?? ""}
                        onChange={(e) => setChoice((c) => ({ ...c, [b.bookingId]: e.target.value }))}
                      >
                        <option value="">Choose a trip</option>
                        {trips.map((t) => (
                          <option key={t.id} value={t.id}>{t.title}</option>
                        ))}
                      </select>
                      <Button variant="outline" disabled={!choice[b.bookingId]} onClick={() => review(b)}>
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
      {confirmRemoval && <Modal title="Remove this booking?" onClose={() => { if (!removing) setConfirmRemoval(null); }}>
        <p><strong>{confirmRemoval.title}</strong></p>
        <p>This removes the forwarded confirmation from your list. It does not cancel your reservation. You can forward the original email again to add it back.</p>
        <ErrorBox text={error}/>
        <div className="form-actions"><Button variant="outline" disabled={!!removing} onClick={() => setConfirmRemoval(null)}>Keep booking</Button><Button variant="danger" disabled={!!removing} onClick={() => void remove(confirmRemoval.bookingId)}>{removing ? "Removing…" : "Remove booking"}</Button></div>
      </Modal>}
    </section>
  );
}
