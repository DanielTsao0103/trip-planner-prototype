import { searchRequest } from "./search-request";
import type { GoogleSearchSession } from "./google-location-search";
import { TEXT_LIMITS } from "./limits.ts";
import { useEffect, useId, useRef, useState } from "react";
import { MapPin, Plus } from "lucide-react";

import { loadIndex, searchIndex, searchWorldwide, mergePlaces, type Destination } from "./destination-search";
const cache = new Map<string, Destination[]>();

export function DestinationInput({ value, onChange, onAdd }: {
  value: string; onChange: (value: string) => void; onAdd: (destination?: string) => void;
}) {
  const id = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const session = useRef<GoogleSearchSession>({});
  const selectedLabel = useRef<string | null>(null);
  const [source,setSource] = useState<'standard'|'google'>('standard');
  const [attempt,setAttempt] = useState(0);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const query = value.trim().toLowerCase();
  useEffect(() => {
    if (active >= 0) listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const [matches, setMatches] = useState<Destination[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "offline">("ready");
  useEffect(() => {
    setActive(-1); selectedLabel.current=null; setMatches([]); setSource('standard');
    if (!open || query.length < 2) { setStatus("ready"); return; }
    let cancelled = false;
    const controller = new AbortController();
    setStatus("loading");
    const timer = setTimeout(async () => {
      const cached = cache.get(query);
      if (cached) { setMatches(cached); setStatus("ready"); return; }
      let local: Destination[] = [];
      let regionMatch = false;
      try {
        const index = await searchRequest(() => loadIndex(), controller.signal, 1500);
        const found = searchIndex(index, query);
        local = found.places; regionMatch = found.regionMatch;
        if (cancelled) return;
        setMatches(local);
      } catch { /* Live search can still work if the bundled index is unavailable. */ }
      if (cancelled) return;
      let result = local;
      let offline = false;
      if (!regionMatch) {
        try { result = mergePlaces(local, await searchRequest(child => searchWorldwide(query, child), controller.signal, 2000)); }
        catch { offline = true; }

      }
      if (cancelled) return;
      let google = false;
      if (!result.length) {
        try {
          const { searchGoogleLocations } = await import('./google-location-search');
          const response = await searchGoogleLocations(query,controller.signal,session.current,null,true);
          result = response.places.map(place=>({name:place.name,detail:place.address || 'Place',label:place.label,
            kind:'Place' as const,aliases:'',population:0,region:'',country:'',finishSelection:place.finishSelection}));
          google = true; offline = false;
        } catch { /* Keep manual entry when both live services are unavailable. */ }
      }
      if (cancelled) return;
      // Late enrichment must not move the option a traveler is navigating to.
      if (selectedLabel.current) result=[...local,...result.filter(place=>!local.some(item=>item.label===place.label))].slice(0,8);
      setMatches(result); setActive(selectedLabel.current ? result.findIndex(place=>place.label===selectedLabel.current) : -1);
      setSource(google?'google':'standard');setStatus(offline ? "offline" : "ready");
      if (!offline && !google && result.length) {
        if (cache.size >= 50) cache.delete(cache.keys().next().value!);
        cache.set(query, result);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, [query, open, attempt]);
  useEffect(()=>{if(!open)session.current.token=undefined;},[open]);
  const tooLong = value.length > TEXT_LIMITS.destination;
  const visible = open && query.length > 0;
  function choose(index: number) {
    const p = matches[index];
    if (!p) return;
    p.finishSelection?.();
    onChange(p.label);
    onAdd(p.label);
    setOpen(false); setActive(-1);
  }
  return <div className="destination-search" onBlur={e => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
  }}>
    <div className="input-action field-popup-anchor">
      <input maxLength={TEXT_LIMITS.destination} value={value} aria-label="Where are you going?" role="combobox"
        aria-describedby={tooLong ? `${id}-length-error` : undefined} aria-invalid={tooLong || undefined}
        aria-autocomplete="list" aria-expanded={visible} aria-controls={id}
        aria-activedescendant={visible && active >= 0 ? `${id}-${active}` : undefined}
        autoComplete="off" placeholder="A city, a region, somewhere new…"
        onFocus={() => setOpen(true)}
        onChange={e => { onChange(e.target.value); setOpen(true); setActive(-1); }}
        onKeyDown={e => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault(); setOpen(true);
            const next = !matches.length ? -1 : active < 0 ? (e.key === "ArrowDown" ? 0 : matches.length-1) : (active+(e.key === "ArrowDown"?1:-1)+matches.length)%matches.length;
            selectedLabel.current=matches[next]?.label??null;setActive(next);
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (visible && active >= 0) choose(active); else { onAdd(); setOpen(false); }
          } else if (e.key === "Tab") { setOpen(false); } else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
        }} />
      <button type="button" className="btn btn-outline" disabled={!query}
        onClick={() => { onAdd(); setOpen(false); }}>Add</button>
      {visible && <div className="field-popup destination-menu">
        <div className="destination-caption">{query.length < 2 ? "SEARCH WORLDWIDE" : matches.length ? "SUGGESTED PLACES" : status === "loading" ? "SEARCHING WORLDWIDE…" : status === "offline" ? "SEARCH TEMPORARILY UNAVAILABLE" : "NO MATCHING PLACES"}</div>
        <div ref={listRef} id={id} role="listbox" aria-label="Destination suggestions">
          {matches.map((p, i) => <div key={p.label} role="option" id={`${id}-${i}`}
            aria-selected={active === i} className={`destination-option ${active === i ? "active" : ""}`}
            onPointerDown={e => e.preventDefault()} onMouseDown={e => e.preventDefault()} onMouseEnter={() => {selectedLabel.current=p.label;setActive(i);}} onClick={() => choose(i)}>
            <span className="destination-icon"><MapPin size={18} /></span>
            <span className="destination-name"><strong>{p.name}</strong><small>{p.detail}</small></span>
            <span className="destination-kind">{p.kind}</span><Plus size={15}/>
          </div>)}
        </div>
        <div className="destination-foot" role="status" aria-live="polite">
          {query.length < 2 ? "Type at least 2 characters to find a city, region or country." : status === "offline" ? "Live search unavailable. You can still add a destination manually." : matches.length ? "↑ ↓ to explore · Enter to add" : status === "loading" ? "Finding places…" : "Try another spelling, or add this destination using Add."}
        </div>
        {status==='offline' && <button type="button" className="btn btn-outline" onClick={()=>setAttempt(value=>value+1)}>Retry destination search</button>}
        {source==='google' ? <div className="destination-attribution google-search-attribution" translate="no">Google Maps</div> : <div className="destination-attribution">Places by <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></div>}
      </div>}
    </div>
    {tooLong && <small id={`${id}-length-error`}>Shorten this destination to {TEXT_LIMITS.destination} characters or fewer.</small>}
  </div>;
}
