import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useApp } from "./state";
import { Button, Empty, Field, PageHead, Photo } from "./ui";
import { PREPLANNED_TRIPS } from "./preplanned-trips";
import "./preplanned-trips-page.css";

export function PreplannedTripsPage() {
  const { open, s, accountTrips } = useApp();
  const page = useRef<HTMLDivElement>(null);
  const filterKey = `trip-planner-catalog-filters:${accountTrips ? "account" : "sample"}:${s.userId || "guest"}`;
  const readFilters = () => {
    try {
      const value = JSON.parse(sessionStorage.getItem(filterKey) || "{}");
      return { key: filterKey, search: typeof value.search === "string" ? value.search : "",
        duration: ["all", ...PREPLANNED_TRIPS.map(trip => String(trip.days))].includes(value.duration) ? value.duration as string : "all",
        budget: ["all", "750", "1000", "1500"].includes(value.budget) ? value.budget as string : "all" };
    } catch { return { key: filterKey, search: "", duration: "all", budget: "all" }; }
  };
  const [storedFilters, setStoredFilters] = useState(readFilters);
  // Read the new person's settings immediately; never carry one account's search across a switch.
  const { search, duration, budget } = storedFilters.key === filterKey ? storedFilters : readFilters();
  const changeFilters = (next: { search: string; duration: string; budget: string }) => {
    setStoredFilters({ key: filterKey, ...next });
    try { sessionStorage.setItem(filterKey, JSON.stringify(next)); } catch { /* Search remains usable if storage is unavailable. */ }
  };
  const searchInput = useRef<HTMLInputElement>(null);
  const trips = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    return PREPLANNED_TRIPS.filter(trip =>
      (!needle || `${trip.title} ${trip.destinations.join(" ")} ${trip.summary}`.toLocaleLowerCase().includes(needle)) &&
      (duration === "all" || trip.days === Number(duration)) &&
      (budget === "all" || trip.estimate <= Number(budget)));
  }, [search, duration, budget]);
  const clearFilters = () => { changeFilters({search:"",duration:"all",budget:"all"}); searchInput.current?.focus(); };
  useEffect(() => {
    const heading = page.current?.querySelector("h1");
    if (heading) { heading.setAttribute("tabindex", "-1"); heading.focus({ preventScroll: true }); }
  }, []);
  return <div className="preplanned-page" ref={page}>
    <PageHead title="Pre-planned trips" description="Choose a starter itinerary, review its stops, then make it your own." />
    <div className="preplanned-filters">
    <Field label="Search trips"><span className="preplanned-search"><Search size={18} aria-hidden="true"/><input ref={searchInput} type="search" value={search} onChange={event => changeFilters({search:event.target.value,duration,budget})} placeholder="Search city or trip style" /></span></Field>
    <Field label="Trip length"><select value={duration} onChange={event => changeFilters({search,duration:event.target.value,budget})}><option value="all">Any length</option>{[...new Set(PREPLANNED_TRIPS.map(trip => trip.days))].sort((a,b) => a-b).map(days => <option key={days} value={days}>{days} days</option>)}</select></Field>
    <Field label="Estimated budget per person"><select value={budget} onChange={event => changeFilters({search,duration,budget:event.target.value})}><option value="all">Any budget</option><option value="750">Up to $750</option><option value="1000">Up to $1,000</option><option value="1500">Up to $1,500</option></select></Field>
    </div>
    <p className="preplanned-count" role="status">{trips.length} {trips.length === 1 ? "trip" : "trips"}</p>
    {!trips.length && <Empty title="No trips match your filters" body="Try another city, a longer trip, or a higher budget." action={<Button variant="outline" onClick={clearFilters}>Clear filters</Button>} />}
    <div className="preplanned-grid">{trips.map(trip => <article className="preplanned-result" key={trip.id}>
      <Photo src={trip.image} alt={`${trip.destinations[0]} scenery`} className="preplanned-photo" />
      <div className="preplanned-result-copy"><span className="eyebrow">{trip.destinations.join(" · ")}</span><h2 id={`template-${trip.id}`}>{trip.title}</h2><p>{trip.summary}</p>
        <p className="preplanned-cost"><strong>${trip.estimate}</strong> estimated per person · {trip.days} days</p>
        <Button variant="outline" aria-describedby={`template-${trip.id}`} onClick={() => open("plannedTrip", { id: trip.id })}>View itinerary</Button>
      </div>
    </article>)}</div>
  </div>;
}
