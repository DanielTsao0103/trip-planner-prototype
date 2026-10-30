import { getSupabase } from "./supabase";

export type BookingKind = "flight" | "lodging" | "rental_car" | "train" | "restaurant" | "event" | "other";

export type ForwardedBooking = {
  bookingId: string;
  kind: BookingKind;
  title: string;
  startDate: string | null;
  endDate: string | null;
  location: string | null;
  confirmationCode: string | null;
  sender: string;
  receivedAt: string;
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
    .select("booking_id,kind,title,start_date,end_date,location,confirmation_code,sender,received_at")
    .order("received_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data as Row[]).map((r) => ({
    bookingId: r.booking_id,
    kind: r.kind,
    title: r.title,
    startDate: r.start_date,
    endDate: r.end_date,
    location: r.location,
    confirmationCode: r.confirmation_code,
    sender: r.sender,
    receivedAt: r.received_at,
  }));
}

export async function removeForwardedBooking(bookingId: string): Promise<void> {
  const { error } = await getSupabase().from("forwarded_booking").delete().eq("booking_id", bookingId);
  if (error) throw new Error(error.message);
}
