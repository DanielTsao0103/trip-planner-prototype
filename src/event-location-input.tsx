import React, { useEffect, useMemo, useId, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { locationQuery, locationSearchKey, type MeetingPlace } from './event-location-search';
import { findLocationSuggestions, type LocationSuggestions } from './location-suggestions';
import { contextFocus, prepareDemoLocationFocus, prepareDemoLocationRegion, type DemoLocationSession } from './demo-location-search';

import { destinationContext, inferLocationContext, type LocationItinerary } from './event-location-context';

const cache = new Map<string, {result:LocationSuggestions; expires:number}>();
export function EventLocationInput({value,onChange,destinations=[],itinerary}: {value:string;onChange:(value:string,point?:MeetingPlace["point"],googlePlaceId?:string)=>void;destinations?:string[];itinerary?:LocationItinerary}) {
  const id=useId(), list=useRef<HTMLDivElement>(null), menu=useRef<HTMLDivElement>(null);
  const [open,setOpen]=useState(false), [active,setActive]=useState(-1);
  const [results,setResults]=useState<MeetingPlace[]>([]);
  const [status,setStatus]=useState<'loading'|'ready'|'error'>('ready');
  const activeSelection=useRef(active);activeSelection.current=active;
  const visibleResults=useRef(results);visibleResults.current=results;
  const lastSearch=useRef('');
  const session=useRef<DemoLocationSession>({});
  const pointerStart=useRef<{id:number;x:number;y:number}|null>(null);
  const [attempt,setAttempt]=useState(0),[source,setSource]=useState<'photon'|'google'>('photon'),[limited,setLimited]=useState(false);
  const [near,setNear]=useState<string|null>(null);
  const stops=[...new Set(destinations.filter(Boolean))];
  const inferred=inferLocationContext(stops,itinerary);
  const candidate=near===null?inferred:destinationContext(stops.includes(near)?near:'');
  const context=useMemo(()=>candidate,[candidate.key,candidate.label,candidate.reason]);
  const destination=context.label;
  const [contextVersion,setContextVersion]=useState(0);
  const [regionOnly,setRegionOnly]=useState(false);
  const [biased,setBiased]=useState(false),[approximate,setApproximate]=useState(false);
  const query=locationQuery(value);
  useEffect(()=>{
    if(!context.query)return;
    const controller=new AbortController();
    // Warm the anchor on form open, so typing never waits for it.
    const refresh=()=>{if(!controller.signal.aborted && activeSelection.current<0)setContextVersion(v=>v+1);};
    void prepareDemoLocationFocus(context,controller.signal,session.current).then(refresh).catch(()=>{});
    void prepareDemoLocationRegion(context,controller.signal,session.current).then(changed=>{if(changed)refresh();}).catch(()=>{});
    return()=>controller.abort();
  },[context]);
  useEffect(()=>{
    const identity=JSON.stringify([query,open,context.key,attempt]);
    const sameSearch=lastSearch.current===identity;lastSearch.current=identity;
    // A background refinement must keep the current list selectable.
    if(!sameSearch){setResults([]);setActive(-1);}
    if(!open || query.length<2){setStatus('ready');return;}
    let cancelled=false;
    const controller=new AbortController();
    if(!sameSearch || !visibleResults.current.length)setStatus('loading');
    const timer=setTimeout(async()=>{
      try {
        const key=locationSearchKey(query,JSON.stringify([context.key,contextFocus(context,session.current)])), saved=cache.get(key);
        const matches=saved && saved.expires>Date.now() ? saved.result : await findLocationSuggestions(query,context,controller.signal,session.current);
        if(cancelled || (sameSearch && activeSelection.current>=0))return;
        // Cache only bounded OpenStreetMap results, never Google predictions or errors.
        if(matches.source==='photon' && matches.places.length) {
          if(cache.size>=50)cache.delete(cache.keys().next().value!);
          cache.set(key,{result:matches,expires:Date.now()+300000});
        }
        setResults(matches.places);setBiased(matches.biased);setRegionOnly(matches.regionOnly??false);setApproximate(matches.approximate);
        setSource(matches.source);setLimited(matches.limited);setStatus('ready');
      }catch{if(!cancelled)setStatus('error');}
    },150);
    return()=>{cancelled=true;clearTimeout(timer);controller.abort();};
  },[query,open,context,contextVersion,attempt]);
  useEffect(()=>{if(active>=0)list.current?.children[active]?.scrollIntoView({block:'nearest'});},[active]);
  function select(index:number){const result=results[index];if(result){onChange(result.label,result.point,result.googlePlaceId);result.finishSelection?.();setOpen(false);setActive(-1);}}
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
    <div className="event-location-bias">
      <label htmlFor={`${id}-near`}>Near</label>
      <select id={`${id}-near`} aria-label="Prioritize locations near" value={near===null?'__auto':near} onChange={e=>{setNear(e.target.value==='__auto'?null:e.target.value);setActive(-1);setResults([]);setOpen(true);}}>
        <option value="__auto">Automatic</option>
        {stops.map(stop=><option key={stop} value={stop}>{stop}</option>)}
        <option value="">Worldwide (no preference)</option>
      </select>
    </div>
    </div>
    {near===null && destination && <small className="event-location-context">Near {destination} · {context.reason.toLowerCase()}</small>}
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
        else if(e.key==='Tab'){setOpen(false);}
        else if(e.key==='Escape' && expanded){e.preventDefault();setOpen(false);}
      }}/>
    {expanded && <div ref={menu} className="field-popup event-location-menu">
      <div className="event-location-caption">{status==='loading'?'Searching worldwide…':status==='error'?'Search unavailable':results.length?(regionOnly?'Prioritizing trip country':destination && biased?`Near ${destination}${approximate?' (approximate area)':''}`:'Suggested locations'):'No locations found'}</div>
      <div ref={list} id={`${id}-list`} role="listbox" aria-label="Location suggestions">
        {results.map((place,i)=><div key={place.id} role="option" id={`${id}-${i}`} aria-selected={i===active}
          className={`event-location-option ${i===active?'active':''}`} onPointerDown={e=>{
            // Retain input focus; Safari can suppress the synthetic click after this.
            e.preventDefault();pointerStart.current={id:e.pointerId,x:e.clientX,y:e.clientY};
          }} onPointerUp={e=>{
            const start=pointerStart.current;pointerStart.current=null;
            if(e.pointerType==='mouse')return;
            e.preventDefault();
            // Select a tap on release, not the start of a swipe through the list.
            if(start?.id===e.pointerId && Math.hypot(e.clientX-start.x,e.clientY-start.y)<10)select(i);
          }} onPointerCancel={()=>{pointerStart.current=null;}} onMouseDown={e=>e.preventDefault()}
          onMouseEnter={()=>setActive(i)} onClick={()=>select(i)}>
          <MapPin size={17} aria-hidden="true"/><span><strong>{place.name}</strong>{place.address && <small>{place.address}</small>}</span>
        </div>)}
      </div>
      <div className="event-location-footer" role="status" aria-live="polite">
        {status==='loading'?'Finding places…':status==='error'?'You can still type a location and save it.':results.length?(limited?'Address matches · ↑ ↓ to navigate · Enter to select':destination && !biased?'Showing worldwide matches.':'↑ ↓ to navigate · Enter to select'):limited?'Try a full address or landmark name, or keep the location you typed.':'Try another spelling, or enter the location manually.'}
      </div>
      {status==='error' && <button type="button" className="btn btn-outline" onClick={()=>setAttempt(value=>value+1)}>Retry location search</button>}
      {source==='google' && status==='ready' ? <div className="event-location-source google-search-attribution" translate="no">Google Maps</div> : <div className="event-location-source">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> · Photon</div>}
    </div>}
  </div></div>;
}
