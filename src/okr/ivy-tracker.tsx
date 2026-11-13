import { OkrTrackerShell } from "./okr-shell";

/** Ivy's OKR tracker. Build it here and pass it to the shell as children; no other file needs to change. */
export function IvyOkrTracker() {
  return <OkrTrackerShell owner="Ivy" />;
}
