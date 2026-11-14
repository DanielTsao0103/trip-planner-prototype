import { useState } from "react";
import { Copy, ArrowUpRight } from "lucide-react";
import { Button } from "./ui";
import { type Event, type Trip } from "./domain";
import { noteParts } from "./today-personal";

/** Reuse saved event content; notes may contain tickets or instructions, but we never invent them. */
export function StopEssentials({ event, trip }: { event: Event; trip: Trip }) {
  const [copyStatus, setCopyStatus] = useState("");
  const companions = trip.members.filter(member => member.status === "accepted" && event.attendees.includes(member.id));
  return <div className="today-essentials">
    {event.notes.trim() && <details className="today-event-notes" open={event.notes.length <= 400}><summary>Before you arrive</summary><div className="today-saved-notes">{noteParts(event.notes).map((part, index) => part.href ? <a key={index} href={part.href} target="_blank" rel="noreferrer">{part.text}<ArrowUpRight size={13} aria-label="opens a new tab" /></a> : part.text)}</div></details>}
    {companions.length > 0 && <p className="today-companions">With {companions.map(member => member.name).join(", ")}</p>}
    {event.place.trim() && <details className="today-address"><summary>Show address</summary><p className="today-large-address">{event.place}</p><Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(event.place); setCopyStatus("Address copied."); } catch { setCopyStatus("Couldn't copy. You can select the address above."); } }}><Copy size={16} />Copy address</Button><p role="status">{copyStatus}</p></details>}
  </div>;
}
