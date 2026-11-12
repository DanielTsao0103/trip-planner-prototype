import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { dateText } from "./domain";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const validIso = (value: string) => {
  if (!ISO.test(value)) return false;
  const d = new Date(value + "T12:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};

// nth (1-based) given weekday of a month; weekday 0 = Sunday.
const nthWeekday = (year: number, month: number, weekday: number, n: number) => {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
};
const lastWeekday = (year: number, month: number, weekday: number) => {
  const last = new Date(Date.UTC(year, month + 1, 0));
  return last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7);
};

/** US federal holidays for a year, keyed by ISO date. Computed locally, no network. */
export const usHolidays = (year: number): Record<string, string> => ({
  [iso(year, 0, 1)]: "New Year’s Day",
  [iso(year, 0, nthWeekday(year, 0, 1, 3))]: "Martin Luther King Jr. Day",
  [iso(year, 1, nthWeekday(year, 1, 1, 3))]: "Presidents’ Day",
  [iso(year, 4, lastWeekday(year, 4, 1))]: "Memorial Day",
  [iso(year, 5, 19)]: "Juneteenth",
  [iso(year, 6, 4)]: "Independence Day",
  [iso(year, 8, nthWeekday(year, 8, 1, 1))]: "Labor Day",
  [iso(year, 9, nthWeekday(year, 9, 1, 2))]: "Columbus Day",
  [iso(year, 10, 11)]: "Veterans Day",
  [iso(year, 10, nthWeekday(year, 10, 4, 4))]: "Thanksgiving",
  [iso(year, 11, 25)]: "Christmas Day",
});

/** Accept explicit calendar dates without JavaScript's silent day/month rollover. */
const parseTyped = (text: string) => {
  const trimmed = text.trim();
  if (validIso(trimmed)) return trimmed;
  const numeric = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const named = trimmed.match(/^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/i);
  const month = numeric ? Number(numeric[1]) - 1 : named ? MONTHS.findIndex(m => [m.toLowerCase(), m.slice(0,3).toLowerCase()].includes(named[1].toLowerCase())) : -1;
  if (month < 0 || month > 11 || (!numeric && !named)) return "";
  const parts = numeric || named!;
  const result = iso(Number(parts[3]), month, Number(parts[2]));
  return validIso(result) ? result : "";
};

export function DatePicker({
  label,
  value,
  onChange,
  onErrorChange,
  min,
  max,
  required,
  align = "left",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Keep surrounding summaries in step with a rejected visible date draft. */
  onErrorChange?: (hasError: boolean) => void;
  min?: string;
  max?: string;
  required?: boolean;
  align?: "left" | "right";
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [typedError, setTypedError] = useState("");
  const toggle = useRef<HTMLButtonElement>(null);
  const calendar = useRef<HTMLDivElement>(null);
  const focusCalendar = useRef(false);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value ? dateText(value) : "");
  const [focused, setFocused] = useState(false);
  const seed = validIso(value) ? value : min && validIso(min) ? min : new Date().toISOString().slice(0, 10);
  const [activeDate, setActiveDate] = useState(seed);
  const [view, setView] = useState({ y: Number(seed.slice(0, 4)), m: Number(seed.slice(5, 7)) - 1 });

  // Keep the visible text in step with the real value unless the person is typing.
  useEffect(() => {
    if (!focused && !typedError) setText(value ? dateText(value) : "");
  }, [value, focused, typedError]);
  // Jump the calendar to the chosen month when the value changes from outside.
  useEffect(() => {
    if (validIso(value)) setView({ y: Number(value.slice(0, 4)), m: Number(value.slice(5, 7)) - 1 });
  }, [value]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);

  const holidays = useMemo(() => usHolidays(view.y), [view.y]);
  const first = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
  const length = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: first }, () => null),
    ...Array.from({ length }, (_, i) => i + 1),
  ];
  const shift = (by: number) =>
    setView(({ y, m }) => {
      const next = new Date(Date.UTC(y, m + by, 1));
      return { y: next.getUTCFullYear(), m: next.getUTCMonth() };
    });
  const today = new Date().toISOString().slice(0, 10);
  const boundaryError = (date: string) => date && min && date < min ? `Choose ${dateText(min)} or later.`
    : date && max && date > max ? `Choose ${dateText(max)} or earlier.` : "";
  const rangeError = boundaryError(value);

  const error = typedError || rangeError;
  useEffect(() => { onErrorChange?.(Boolean(error)); }, [error, onErrorChange]);
  const typingProblem = (draft: string) => {
    if (!draft.trim()) return "";
    const parsed = parseTyped(draft);
    if (parsed) return boundaryError(parsed);
    const explicitDate = /^\d{4}-\d{2}-\d{2}$|^\d{1,2}\/\d{1,2}\/\d{4}$|^[a-z]+\s+\d{1,2},?\s+\d{4}$/i.test(draft.trim());
    return explicitDate ? "That date does not exist. Check the day, month, and year." : "Enter a calendar date, like May 4, 2027 or 2027-05-04.";
  };

  const monthDates = Array.from({length}, (_, index) => iso(view.y, view.m, index + 1));
  const available = (date: string) => (!min || date >= min) && (!max || date <= max);
  const tabDate = monthDates.includes(activeDate) && available(activeDate) ? activeDate
    : monthDates.includes(value) && available(value) ? value : monthDates.find(available);
  const weeks = Array.from({length: Math.ceil(cells.length / 7)}, (_, index) =>
    Array.from({length: 7}, (_, day) => cells[index * 7 + day] ?? null));
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      calendar.current?.scrollIntoView({block: "nearest"});
      if (focusCalendar.current) {
        root.current?.querySelector<HTMLButtonElement>(`[data-date="${tabDate}"]`)?.focus({preventScroll: true});
        focusCalendar.current = false;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [open, view.y, view.m, tabDate]);
  const closeCalendar = () => { setOpen(false); toggle.current?.focus({preventScroll: true}); };
  const focusDay = (date: string) => {
    if (!available(date)) return;
    setActiveDate(date);
    setView({y: Number(date.slice(0,4)), m: Number(date.slice(5,7)) - 1});
    requestAnimationFrame(() => root.current?.querySelector<HTMLButtonElement>(`[data-date="${date}"]`)?.focus());
  };

  return (
    <div className="field date-field" ref={root} onKeyDown={event => {
      if (open && event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeCalendar(); }
    }} onBlur={event => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
    }}>
      <label htmlFor={id}>{label}</label>
      <div className="date-input field-popup-anchor">
        <input
          id={id}
          ref={input}
          type="text"
          autoComplete="off"
          required={required}
          placeholder="Pick a date"
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-range` : undefined}
          value={text}
          onFocus={() => {
            setFocused(true);
            if (!error && !input.current?.validity.customError) setOpen(true);
          }}
          onBlur={() => {
            setFocused(false);
            const next = parseTyped(text);
            const problem = typingProblem(text);
            setTypedError(problem);
            input.current?.setCustomValidity(problem);
            if (problem) return; // Keep the attempted date visible until it is corrected.
            if (next !== value) onChange(next);
            setText(next ? dateText(next) : "");
          }}
          onClick={() => { if (!error && !input.current?.validity.customError) setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); }
            if (e.key === "ArrowDown") { e.preventDefault(); focusCalendar.current = true; setOpen(true); if (open && tabDate) focusDay(tabDate); }
          }}
          onInvalid={(event) => {
            // The associated inline message replaces the browser bubble; validation still blocks submission.
            event.preventDefault();
            const field = event.currentTarget;
            const firstInvalid = field.form?.querySelector("input:invalid, select:invalid, textarea:invalid");
            setOpen(false);
            setTypedError(!text.trim() && required ? "Choose a date." : typingProblem(text));
            if (!firstInvalid || firstInvalid === field) requestAnimationFrame(() => {
              field.focus({ preventScroll: true });
              root.current?.scrollIntoView({ block: "center" });
            });
          }}
          onChange={(e) => {
            setText(e.target.value);
            const problem = typingProblem(e.target.value);
            e.currentTarget.setCustomValidity(problem);
            if (typedError) setTypedError(problem);
            const next = parseTyped(e.target.value);
            if (next && ISO.test(e.target.value.trim())) {
              if (!problem) onChange(next);
              setOpen(false);
            }
          }}
        />
        <button
          type="button"
          ref={toggle}
          className="date-toggle"
          aria-label={`Open calendar for ${label}`}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={(event) => {
            // Safari may focus the surrounding main element on pointer clicks.
            // Keep Escape in this field while calendar-day focus is scheduled.
            event.currentTarget.focus();
            focusCalendar.current = !open;
            setOpen(!open);
          }}
        >
          <CalendarDays size={16} />
        </button>
        {open && (
          <div
            className={`field-popup date-popover ${align === "right" ? "right" : ""}`}
            ref={calendar}
            role="dialog"
            aria-label={`${label} calendar`}
            onKeyDown={event => {
              if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeCalendar(); return; }
              const date = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-date]")?.dataset.date;
              if (!date) return;
              const current = new Date(`${date}T12:00:00Z`);
              const offsets: Record<string, number> = {ArrowLeft:-1, ArrowRight:1, ArrowUp:-7, ArrowDown:7, Home:-current.getUTCDay(), End:6-current.getUTCDay()};
              if (event.key in offsets) {
                event.preventDefault(); current.setUTCDate(current.getUTCDate() + offsets[event.key]);
                focusDay(current.toISOString().slice(0,10));
              } else if (event.key === "PageUp" || event.key === "PageDown") {
                event.preventDefault();
                const targetMonth = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + (event.key === "PageUp" ? -1 : 1) * (event.shiftKey ? 12 : 1), 1));
                const lastDay = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth()+1, 0)).getUTCDate();
                focusDay(iso(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth(), Math.min(current.getUTCDate(), lastDay)));
              }
            }}
          >
            <div className="date-head">
              <button type="button" aria-label="Previous month" onClick={() => shift(-1)}>
                <ChevronLeft size={16} />
              </button>
              <strong id={`${id}-month`} aria-live="polite">
                {MONTHS[view.m]} {view.y}
              </strong>
              <button type="button" aria-label="Next month" onClick={() => shift(1)}>
                <ChevronRight size={16} />
              </button>
            </div>
            <table className="date-grid" role="grid" aria-labelledby={`${id}-month`}>
              <thead><tr>{WEEKDAYS.map((day,index) => <th scope="col" className="date-dow" key={day} abbr={["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][index]}>{day}</th>)}</tr></thead>
              <tbody>{weeks.map((week,index) => <tr key={index}>{week.map((day,column) => {
                if (!day) return <td key={`blank-${column}`}/>;
                const date=iso(view.y,view.m,day), holiday=holidays[date];
                return <td key={date} aria-selected={date === value}><button
                  type="button" data-date={date} disabled={!available(date)} tabIndex={date === tabDate ? 0 : -1}
                  title={holiday} aria-label={`${dateText(date)}${holiday ? `, ${holiday}` : ""}`} aria-pressed={date === value}
                  className={["date-day",holiday ? "holiday" : "",date === value ? "selected" : "",date === today ? "today" : ""].filter(Boolean).join(" ")}
                  onFocus={() => setActiveDate(date)}
                  onClick={() => { setTypedError(""); input.current?.setCustomValidity(""); setText(dateText(date)); onChange(date); setActiveDate(date); closeCalendar(); }}
                >{day}</button></td>;
              })}</tr>)}</tbody>
            </table>
            <div className="date-key">
              <i aria-hidden="true" /> Holiday (US)
            </div>
          </div>
        )}
      </div>
      {error && <small id={`${id}-range`} className="date-range-error" role="alert">{error}</small>}
    </div>
  );
}
