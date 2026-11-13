// Pure booking types and helpers. Kept free of browser and Supabase imports so Node tests can load it.

export type BookingKind = "flight" | "lodging" | "rental_car" | "train" | "restaurant" | "event" | "other";

export type ForwardedBooking = {
  bookingId: string;
  kind: BookingKind;
  title: string;
  startDate: string | null;
  /** 24 hour HH:MM when the email stated a time. */
  startTime: string | null;
  endDate: string | null;
  location: string | null;
  confirmationCode: string | null;
  sender: string;
  receivedAt: string;
  /** The trip it was sorted into, or null while it is still waiting in Forwarded bookings. */
  tripId: string | null;
};

export const KIND_LABELS: Record<BookingKind, string> = {
  flight: "Flight",
  lodging: "Stay",
  rental_car: "Rental car",
  train: "Train",
  restaurant: "Restaurant",
  event: "Event",
  other: "Booking",
};

const NOTES_LIMIT = 2200;

/**
 * Starting values for the event form. The form stays the one place that decides whether the event is
 * valid, so a booking with missing times or a date outside the trip is completed by the person, not guessed.
 */
export function bookingEventParams(
  booking: Pick<ForwardedBooking, "bookingId" | "kind" | "title" | "startDate" | "startTime" | "location" | "confirmationCode">,
  trip: { start: string; end: string },
): Record<string, string> {
  const inside = booking.startDate && booking.startDate >= trip.start && booking.startDate <= trip.end;
  const notes = [
    `${KIND_LABELS[booking.kind]} from a forwarded confirmation email.`,
    booking.confirmationCode ? `Confirmation: ${booking.confirmationCode}` : "",
  ].filter(Boolean).join("\n").slice(0, NOTES_LIMIT);
  return {
    suggestion: booking.title.slice(0, 100),
    date: inside ? (booking.startDate as string) : trip.start,
    notes,
    booking: booking.bookingId,
    ...(booking.location ? { place: booking.location } : {}),
    ...(booking.startTime ? { start: booking.startTime, end: addMinutes(booking.startTime, 60) } : {}),
  };
}

/** HH:MM plus minutes, held at 23:59 so an evening booking never rolls into the next day. */
function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** The one trip whose dates contain the booking's date, if exactly one does. Used to preselect the picker. */
export function tripForBooking(
  booking: Pick<ForwardedBooking, "startDate">,
  trips: { id: string; start: string; end: string }[],
): string | null {
  if (!booking.startDate) return null;
  const fits = trips.filter((t) => booking.startDate! >= t.start && booking.startDate! <= t.end);
  return fits.length === 1 ? fits[0].id : null;
}
