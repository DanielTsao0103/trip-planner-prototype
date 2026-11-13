import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Event as TripEvent } from './domain';
import './calendar-event-preview.css';
import { ArrowLeftRight, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { useApp } from './state';
import { Button, ErrorBox, Field } from './ui';
import { canEdit, dateText, orderedEvents, timeText, EVENT_PERMISSION_MESSAGE } from './domain';
import { addCalendarDays, clock, minutes, rescheduleEvent, calendarLanes, snapCalendarMinute, calendarSelection } from './calendar';

const HOUR_HEIGHT = 72;

type CalendarSelectionGesture = {
  date: string; anchor: number; start: number; end: number; pointerId: number;
  originY: number; clientY: number; moved: boolean; node: HTMLDivElement;
  first: number; last: number;
};

type EventPreviewTarget = { event: TripEvent; anchor: HTMLButtonElement };

/** One preview for the grid, shared by pointer and keyboard interactions. */
function useEventPreview(blocked: boolean) {
  const [target, setTarget] = useState<EventPreviewTarget | null>(null);
  const hovered = useRef<EventPreviewTarget | null>(null);
  const focused = useRef<EventPreviewTarget | null>(null);
  const dismissed = useRef<HTMLButtonElement | null>(null);
  const overPreview = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clearTimer = () => { clearTimeout(timer.current); };
  const reconcile = () => {
    clearTimer();
    const next = focused.current || hovered.current;
    setTarget(current => next?.anchor === dismissed.current ? null : next || (overPreview.current ? current : null));
  };
  const dismiss = () => {
    clearTimer();
    dismissed.current = (focused.current || hovered.current)?.anchor || null;
    overPreview.current = false;
    setTarget(null);
  };
  useEffect(() => {
    if (blocked) { clearTimer(); setTarget(null); hovered.current = null; focused.current = null; }
  }, [blocked]);
  useEffect(() => () => clearTimer(), []);
  useEffect(() => {
    if (!target) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); dismiss(); }
    };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [target]);
  return {
    target, dismiss,
    titleProps(event: TripEvent) {
      return {
        onPointerEnter: (e: React.PointerEvent<HTMLButtonElement>) => {
          if (blocked || e.pointerType === 'touch' || !matchMedia('(hover: hover)').matches) return;
          hovered.current = { event, anchor: e.currentTarget };
          dismissed.current = null;
          clearTimer();
          // Focus wins when a pointer crosses another title during keyboard use.
          if (target || focused.current) reconcile();
          else timer.current = setTimeout(reconcile, 250);
        },
        onPointerLeave: () => {
          hovered.current = null;
          clearTimer();
          // A short bridge lets the pointer cross the gap into the preview.
          timer.current = setTimeout(reconcile, 180);
        },
        onFocus: (e: React.FocusEvent<HTMLButtonElement>) => {
          if (blocked) return;
          focused.current = { event, anchor: e.currentTarget };
          dismissed.current = null;
          reconcile();
        },
        onBlur: (e: React.FocusEvent<HTMLButtonElement>) => {
          if (focused.current?.anchor === e.currentTarget) focused.current = null;
          reconcile();
        },
        onPointerDown: dismiss,
      };
    },
    previewProps: {
      onPointerEnter: () => { clearTimer(); overPreview.current = true; },
      onPointerLeave: () => { overPreview.current = false; reconcile(); },
    },
  };
}

/** Portal positioning avoids clipping inside the horizontally scrolling grid. */
function CalendarEventPreview({ target, id, dismiss, ...pointerProps }: {
  target: EventPreviewTarget; id: string; dismiss: () => void;
  onPointerEnter: () => void; onPointerLeave: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const place = () => {
      const node = panel.current, anchor = target.anchor;
      if (!node || !anchor.isConnected || !anchor.getClientRects().length) { dismiss(); return; }
      const trigger = anchor.getBoundingClientRect();
      const scrollport = anchor.closest('.itcal-scroll')?.getBoundingClientRect();
      if (trigger.bottom <= 0 || trigger.top >= innerHeight || trigger.right <= 0 || trigger.left >= innerWidth
        || (scrollport && (trigger.right <= scrollport.left || trigger.left >= scrollport.right
          || trigger.bottom <= scrollport.top || trigger.top >= scrollport.bottom))) {
        // Keep keyboard ownership while scrolling; reveal again with the trigger.
        node.style.visibility = 'hidden';
        return;
      }
      const rect = (anchor.closest('.itcal-event') || anchor).getBoundingClientRect();
      const viewport = window.visualViewport;
      const leftEdge = (viewport?.offsetLeft || 0) + 12, topEdge = (viewport?.offsetTop || 0) + 12;
      const rightEdge = leftEdge + (viewport?.width || innerWidth) - 24;
      const bottomEdge = topEdge + (viewport?.height || innerHeight) - 24;
      const width = Math.min(320, rightEdge - leftEdge);
      node.style.width = `${width}px`;
      const below = bottomEdge - rect.bottom - 8, above = rect.top - topEdge - 8;
      const side = below >= Math.min(node.scrollHeight, 240) || below >= above ? 'below' : 'above';
      // Constrain unusually long saved addresses without truncating their text.
      const available = Math.max(80, side === 'below' ? below : above);
      node.style.maxHeight = `${Math.min(320, bottomEdge - topEdge, available)}px`;
      const height = node.getBoundingClientRect().height;
      const top = side === 'below' ? rect.bottom + 8 : rect.top - height - 8;
      node.style.left = `${Math.max(leftEdge, Math.min(rect.left, rightEdge - width))}px`;
      node.style.top = `${Math.max(topEdge, Math.min(top, bottomEdge - height))}px`;
      node.style.visibility = 'visible';
    };
    place();
    const observer = new ResizeObserver(place);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    window.visualViewport?.addEventListener('resize', place);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('resize', place);
    };
  }, [target]);
  return createPortal(<div ref={panel} id={id} role="tooltip" className="calendar-event-preview" {...pointerProps}>
    <strong>{target.event.name}</strong>
    <span className="calendar-event-preview-time">{timeText(target.event.start)} – {timeText(target.event.end)}</span>
    {target.event.place && <span>{target.event.place}</span>}
  </div>, document.body);
}

export function WeeklyCalendar() {
  const { trip, s, go, updateTrip, open, toast, route } = useApp();
  const [page, setPage] = useState(0);
  const [mobileGrid, setMobileGrid] = useState(false);
  const [desktopAgenda, setDesktopAgenda] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [moving, setMoving] = useState<string | null>(null);
  const [moveDate, setMoveDate] = useState('');
  const [moveStart, setMoveStart] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ date: string; start: number; end: number } | null>(null);
  const selectionGesture = useRef<CalendarSelectionGesture | null>(null);
  const eventPreview = useEventPreview(Boolean(dragging || moving || selection));
  const eventPreviewId = useId();
  const grabOffset = useRef(0);
  const scrollRegion = useRef<HTMLDivElement>(null);
  const [gridOverflows, setGridOverflows] = useState(false);
  const overflowHintId = useId();
  const calendarRegion = useRef<HTMLElement>(null);
  const [preview, setPreview] = useState<{ date: string; minute: number } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [movedFocus, setMovedFocus] = useState<string | null>(null);
  const requestedDate = route.params.get('date');
  const requestedEvent = route.params.get('event');
  function cancelSelection() {
    const gesture = selectionGesture.current;
    selectionGesture.current = null;
    if (gesture?.node.hasPointerCapture(gesture.pointerId)) gesture.node.releasePointerCapture(gesture.pointerId);
    setSelection(null);
  }
  function updateSelection(gesture: CalendarSelectionGesture) {
    const minute = gesture.first + (gesture.clientY - gesture.node.getBoundingClientRect().top) * 60 / HOUR_HEIGHT;
    const range = calendarSelection(gesture.anchor, minute, gesture.first, gesture.last);
    gesture.start = range.start; gesture.end = range.end;
    setSelection({ date: gesture.date, ...range });
  }
  useEffect(() => {
    if (!selection) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); cancelSelection(); }
    };
    // Scroll the time grid at its edges while maintaining the selected time range.
    let frame = 0;
    const scroll = () => {
      const gesture = selectionGesture.current, region = scrollRegion.current;
      if (gesture?.moved && region) {
        const rect = region.getBoundingClientRect();
        const top = Math.max(0, rect.top) + 90, bottom = Math.min(innerHeight, rect.bottom) - 36;
        const delta = gesture.clientY < top ? -8 : gesture.clientY > bottom ? 8 : 0;
        if (delta) {
          const before = region.scrollTop;
          region.scrollTop += delta;
          if (region.scrollTop !== before) updateSelection(gesture);
        }
      }
      frame = requestAnimationFrame(scroll);
    };
    frame = requestAnimationFrame(scroll);
    document.addEventListener('keydown', escape);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', escape); };
  }, [Boolean(selection)]);
  useEffect(() => { cancelSelection(); }, [page, mobileGrid, desktopAgenda, trip?.id]);
  useLayoutEffect(() => {
    const region = scrollRegion.current;
    const grid = region?.firstElementChild;
    if (!region || !grid) return;
    const measure = () => setGridOverflows(region.getClientRects().length > 0
      && region.clientWidth > 0 && region.scrollWidth > region.clientWidth + 1);
    measure();
    // Observe both widths: overlap lanes can grow without resizing the viewport.
    // Hidden agenda grids have no rendered box and must never leave a stale cue.
    const observer = new ResizeObserver(measure);
    observer.observe(region);
    observer.observe(grid);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [trip?.id, page, mobileGrid, desktopAgenda]);
  useEffect(() => { eventPreview.dismiss(); }, [page, mobileGrid, desktopAgenda, trip?.id]);
  // Route changes select a week once; paging must not keep resetting to that week.
  useEffect(() => {
    const offset = trip && requestedDate
      ? (Date.parse(`${requestedDate}T12:00:00Z`) - Date.parse(`${trip.start}T12:00:00Z`)) / 86400000
      : -1;
    const insideTrip = trip && requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
      && Number.isInteger(offset) && offset >= 0 && requestedDate <= trip.end;
    setPage(insideTrip ? Math.floor(offset / 7) : 0);
    setError('');
  }, [trip?.id, trip?.start, trip?.end, requestedDate, requestedEvent]);
  useEffect(() => {
    if (!requestedDate) return;
    let secondFrame = 0;
    let focusedTarget: HTMLElement | undefined;
    const revealTarget = () => {
      const root = calendarRegion.current;
      if (!root) return;
      // Both representations remain mounted. Only the visible grid/agenda can
      // receive focus, including when the viewport switches between them.
      const visible = (selector: string, key: string, value: string) =>
        Array.from(root.querySelectorAll<HTMLElement>(selector))
          .find(node => node.dataset[key] === value && node.getClientRects().length > 0);
      const target = (requestedEvent && visible('[data-calendar-return-event]', 'calendarReturnEvent', requestedEvent))
        || visible('[data-calendar-return-date]', 'calendarReturnDate', requestedDate);
      if (!target) return;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'center', inline: 'center' });
      focusedTarget = target;
    };
    // Allow route focus, the selected-week render and the grid's initial scroll
    // to finish before revealing the saved item (or its empty day after cancel).
    const frame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(revealTarget);
    });
    const resize = () => {
      if (focusedTarget && !focusedTarget.getClientRects().length
        && (document.activeElement === focusedTarget || document.activeElement === document.body)) revealTarget();
    };
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(frame); cancelAnimationFrame(secondFrame);
      window.removeEventListener('resize', resize);
    };
  }, [trip?.id, trip?.start, trip?.end, requestedDate, requestedEvent, mobileGrid, desktopAgenda]);
  useEffect(() => {
    if (moving && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [moving]);
  useEffect(() => {
    if (!movedFocus || moving) return;
    let secondFrame = 0;
    const frame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        // A cross-day move remounts its card, so the old opener is disconnected.
        // Wait for the destination week and its initial scroll before restoring it.
        const card = Array.from(calendarRegion.current?.querySelectorAll<HTMLElement>('[data-calendar-return-event]') || [])
          .find(node => node.dataset.calendarReturnEvent === movedFocus && node.getClientRects().length > 0);
        const control = card?.querySelector<HTMLElement>('.itcal-move, .itcal-agenda-move')
          || card?.querySelector<HTMLElement>('.itcal-event-title, .itcal-agenda-details');
        if (control) {
          control.focus({ preventScroll: true });
          control.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          const nav = document.querySelector<HTMLElement>('.mobile-nav');
          const bottom = nav?.getClientRects().length ? nav.getBoundingClientRect().top : innerHeight;
          const bounds = control.getBoundingClientRect();
          if (bounds.top < 8 || bounds.bottom > bottom - 8)
            control.scrollIntoView({ block: 'center', inline: 'nearest' });
        }
        setMovedFocus(null);
      });
    });
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(secondFrame); };
  }, [movedFocus, moving, page]);
  useEffect(() => {
    if (!trip) return;
    const first = addCalendarDays(trip.start, page * 7);
    const last = addCalendarDays(first, 6);
    const starts = trip.events.filter(event => event.date >= first && event.date <= last).map(event => minutes(event.start) / 60);
    const axisStart = Math.min(7, ...starts.map(Math.floor));
    const frame = requestAnimationFrame(() => { if (scrollRegion.current) scrollRegion.current.scrollTop = starts.length ? Math.max(0, (Math.min(...starts) - axisStart - .5) * HOUR_HEIGHT) : 0; });
    return () => cancelAnimationFrame(frame);
  }, [trip?.id, page, mobileGrid, desktopAgenda]);
  if (!trip) return null;
  const dayCount = Math.round((Date.parse(`${trip.end}T12:00:00Z`) - Date.parse(`${trip.start}T12:00:00Z`)) / 86400000) + 1;
  const lastPage = Math.max(0, Math.ceil(dayCount / 7) - 1);
  const safePage = Math.min(page, lastPage);
  const firstDate = addCalendarDays(trip.start, safePage * 7);
  const dates = Array.from({ length: Math.min(7, dayCount - safePage * 7) }, (_, i) => addCalendarDays(firstDate, i));
  const visibleEvents = trip.events.filter(event => dates.includes(event.date));
  const canEditVisibleDays = dates.some(date => canEdit(trip, s.userId, date));
  const firstHour = Math.min(7, ...visibleEvents.map(event => Math.floor(minutes(event.start) / 60)));
  const lastHour = Math.max(22, ...visibleEvents.map(event => Math.ceil(minutes(event.end) / 60)));
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i);
  const height = hours.length * HOUR_HEIGHT;
  const selected = trip.events.find(event => event.id === moving);
  const lanes = new Map(dates.map(date => [date, calendarLanes(orderedEvents(trip, date))]));
  // Give simultaneous events readable columns; the time grid scrolls as needed.
  const dayWidths = dates.map(date => 180 * Math.max(1, ...Array.from(lanes.get(date)!.values(), lane => lane.columns)));

  function beginMove(id: string, opener: HTMLElement) {
    const event = trip!.events.find(item => item.id === id);
    if (!event) return;
    if (!canEdit(trip!, s.userId, event.date)) { denyEdit(); return; }
    eventPreview.dismiss();
    returnFocus.current = opener;
    setMoving(id); setMoveDate(event.date); setMoveStart(event.start); setError('');
  }
  function denyEdit() {
    open("message", { title: "Event permissions", body: EVENT_PERMISSION_MESSAGE });
  }
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
    if (moving === id) {
      returnFocus.current = null;
      setMovedFocus(id);
      const offset = (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${trip!.start}T12:00:00Z`)) / 86400000;
      setPage(Math.floor(offset / 7));
    }
    closeMove(); setNotice(message); toast(message, "calendar"); setDragging(null);
  }
  function clearDrag() {
    setDragging(null);
    setPreview(null);
  }
  function startMinute(event: React.DragEvent<HTMLDivElement>) {
    // The card's top edge sets its start, even when grabbed near the bottom.
    const dayTop = event.currentTarget.getBoundingClientRect().top;
    const top = event.clientY - dayTop - grabOffset.current;
    const minute = snapCalendarMinute(firstHour * 60 + top * 60 / HOUR_HEIGHT);
    return Math.max(firstHour * 60, Math.min(lastHour * 60 - 15, 1425, minute));
  }
  function beginSelection(event: React.PointerEvent<HTMLDivElement>, date: string) {
    // Leave touch swipes available for scrolling; Add remains the touch/keyboard path.
    if (event.pointerType === 'touch' || event.button !== 0 || !event.isPrimary
      || (event.target as HTMLElement).closest('.itcal-event') || !canEdit(trip!, s.userId, date)) return;
    event.preventDefault();
    eventPreview.dismiss();
    const first = firstHour * 60, last = lastHour * 60;
    const raw = first + (event.clientY - event.currentTarget.getBoundingClientRect().top) * 60 / HOUR_HEIGHT;
    const anchor = Math.max(first, Math.min(last - 15, 1410, snapCalendarMinute(raw)));
    const range = calendarSelection(anchor, anchor + 60, first, last);
    selectionGesture.current = { date, anchor, ...range, pointerId: event.pointerId,
      originY: event.clientY, clientY: event.clientY, moved: false, node: event.currentTarget, first, last };
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelection({ date, ...range });
  }
  function extendSelection(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = selectionGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gesture.clientY = event.clientY;
    gesture.moved ||= Math.abs(event.clientY - gesture.originY) >= 4;
    if (gesture.moved) updateSelection(gesture);
  }
  function finishSelection(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = selectionGesture.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    extendSelection(event);
    cancelSelection();
    if (!canEdit(trip!, s.userId, gesture.date)) { denyEdit(); return; }
    go(7, { date: gesture.date, start: clock(gesture.start), end: clock(gesture.end), view: 'calendar' });
  }
  function dragOver(event: React.DragEvent<HTMLDivElement>, date: string) {
    if (!dragging || date > trip!.end) return;
    event.preventDefault();
    if (!canEdit(trip!, s.userId, date)) { setPreview(null); return; }
    event.dataTransfer.dropEffect = 'move';
    const minute = startMinute(event);
    if (preview?.date !== date || preview.minute !== minute) setPreview({ date, minute });
  }
  function drop(event: React.DragEvent<HTMLDivElement>, date: string) {
    event.preventDefault();
    const id = event.dataTransfer.getData('application/x-trip-event');
    if (id && id === dragging && date <= trip!.end) {
      if (!canEdit(trip!, s.userId, date)) denyEdit();
      else move(id, date, clock(startMinute(event)));
    }
    clearDrag();
  }
  return <section ref={calendarRegion} className={`weekly-calendar${mobileGrid ? " show-time-grid" : ""}${desktopAgenda ? " show-desktop-agenda" : ""}`} aria-label="Seven-day itinerary calendar">
    <div className="itcal-toolbar">
      <div className="itcal-navigation">
        <Button variant="outline" aria-label="Previous seven days" disabled={safePage === 0} onClick={() => { setPage(safePage - 1); setError(''); }}><ChevronLeft size={18}/></Button>
        <h3 aria-live="polite">{dateText(firstDate, true)} – {dateText(dates[dates.length - 1], true)}</h3>
        <Button variant="outline" aria-label="Next seven days" disabled={safePage === lastPage} onClick={() => { setPage(safePage + 1); setError(''); }}><ChevronRight size={18}/></Button>
      </div>
      <Button variant="outline calendar-desktop-view" onClick={() => setDesktopAgenda(value => !value)}>{desktopAgenda ? "Show time grid" : "Show agenda"}</Button>
      <Button variant="text small calendar-mobile-view" aria-label={mobileGrid ? "Show agenda" : "Show time grid"} onClick={() => setMobileGrid(value => !value)}>{mobileGrid ? "Agenda" : "Time grid"}</Button>
    </div>
    {canEditVisibleDays && <p className="calendar-help calendar-grid-help">Click or drag an empty time slot to create an event. Dragging snaps to 15 minutes; type a time in Edit or Move for exact minutes.</p>}
    {!moving && <ErrorBox text={error}/>}
    <p className="sr-only" role="status" aria-live="polite">{notice}</p>
    {gridOverflows && <p id={overflowHintId} className="calendar-overflow-hint"><ArrowLeftRight size={16} aria-hidden="true"/> Scroll horizontally to see more plans.</p>}
    <div className="itcal-scroll" ref={scrollRegion} tabIndex={0} role="region" aria-label="Scrollable seven-day calendar" aria-describedby={gridOverflows ? overflowHintId : undefined}>
      <div className="itcal-grid" style={{ "--calendar-hour-height": `${HOUR_HEIGHT}px`, gridTemplateColumns: `64px ${dayWidths.map(width => `minmax(${width}px, 1fr)`).join(" ")}`, minWidth: 64 + dayWidths.reduce((sum, width) => sum + width, 0) } as React.CSSProperties}>
        <div className="itcal-corner" aria-hidden="true">Time</div>
        {dates.map(date => {
          const inside = date <= trip.end;
          return <div className={`itcal-day-header ${inside ? '' : 'outside-trip'}`} key={date} data-calendar-return-date={date} tabIndex={-1}>
            <strong>{new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}</strong>
            <span>{dateText(date, true)}</span>
            {inside ? canEdit(trip, s.userId, date) && <button type="button" className="itcal-add" title={`Add event on ${date}`} aria-label={`Add event on ${date}`} onClick={() => go(7,{date, view:"calendar"})}><Plus size={16}/></button> : <small>Outside trip</small>}
          </div>;
        })}
        <div className="itcal-time-axis" style={{height}} aria-hidden="true">
          {hours.map(hour => <span key={hour} style={{top:(hour-firstHour)*HOUR_HEIGHT}}>{timeText(clock(hour*60))}</span>)}
        </div>
        {dates.map(date => <div key={date} data-calendar-date={date}
          className={`itcal-day ${date > trip.end ? 'outside-trip' : ''} ${canEdit(trip,s.userId,date) ? 'can-create' : ''} ${dragging && canEdit(trip,s.userId,date) ? 'can-drop' : ''}`}
          style={{height}} onDragOver={event => dragOver(event, date)}
          onPointerDown={event => beginSelection(event, date)} onPointerMove={extendSelection}
          onPointerUp={finishSelection} onPointerCancel={cancelSelection} onLostPointerCapture={cancelSelection}
          onDragLeave={event => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setPreview(current => current?.date === date ? null : current);
            }
          }}
          onDrop={event => drop(event,date)} aria-label={`Events on ${date}`}>
          {hours.map(hour => <div key={hour} className="itcal-hour-line" style={{top:(hour-firstHour)*HOUR_HEIGHT}} aria-hidden="true"/>)}
          {selection?.date === date && <div className="itcal-selection" aria-hidden="true" style={{
            top: (selection.start - firstHour * 60) * HOUR_HEIGHT / 60,
            height: (selection.end - selection.start) * HOUR_HEIGHT / 60,
          }}><span>{timeText(clock(selection.start))} – {timeText(clock(selection.end))}</span></div>}
          {preview?.date === date && <div className="itcal-drop-preview" aria-hidden="true"
            style={{ top: (preview.minute - firstHour * 60) * HOUR_HEIGHT / 60 }}>
            <span>{timeText(clock(preview.minute))}</span>
          </div>}
          {orderedEvents(trip,date).map(event => {
            const editable = canEdit(trip,s.userId,event.date);
            const lane = lanes.get(date)!.get(event.id)!;
            const from = timeText(event.start), to = timeText(event.end);
            const sharedPeriod = from.match(/ (AM|PM)$/)?.[1] === to.match(/ (AM|PM)$/)?.[1];
            const timeRange = `${sharedPeriod ? from.replace(/ (AM|PM)$/, "") : from}–${to}`;
            const eventHeight = Math.max(46, (minutes(event.end)-minutes(event.start))/60*HOUR_HEIGHT-3);
            return <article key={event.id} className={`itcal-event ${eventHeight >= 64 ? 'has-title-room' : ''} ${dragging === event.id ? 'is-dragging' : ''}`}
              data-event-id={event.id} data-calendar-return-event={event.id} tabIndex={-1} draggable aria-label={`${event.name}, ${timeText(event.start)} to ${timeText(event.end)}`}
              style={{top:(minutes(event.start)-firstHour*60)/60*HOUR_HEIGHT,height:eventHeight,left:`calc(${lane.column * 100 / lane.columns}% + 4px)`,width:`calc(${100 / lane.columns}% - 8px)`,right:"auto"}}
              onDragStart={e => {
                if (!editable) { e.preventDefault(); denyEdit(); return; }
                eventPreview.dismiss();
                grabOffset.current = e.clientY - e.currentTarget.getBoundingClientRect().top;
                e.dataTransfer.setData('application/x-trip-event', event.id);
                e.dataTransfer.effectAllowed = 'move';
                setDragging(event.id);
                // Keep the previous result in place until this drop finishes.
                // Removing it here moves the time grid underneath the pointer.
              }}
              onDragEnd={clearDrag}>
              <button type="button" className="itcal-event-title" {...eventPreview.titleProps(event)}
                aria-describedby={eventPreview.target?.event.id === event.id ? eventPreviewId : undefined}
                onKeyDown={e => {
                  if (eventPreview.target?.event.id !== event.id) return;
                  const details = document.getElementById(eventPreviewId);
                  if (!details || details.scrollHeight <= details.clientHeight) return;
                  const delta = { ArrowDown: 40, ArrowUp: -40, PageDown: details.clientHeight, PageUp: -details.clientHeight }[e.key];
                  if (delta !== undefined) { e.preventDefault(); details.scrollBy({ top: delta }); }
                }}
                title={eventPreview.target?.event.id === event.id ? undefined : event.name} onClick={() => editable ? go(7,{event:event.id,date:event.date,view:"calendar"}) : go(11,{event:event.id,date:event.date})}>{event.name}</button>
              <span className="itcal-event-time">{timeRange}</span>
              {eventHeight >= 100 && <span className="itcal-event-place" title={event.place}>{event.place}</span>}
              {editable && <button type="button" className="itcal-move" aria-label={`Move ${event.name}`} onClick={e => {
                beginMove(event.id, e.currentTarget);
              }}><span>Move</span></button>}
            </article>;
          })}
        </div>)}
      </div>
    </div>
    <div className="itcal-agenda" role="region" aria-label="Seven-day agenda">
      {dates.map(date => <section className="itcal-agenda-day" key={date} aria-label={dateText(date)} data-calendar-return-date={date} tabIndex={-1}>
        <div className="itcal-agenda-heading">
          <h3>{new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })} · {dateText(date, true)}</h3>
          {date <= trip.end && canEdit(trip, s.userId, date) && <Button variant="text small" aria-label={`Add event on ${date}`} onClick={() => go(7, { date, view: "calendar" })}><Plus size={16}/> Add</Button>}
        </div>
        {date > trip.end ? <p className="fine-print">Outside your trip</p> : orderedEvents(trip, date).length === 0 ? <p className="fine-print">No plans yet.</p> : orderedEvents(trip, date).map(event => <article className="itcal-agenda-event" key={event.id} data-calendar-return-event={event.id} tabIndex={-1} aria-label={`${event.name}, ${timeText(event.start)} to ${timeText(event.end)}`}>
          <button className="itcal-agenda-details" onClick={() => go(11, { event: event.id, date: event.date })}>
            <span>{timeText(event.start)} – {timeText(event.end)}</span>
            <strong>{event.name}</strong>
            <small>{event.place}</small>
          </button>
          {canEdit(trip, s.userId, event.date) && <button className="itcal-agenda-move" aria-label={`Move ${event.name}`} onClick={e => beginMove(event.id, e.currentTarget)}>Move</button>}
        </article>)}
      </section>)}
    </div>
    {eventPreview.target && <CalendarEventPreview key={eventPreview.target.event.id} target={eventPreview.target} id={eventPreviewId} dismiss={eventPreview.dismiss} {...eventPreview.previewProps}/>}
    <dialog ref={dialog} className="calendar-move-dialog" aria-labelledby="calendar-move-title" onCancel={closeMove} onClose={() => {
      // A queued native close event must not clear a dialog already reopened.
      if (!dialog.current?.open) { setMoving(null); returnFocus.current?.focus(); }
    }}>
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
