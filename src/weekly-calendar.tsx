import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, GripVertical, Plus, X } from 'lucide-react';
import { useApp } from './state';
import { Button, ErrorBox, Field } from './ui';
import { canEdit, dateText, orderedEvents, timeText } from './domain';
import { addCalendarDays, clock, minutes, rescheduleEvent } from './calendar';

const HOUR_HEIGHT = 72;
export function WeeklyCalendar() {
  const { trip, s, go, updateTrip } = useApp();
  const [page, setPage] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [moving, setMoving] = useState<string | null>(null);
  const [moveDate, setMoveDate] = useState('');
  const [moveStart, setMoveStart] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => { setPage(0); setError(''); }, [trip?.id, trip?.start, trip?.end]);
  useEffect(() => {
    if (moving && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [moving]);
  if (!trip) return null;
  const dayCount = Math.round((Date.parse(`${trip.end}T12:00:00Z`) - Date.parse(`${trip.start}T12:00:00Z`)) / 86400000) + 1;
  const lastPage = Math.max(0, Math.ceil(dayCount / 7) - 1);
  const safePage = Math.min(page, lastPage);
  const firstDate = addCalendarDays(trip.start, safePage * 7);
  const dates = Array.from({ length: 7 }, (_, i) => addCalendarDays(firstDate, i));
  const visibleEvents = trip.events.filter(event => dates.includes(event.date));
  const firstHour = Math.min(7, ...visibleEvents.map(event => Math.floor(minutes(event.start) / 60)));
  const lastHour = Math.max(22, ...visibleEvents.map(event => Math.ceil(minutes(event.end) / 60)));
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i);
  const height = hours.length * HOUR_HEIGHT;
  const selected = trip.events.find(event => event.id === moving);

  function closeMove() {
    dialog.current?.close(); setMoving(null); setError('');
    returnFocus.current?.focus();
  }
  function move(id: string, date: string, start: string) {
    const result = rescheduleEvent(trip!, s.userId, id, date, start);
    if (!result.event) { setError(result.error); return; }
    updateTrip(current => {
      // Revalidate against the newest trip, including changes from another local control.
      const latest = rescheduleEvent(current, s.userId, id, date, start);
      if (latest.event) {
        const index = current.events.findIndex(event => event.id === id);
        current.events[index] = latest.event;
      }
    });
    const message = `${result.event.name} moved to ${dateText(date, true)} at ${timeText(start)}.`;
    closeMove(); setNotice(message); setDragging(null);
  }
  function drop(event: React.DragEvent<HTMLDivElement>, date: string) {
    event.preventDefault();
    const id = event.dataTransfer.getData('application/x-trip-event');
    if (!id || !canEdit(trip!, s.userId, date)) { setDragging(null); return; }
    const rect = event.currentTarget.getBoundingClientRect();
    const time = Math.floor((event.clientY - rect.top) / HOUR_HEIGHT * 2) * 30 + firstHour * 60;
    move(id, date, clock(Math.max(firstHour * 60, Math.min(lastHour * 60 - 30, time))));
    setDragging(null);
  }
  return <section className="weekly-calendar" aria-label="Seven-day itinerary calendar">
    <div className="itcal-toolbar">
      <div className="itcal-navigation">
        <Button variant="outline" aria-label="Previous seven days" disabled={safePage === 0} onClick={() => { setPage(safePage - 1); setError(''); }}><ChevronLeft size={18}/></Button>
        <h3 aria-live="polite">{dateText(firstDate, true)} – {dateText(dates[6], true)}</h3>
        <Button variant="outline" aria-label="Next seven days" disabled={safePage === lastPage} onClick={() => { setPage(safePage + 1); setError(''); }}><ChevronRight size={18}/></Button>
      </div>
      <span className="muted">{trip.zone.replaceAll('_', ' ')} · 30-minute drop intervals</span>
    </div>
    <p className="calendar-help">Drag an event to change its day or time, or choose Move. Scroll sideways to see all seven days on smaller screens.</p>
    {!moving && <ErrorBox text={error}/>}
    <p className="sr-only" role="status" aria-live="polite">{notice}</p>
    <div className="itcal-scroll" tabIndex={0} role="region" aria-label="Scrollable seven-day calendar">
      <div className="itcal-grid" style={{ "--calendar-hour-height": `${HOUR_HEIGHT}px` } as React.CSSProperties}>
        <div className="itcal-corner" aria-hidden="true">Time</div>
        {dates.map(date => {
          const inside = date <= trip.end;
          return <div className={`itcal-day-header ${inside ? '' : 'outside-trip'}`} key={date}>
            <strong>{new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}</strong>
            <span>{dateText(date, true)}</span>
            {inside ? <button type="button" className="itcal-add" title={`Add event on ${date}`} disabled={!canEdit(trip,s.userId,date)} aria-label={`Add event on ${date}`} onClick={() => go(7,{date, view:"calendar"})}><Plus size={16}/></button> : <small>Outside trip</small>}
          </div>;
        })}
        <div className="itcal-time-axis" style={{height}} aria-hidden="true">
          {hours.map(hour => <span key={hour} style={{top:(hour-firstHour)*HOUR_HEIGHT}}>{timeText(clock(hour*60))}</span>)}
        </div>
        {dates.map(date => <div key={date} data-calendar-date={date}
          className={`itcal-day ${date > trip.end ? 'outside-trip' : ''} ${dragging && canEdit(trip,s.userId,date) ? 'can-drop' : ''}`}
          style={{height}} onDragOver={event => { if (dragging && canEdit(trip,s.userId,date)) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } }}
          onDrop={event => drop(event,date)} aria-label={`Events on ${date}`}>
          {hours.map(hour => <div key={hour} className="itcal-hour-line" style={{top:(hour-firstHour)*HOUR_HEIGHT}} aria-hidden="true"/>)}
          {orderedEvents(trip,date).map(event => {
            const editable = canEdit(trip,s.userId,event.date);
            return <article key={event.id} className={`itcal-event ${dragging === event.id ? 'is-dragging' : ''}`}
              data-event-id={event.id} draggable={editable} aria-label={`${event.name}, ${timeText(event.start)} to ${timeText(event.end)}`}
              style={{top:(minutes(event.start)-firstHour*60)/60*HOUR_HEIGHT,height:Math.max(46,(minutes(event.end)-minutes(event.start))/60*HOUR_HEIGHT-3)}}
              onDragStart={e => { e.dataTransfer.setData('application/x-trip-event',event.id); e.dataTransfer.effectAllowed='move'; setDragging(event.id); setError(''); }}
              onDragEnd={() => setDragging(null)}>
              <button type="button" className="itcal-event-title" title={event.name} onClick={() => go(7,{event:event.id,date:event.date,view:"calendar"})}>{event.name}</button>
              <span className="itcal-event-time">{timeText(event.start)}–{timeText(event.end)}</span>
              <span className="itcal-event-place">{event.place}</span>
              {editable && <button type="button" className="itcal-move" aria-label={`Move ${event.name}`} onClick={e => {
                returnFocus.current=e.currentTarget; setMoving(event.id); setMoveDate(event.date); setMoveStart(event.start); setError('');
              }}><GripVertical size={16}/><span className="sr-only">Move</span></button>}
            </article>;
          })}
        </div>)}
      </div>
    </div>
    <dialog ref={dialog} className="calendar-move-dialog" aria-labelledby="calendar-move-title" onCancel={closeMove} onClose={() => { setMoving(null); returnFocus.current?.focus(); }}>
      <form onSubmit={e => { e.preventDefault(); if (moving) move(moving,moveDate,moveStart); }}>
        <div className="row"><h2 id="calendar-move-title">Move event</h2><button type="button" className="icon-btn push" aria-label="Close move dialog" onClick={closeMove}><X size={20}/></button></div>
        <p>{selected?.name}</p>
        <p className="muted">The event keeps its duration and other details.</p>
        <Field label="New event date"><input type="date" required min={trip.start} max={trip.end} value={moveDate} onChange={e=>setMoveDate(e.target.value)}/></Field>
        <Field label="New start time"><input type="time" required value={moveStart} onChange={e=>setMoveStart(e.target.value)}/></Field>
        <ErrorBox text={error}/>
        <div className="form-actions"><Button variant="outline" onClick={closeMove}>Cancel</Button><Button type="submit">Move event</Button></div>
      </form>
    </dialog>
  </section>;
}
