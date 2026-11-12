import React, { useEffect, useId, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { locationQuery, locationSearchKey, resolveSearchFocus, searchMeetingPlaces, type MeetingPlace } from './event-location-search';

const cache = new Map<string, {places:MeetingPlace[];biased:boolean;approximate:boolean}>();
export function EventLocationInput({value,onChange,destinations=[]}: {value:string;onChange:(value:string,point?:MeetingPlace["point"])=>void;destinations?:string[]}) {
  const id=useId(), list=useRef<HTMLDivElement>(null), menu=useRef<HTMLDivElement>(null);
  const [open,setOpen]=useState(false), [active,setActive]=useState(-1);
  const [results,setResults]=useState<MeetingPlace[]>([]);
  const [status,setStatus]=useState<'loading'|'ready'|'error'>('ready');
  const [near,setNear]=useState<string|null>(null);
  const stops=[...new Set(destinations.filter(Boolean))];
  const destination=near===''?'':near && stops.includes(near)?near:stops[0]||'';
  const [biased,setBiased]=useState(false),[approximate,setApproximate]=useState(false);
  const query=locationQuery(value);
  useEffect(()=>{
    setResults([]);setActive(-1);
    if(!open || query.length<2){setStatus('ready');return;}
    let cancelled=false;
    const controller=new AbortController();
    setStatus('loading');
    const timer=setTimeout(async()=>{
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const key=locationSearchKey(query,destination);
        let matches=cache.get(key);
        if(!matches){
          timeout=setTimeout(()=>controller.abort(),12000);
          let focus=null;
          try{focus=await resolveSearchFocus(destination,controller.signal);}catch{if(controller.signal.aborted)throw new Error('Search cancelled');}
          const places=await searchMeetingPlaces(query,controller.signal,focus);
          matches={places,biased:!!focus,approximate:focus?.approximate||false};
          if(cancelled)return;
          if(cache.size>=50)cache.delete(cache.keys().next().value!);
          cache.set(key,matches);
        }
        if(!cancelled){setResults(matches.places);setBiased(matches.biased);setApproximate(matches.approximate);setStatus('ready');}
      }catch{if(!cancelled)setStatus('error');}
      finally{if(timeout)clearTimeout(timeout);}
    },350);
    return()=>{cancelled=true;clearTimeout(timer);controller.abort();};
  },[query,open,destination]);
  useEffect(()=>{if(active>=0)list.current?.children[active]?.scrollIntoView({block:'nearest'});},[active]);
  function select(index:number){const result=results[index];if(result){onChange(result.label,result.point);setOpen(false);setActive(-1);}}
  const expanded=open && query.length>=2;
  useEffect(() => {
    if (!expanded) return;
    const frame = requestAnimationFrame(() => {
      const popup = menu.current;
      const actions = popup?.closest('form')?.querySelector<HTMLElement>('[data-fixed-actions]');
      if (!popup || !actions || getComputedStyle(actions).position !== 'fixed') return;
      const excess = popup.getBoundingClientRect().bottom - actions.getBoundingClientRect().top + 8;
      if (excess > 0) window.scrollBy({top: excess, behavior: 'instant'});
    });
    return () => cancelAnimationFrame(frame);
  }, [expanded, status, results]);
  return <div className="field event-location-field">
    <div className="event-location-heading">
    <label htmlFor={`${id}-input`}>Where</label>
    {stops.length > 1 && <div className="event-location-bias">
      <label htmlFor={`${id}-near`}>Near</label>
      <select id={`${id}-near`} aria-label="Prioritize locations near" value={destination} onChange={e=>{setNear(e.target.value);setActive(-1);setResults([]);setOpen(true);}}>
        {stops.map(stop=><option key={stop} value={stop}>{stop}</option>)}
        <option value="">Worldwide (no preference)</option>
      </select>
    </div>}
    </div>
    <div className="field-popup-anchor" onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setOpen(false);}}>
    <input id={`${id}-input`} required value={value} role="combobox" aria-label="Where"
      aria-autocomplete="list" aria-expanded={expanded} aria-controls={`${id}-list`}
      aria-activedescendant={expanded && active>=0 ? `${id}-${active}` : undefined}
      autoComplete="off" placeholder="Search a place, address, or meeting point"
      onFocus={()=>setOpen(true)} onChange={e=>{onChange(e.target.value);setOpen(true);setActive(-1);setResults([]);}}
      onKeyDown={e=>{
        if(e.nativeEvent.isComposing)return;
        if(e.key==='ArrowDown'||e.key==='ArrowUp'){
          e.preventDefault();setOpen(true);
          setActive(i=>!results.length?-1:i<0?(e.key==='ArrowDown'?0:results.length-1):(i+(e.key==='ArrowDown'?1:-1)+results.length)%results.length);
        }else if(e.key==='Enter' && expanded){e.preventDefault();if(active>=0)select(active);else setOpen(false);}
        else if(e.key==='Escape' && expanded){e.preventDefault();setOpen(false);}
      }}/>
    {expanded && <div ref={menu} className="field-popup event-location-menu">
      <div className="event-location-caption">{status==='loading'?'Searching worldwide…':status==='error'?'Search unavailable':results.length?(destination && biased?`Near ${destination}${approximate?' (approximate area)':''}`:'Suggested locations'):'No locations found'}</div>
      <div ref={list} id={`${id}-list`} role="listbox" aria-label="Location suggestions">
        {results.map((place,i)=><div key={place.id} role="option" id={`${id}-${i}`} aria-selected={i===active}
          className={`event-location-option ${i===active?'active':''}`} onMouseDown={e=>e.preventDefault()}
          onMouseEnter={()=>setActive(i)} onClick={()=>select(i)}>
          <MapPin size={17} aria-hidden="true"/><span><strong>{place.name}</strong>{place.address && <small>{place.address}</small>}</span>
        </div>)}
      </div>
      <div className="event-location-footer" role="status" aria-live="polite">
        {status==='loading'?'Finding places…':status==='error'?'You can still type a location and save it.':results.length?(destination && !biased?'Destination lookup unavailable; showing worldwide matches.':'↑ ↓ to navigate · Enter to select'):'Try another spelling, or enter the location manually.'}
      </div>
      <div className="event-location-source">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> · Photon</div>
    </div>}
  </div></div>;
}
