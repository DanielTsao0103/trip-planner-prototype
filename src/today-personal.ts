import type { RouteLocation, TravelMode } from "./today-guide.ts";

export type TodayChoices = { mode: TravelMode; overrides: Record<string, TravelMode>; returnPlace?: RouteLocation };
export const defaultTodayChoices = (): TodayChoices => ({ mode: "WALK", overrides: {} });
export const isTravelMode = (value: unknown): value is TravelMode => ["WALK", "TRANSIT", "DRIVE"].includes(value as string);
export const todayChoicesKey = (user: string | null, trip: string, account: boolean) => `trip-today-personal-v1:${account ? "account" : "demo"}:${user || "anonymous"}:${trip}`;

/** Browser storage is untrusted and personal settings must never enter the shared trip payload. */
export function parseTodayChoices(raw: string | null): TodayChoices {
  const result = defaultTodayChoices();
  try {
    const value = JSON.parse(raw || "null");
    if (!value || typeof value !== "object") return result;
    if (isTravelMode(value.mode)) result.mode = value.mode;
    if (value.overrides && typeof value.overrides === "object") {
      for (const [key, mode] of Object.entries(value.overrides).slice(-200)) if (isTravelMode(mode)) result.overrides[key] = mode;
    }
    const place = value.returnPlace;
    if (place && typeof place.label === "string" && place.label.trim() && place.label.length <= 2048) {
      const point = place.point;
      result.returnPlace = { label: place.label, place: typeof place.place === "string" ? place.place.slice(0, 2048) : place.label,
        ...(typeof place.googlePlaceId === "string" && place.googlePlaceId.length < 512 ? { googlePlaceId: place.googlePlaceId } : {}),
        ...(point && Number.isFinite(point.lat) && Math.abs(point.lat) <= 90 && Number.isFinite(point.lng) && Math.abs(point.lng) <= 180 ? { point: { lat: point.lat, lng: point.lng } } : {}) };
    }
  } catch { /* A malformed personal preference must not prevent the itinerary from opening. */ }
  return result;
}

/** Link saved notes without ever treating user content as HTML or executing a URL scheme. */
export function noteParts(notes: string): { text: string; href?: string }[] {
  return notes.split(/(https?:\/\/[^\s<>]+)/g).filter(Boolean).map(text => {
    if (!/^https?:\/\//.test(text)) return { text };
    const href = text.replace(/[.,;!?)}\]]+$/, "");
    try { const url = new URL(href); if (url.protocol === "http:" || url.protocol === "https:") return { text, href }; } catch { /* Keep invalid links as plain text. */ }
    return { text };
  });
}
