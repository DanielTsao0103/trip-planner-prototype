import { getSupabase } from "./supabase";
import type { BookingKind, ForwardedBooking } from "./booking-event.ts";
export { KIND_LABELS, bookingEventParams, tripForBooking, type BookingKind, type ForwardedBooking } from "./booking-event.ts";


/** The address people forward confirmations to. Empty until the inbox is set up. */
export const bookingsInboxAddress: string = (import.meta.env.VITE_BOOKINGS_INBOX_ADDRESS ?? "").trim();

type Row = {
  booking_id: string;
  kind: BookingKind;
  title: string;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  confirmation_code: string | null;
  sender: string;
  received_at: string;
  trip_id: string | null;
  details: { startTime?: unknown } | null;
};

/** Formats a stored YYYY-MM-DD without time zone shifting. */
export function formatBookingDate(value: string | null): string {
  const m = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!m) return "";
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Row-level security limits this to the signed-in account's own bookings. */
export async function loadForwardedBookings(): Promise<ForwardedBooking[]> {
  const { data, error } = await getSupabase()
    .from("forwarded_booking")
    .select("booking_id,kind,title,start_date,end_date,location,confirmation_code,sender,received_at,trip_id,details")
    .order("received_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? (data as Row[]) : []).map((r) => ({
    bookingId: r.booking_id,
    kind: r.kind,
    title: r.title,
    startDate: r.start_date,
    endDate: r.end_date,
    location: r.location,
    confirmationCode: r.confirmation_code,
    sender: r.sender,
    receivedAt: r.received_at,
    tripId: r.trip_id,
    startTime: typeof r.details?.startTime === "string" && /^\d{2}:\d{2}$/.test(r.details.startTime) ? r.details.startTime : null,
  }));
}

export async function removeForwardedBooking(bookingId: string): Promise<void> {
  const { error } = await getSupabase().from("forwarded_booking").delete().eq("booking_id", bookingId);
  if (error) throw new Error(error.message);
}

/** Remember which trip a booking was sorted into. Pass null to put it back in the waiting list. */
export async function setBookingTrip(bookingId: string, tripId: string | null): Promise<void> {
  const { error } = await getSupabase()
    .from("forwarded_booking")
    .update({ trip_id: tripId, added_at: tripId ? new Date().toISOString() : null })
    .eq("booking_id", bookingId);
  if (error) throw new Error(error.message);
}
