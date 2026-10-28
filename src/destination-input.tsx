import { useEffect, useId, useRef, useState } from "react";
import { MapPin, ArrowUpLeft } from "lucide-react";

import { loadIndex, searchIndex, searchWorldwide, mergePlaces, type Destination } from "./destination-search";
const cache = new Map<string, Destination[]>();

export function DestinationInput({ value, onChange, onAdd }: {
  value: string; onChange: (value: string) => void; onAdd: () => void;
}) {
  const id = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const query = value.trim().toLowerCase();
  useEffect(() => {
    if (active >= 0) listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);
  const [matches, setMatches] = useState<Destination[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "offline">("ready");
  useEffect(() => {
    setActive(-1); setMatches([]);
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
        const index = await loadIndex();
        const found = searchIndex(index, query);
        local = found.places; regionMatch = found.regionMatch;
        if (cancelled) return;
        setMatches(local);
      } catch { /* Live search can still work if the bundled index is unavailable. */ }
      if (cancelled) return;
      let result = local;
      let offline = false;
      if (!regionMatch) {
        const timeout = setTimeout(() => controller.abort(), 6000);
        try { result = mergePlaces(local, await searchWorldwide(query, controller.signal)); }
        catch { offline = true; }
        finally { clearTimeout(timeout); }
      }
      if (cancelled) return;
      setMatches(result); setActive(-1); setStatus(offline ? "offline" : "ready");
      if (!offline) {
        if (cache.size >= 50) cache.delete(cache.keys().next().value!);
        cache.set(query, result);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); controller.abort(); };
  }, [query, open]);
  const visible = open && query.length > 0;
  function choose(index: number) {
    const p = matches[index];
    if (!p) return;
    onChange(p.label);
    setOpen(false); setActive(-1);
  }
  return <div className="destination-search" onBlur={e => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
  }}>
    <div className="input-action">
      <input value={value} aria-label="Where are you going?" role="combobox"
        aria-autocomplete="list" aria-expanded={visible} aria-controls={id}
        aria-activedescendant={visible && active >= 0 ? `${id}-${active}` : undefined}
        autoComplete="off" placeholder="A city, a region, somewhere new…"
        onFocus={() => setOpen(true)}
        onChange={e => { onChange(e.target.value); setOpen(true); setActive(-1); }}
        onKeyDown={e => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault(); setOpen(true);
            setActive(i => !matches.length ? -1 : i < 0 ? (e.key === "ArrowDown" ? 0 : matches.length - 1) : (i + (e.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (visible && active >= 0) choose(active); else { onAdd(); setOpen(false); }
          } else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
        }} />
      <button type="button" className="btn btn-outline" disabled={!query}
        onClick={() => { onAdd(); setOpen(false); }}>Add</button>
    </div>
    {visible && <div className="destination-menu">
      <div className="destination-caption">{query.length < 2 ? "SEARCH WORLDWIDE" : matches.length ? "SUGGESTED PLACES" : status === "loading" ? "SEARCHING WORLDWIDE…" : status === "offline" ? "SEARCH TEMPORARILY UNAVAILABLE" : "NO MATCHING PLACES"}</div>
      <div ref={listRef} id={id} role="listbox" aria-label="Destination suggestions">
        {matches.map((p, i) => <div key={p.label} role="option" id={`${id}-${i}`}
          aria-selected={active === i} className={`destination-option ${active === i ? "active" : ""}`}
          onMouseDown={e => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => choose(i)}>
          <span className="destination-icon"><MapPin size={18} /></span>
          <span className="destination-name"><strong>{p.name}</strong><small>{p.detail}</small></span>
          <span className="destination-kind">{p.kind}</span><ArrowUpLeft size={15}/>
        </div>)}
      </div>
      <div className="destination-foot" role="status" aria-live="polite">
        {query.length < 2 ? "Type at least 2 characters to find a city, region or country." : status === "offline" ? "Live search unavailable. You can still add a destination manually." : matches.length ? "↑ ↓ to explore · Enter to select" : status === "loading" ? "Finding places…" : "Try another spelling, or add this destination using Add."}
      </div>
      <div className="destination-attribution">Places by <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">GeoNames</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></div>
    </div>}
  </div>;
}
