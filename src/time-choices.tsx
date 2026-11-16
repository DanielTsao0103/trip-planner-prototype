import { useState } from "react";
import type { Event } from "./domain";
import { Button } from "./ui";
import { eventInterval, eventTimestamp, eventTimeRange, timeText } from "./domain";
import { planningTime, planningWindows, timeMinutes } from "./planning-availability";

/** Keep schedule context alongside the editable times, especially on a phone. */
export function TimeChoices({ events, date, excludeId, start, end, onChoose }: {
  events: Event[]; date: string; excludeId?: string; start: string; end: string;
  onChoose: (start: string, end: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const duration = timeMinutes(end) - timeMinutes(start);
  const conflicts = events.filter(event => event.id !== excludeId && eventTimestamp(date,start) < eventInterval(event).end && eventTimestamp(date,end) > eventInterval(event).start);
  const windows = planningWindows(events, date, excludeId).filter(window => timeMinutes(window.end) - timeMinutes(window.start) >= (duration > 0 ? duration : 60));
  return <section className="time-choices" aria-label="Schedule guidance">
    {duration > 0 && conflicts.length > 0 && <p role="status">Overlaps {conflicts.map(event => `${event.name} (${eventTimeRange(event)})`).join(", ")}.</p>}
    <button type="button" className="text-link" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Hide available times" : "Find an available time"}</button>
    {expanded && <div><p className="fine-print">Open time between 9 AM and 6 PM. Travel time is not included.{duration > 0 ? ` Each choice keeps your ${duration}-minute duration.` : " Choose a one-hour starting point."}</p>
      <div className="time-choice-buttons">{windows.map(window => <Button variant="outline small" key={window.start} onClick={() => onChoose(window.start, planningTime(timeMinutes(window.start) + (duration > 0 ? duration : 60)))}>
        {timeText(window.start)}–{timeText(planningTime(timeMinutes(window.start) + (duration > 0 ? duration : 60)))}
      </Button>)}</div>{!windows.length && <p>No opening fits this duration in the daytime window. Try another day or edit the times.</p>}</div>}
  </section>;
}
