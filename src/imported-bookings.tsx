import React, { useEffect, useState } from "react";
import { Bed, Calendar, Car, Copy, Mail, MapPin, Plane, Ticket, Train, Trash2, Utensils } from "lucide-react";
import { Button, ErrorBox } from "./ui";
import {
  bookingsInboxAddress,
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
  const [items, setItems] = useState<ForwardedBooking[] | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    loadForwardedBookings().then(
      (rows) => live && setItems(rows),
      () => live && setError("We could not load your forwarded bookings. Try again in a moment."),
    );
    return () => {
      live = false;
    };
  }, []);

  async function remove(id: string) {
    setError("");
    try {
      await removeForwardedBooking(id);
      setItems((current) => current && current.filter((b) => b.bookingId !== id));
    } catch {
      setError("We could not remove that booking. Try again.");
    }
  }

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(bookingsInboxAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the address is still shown on screen.
    }
  }

  return (
    <section aria-labelledby="forwarded-bookings-title">
      <div className="section-title">
        <div>
          <h2 id="forwarded-bookings-title">Forwarded bookings</h2>
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
      <ErrorBox text={error} />
      {items && items.length === 0 && !error && (
        <p className="muted">Nothing forwarded yet. Bookings usually appear within a minute.</p>
      )}
      {items && items.length > 0 && (
        <ul className="booking-list">
          {items.map((b) => {
            const Icon = ICONS[b.kind];
            const dates = dateRange(b);
            return (
              <li className="card booking-item" key={b.bookingId}>
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
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Remove ${b.title}`}
                  onClick={() => remove(b.bookingId)}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
