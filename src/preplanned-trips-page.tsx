import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useApp } from "./state";
import { Button, Field, PageHead, Photo } from "./ui";
import { PREPLANNED_TRIPS } from "./preplanned-trips";
import "./preplanned-trips-page.css";

export function PreplannedTripsPage() {
  const { open } = useApp();
  const page = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const trips = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return PREPLANNED_TRIPS.filter(trip => !needle || `${trip.title} ${trip.destinations.join(" ")} ${trip.summary}`.toLocaleLowerCase().includes(needle));
  }, [search]);
  useEffect(() => {
    const heading = page.current?.querySelector("h1");
    if (heading) { heading.setAttribute("tabindex", "-1"); heading.focus({ preventScroll: true }); }
  }, []);
  return <div className="preplanned-page" ref={page}>
    <PageHead title="Pre-planned trips" description={`${PREPLANNED_TRIPS.length} starter itineraries. Choose one to review its stops, then add it to your trips.`} />
    <Field label="Search trips"><span className="preplanned-search"><Search size={18} aria-hidden="true"/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search city or trip style" /></span></Field>
    <p className="preplanned-count" role="status">{trips.length} trips</p>
    <div className="preplanned-grid">{trips.map(trip => <article className="preplanned-result" key={trip.id}>
      <Photo src={trip.image} alt={`${trip.destinations[0]} scenery`} className="preplanned-photo" />
      <div className="preplanned-result-copy"><span className="eyebrow">{trip.destinations.join(" · ")}</span><h2>{trip.title}</h2><p>{trip.summary}</p>
        <p className="preplanned-cost"><strong>${trip.estimate}</strong> per person · {trip.days} days</p>
        <Button variant="outline" onClick={() => open("plannedTrip", { id: trip.id })}>View itinerary</Button>
      </div>
    </article>)}</div>
  </div>;
}
