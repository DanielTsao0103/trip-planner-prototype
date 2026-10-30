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

const parseTyped = (text: string) => {
  const trimmed = text.trim();
  if (validIso(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (!trimmed || Number.isNaN(parsed.getTime())) return "";
  const out = iso(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  return validIso(out) ? out : "";
};

export function DatePicker({
  label,
  value,
  onChange,
  min,
  max,
  required,
  align = "left",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
  align?: "left" | "right";
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(value ? dateText(value) : "");
  const [focused, setFocused] = useState(false);
  const seed = validIso(value) ? value : min && validIso(min) ? min : new Date().toISOString().slice(0, 10);
  const [view, setView] = useState({ y: Number(seed.slice(0, 4)), m: Number(seed.slice(5, 7)) - 1 });

  // Keep the visible text in step with the real value unless the person is typing.
  useEffect(() => {
    if (!focused) setText(value ? dateText(value) : "");
  }, [value, focused]);
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

  return (
    <div className="field date-field" ref={root}>
      <label htmlFor={id}>{label}</label>
      <div className="date-input">
        <input
          id={id}
          type="text"
          autoComplete="off"
          required={required}
          placeholder="Pick a date"
          value={text}
          onFocus={() => {
            setFocused(true);
            setOpen(true);
          }}
          onBlur={() => {
            setFocused(false);
            const next = parseTyped(text);
            if (next && next !== value) onChange(next);
            else setText(value ? dateText(value) : "");
          }}
          onClick={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          onChange={(e) => {
            setText(e.target.value);
            const next = parseTyped(e.target.value);
            if (next && ISO.test(e.target.value.trim())) {
              onChange(next);
              setOpen(false);
            }
          }}
        />
        <button
          type="button"
          className="date-toggle"
          aria-label={`Open calendar for ${label}`}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <CalendarDays size={16} />
        </button>
      </div>
      {open && (
        <div
          className={`date-popover ${align === "right" ? "right" : ""}`}
          role="dialog"
          aria-label={`${label} calendar`}
        >
          <div className="date-head">
            <button type="button" aria-label="Previous month" onClick={() => shift(-1)}>
              <ChevronLeft size={16} />
            </button>
            <strong>
              {MONTHS[view.m]} {view.y}
            </strong>
            <button type="button" aria-label="Next month" onClick={() => shift(1)}>
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="date-grid" role="grid">
            {WEEKDAYS.map((d) => (
              <span className="date-dow" key={d} aria-hidden="true">
                {d}
              </span>
            ))}
            {cells.map((day, i) => {
              if (!day) return <span key={`blank-${i}`} />;
              const date = iso(view.y, view.m, day);
              const holiday = holidays[date];
              const blocked = (!!min && date < min) || (!!max && date > max);
              return (
                <button
                  type="button"
                  key={date}
                  disabled={blocked}
                  title={holiday}
                  aria-label={`${dateText(date)}${holiday ? `, ${holiday}` : ""}`}
                  aria-pressed={date === value}
                  className={[
                    "date-day",
                    holiday ? "holiday" : "",
                    date === value ? "selected" : "",
                    date === today ? "today" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => {
                    onChange(date);
                    setOpen(false);
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <div className="date-key">
            <i aria-hidden="true" /> Holiday (US)
          </div>
        </div>
      )}
    </div>
  );
}
