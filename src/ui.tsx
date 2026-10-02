import React, { useEffect, useRef, useId, type ReactNode } from "react";
import {
  ArrowUpRight,
  ArrowLeft,
  Plus,
  X,
  Compass,
  MapPin,
  ChevronRight,
  Lock,
  Check,
  Menu,
  CalendarDays,
  Wallet,
  Users,
  House,
  Map,
  Route,
  Sparkles,
  Settings2,
  Clock,
} from "lucide-react";
import { useApp } from "./state";
import { dateText, isActive, member, timeText, type Event } from "./domain";
export const icons = {
  home: House,
  itinerary: Route,
  today: CalendarDays,
  map: Map,
  budget: Wallet,
  people: Users,
  suggestions: Sparkles,
};
export function Button({
  children,
  onClick,
  variant = "",
  type = "button",
  disabled = false,
  ...props
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  [key: string]: any;
}) {
  return (
    <button
      type={type}
      className={`btn ${variant}`}
      disabled={disabled}
      onClick={(e) => {
        if (type !== "submit") e.preventDefault();
        onClick?.();
      }}
      {...props}
    >
      {children}
    </button>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  const control =
    React.isValidElement(children) &&
    typeof children.type === "string" &&
    ["input", "select", "textarea"].includes(children.type)
      ? React.cloneElement(children as React.ReactElement<any>, {
          "aria-label": label,
          "aria-describedby": hint ? id : undefined,
        })
      : children;
  return (
    <label className="field">
      <span>{label}</span>
      {control}
      {hint && <small id={id}>{hint}</small>}
    </label>
  );
}
export function ErrorBox({ text }: { text: string }) {
  return text ? (
    <div className="error" role="alert">
      {text}
    </div>
  ) : null;
}
export function Badge({
  children,
  tone = "",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Avatar({ name, index = 0 }: { name: string; index?: number }) {
  return (
    <span className={`avatar avatar-${index % 4}`} title={name}>
      {name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")}
    </span>
  );
}
export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <Compass size={34} strokeWidth={1.3} />
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}
export function PageHead({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="head-action">{action}</div>}
    </div>
  );
}
export function ReadOnly({ day }: { day?: boolean }) {
  return (
    <div className="permission">
      <Lock size={15} />
      {day
        ? "You can edit your assigned days. Other days are view only."
        : "You have view-only access to the shared itinerary."}
    </div>
  );
}
export function Photo({
  src,
  alt,
  className = "",
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={(e) => {
        e.currentTarget.style.opacity = ".25";
      }}
    />
  );
}
export function EventCard({
  event,
  edit = false,
}: {
  event: Event;
  edit?: boolean;
}) {
  const { go, open } = useApp();
  return (
    <button
      className="event-card"
      onClick={() =>
        edit
          ? go(7, { event: event.id, date: event.date, return: "11" })
          : go(11, { date: event.date, event: event.id })
      }
    >
      <Photo src={event.image} alt={event.place} />
      <div className="event-info">
        <div className="event-time">
          <Clock size={13} />
          {timeText(event.start)} <span>– {timeText(event.end)}</span>
        </div>
        <h3>{event.name}</h3>
        <p>
          <MapPin size={13} />
          {event.place}
        </p>
      </div>
      <ArrowUpRight className="event-arrow" size={19} />
    </button>
  );
}
export function Modal({
  title,
  children,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const { close } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const el = ref.current!;
    const focus = el.querySelector<HTMLElement>("button,input,select,textarea");
    focus?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const nodes = Array.from(
          el.querySelectorAll<HTMLElement>(
            "button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]",
          ),
        );
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={ref}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button
            className="icon-btn"
            aria-label="Close dialog"
            onClick={close}
          >
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
export function Logo() {
  return (
    <span className="logo">
      <span className="logo-icon">
        <Compass size={23} strokeWidth={1.7} />
      </span>
      trip planner<span className="logo-dot">.</span>
    </span>
  );
}
export function Shell({ children }: { children: ReactNode }) {
  const { user, trip, s, route, go, tripGo, open } = useApp();
  const active = trip && isActive(trip, s.date);
  const nav = [
    { p: 8, label: "Itinerary", Icon: Route },
    { p: 10, label: "Today", Icon: CalendarDays },
    { p: 17, label: "Map", Icon: Map },
    { p: 12, label: "Budget", Icon: Wallet },
    { p: 13, label: "The group", Icon: Users },
    { p: 9, label: "Suggestions", Icon: Sparkles },
  ];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand-button" onClick={() => go(4)}>
          <Logo />
        </button>
        <button className="home-link" onClick={() => go(4)}>
          <House size={18} />
          Home
        </button>
        <button
          className="trip-switch"
          onClick={() => open("tripPicker", { target: 8 })}
        >
          <span className="eyebrow">YOUR TRIP</span>
          <strong>{trip?.title || "Choose a trip"}</strong>
          <span>
            {trip
              ? `${dateText(trip.start, true)} – ${dateText(trip.end, true)}`
              : "Find your next adventure"}
            <ChevronRight size={15} />
          </span>
        </button>
        <nav aria-label="Trip navigation">
          {nav
            .filter((n) => n.p !== 10 || active)
            .map(({ p, label, Icon }) => (
              <button
                key={p}
                className={
                  route.page === p || (p === 8 && [7, 11].includes(route.page))
                    ? "active"
                    : ""
                }
                onClick={() => tripGo(p)}
              >
                <Icon size={19} />
                {label}
                {p === 9 && <span className="new-dot" />}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span>Better, together.</span>
            <p>
              A little planning.
              <br />
              More being there.
            </p>
          </div>
          <button className="profile" onClick={() => open("account")}>
            <Avatar name={user?.name || "Guest"} />
            <span>
              <strong>{user?.name || "Guest"}</strong>
              <small>
                {trip ? member(trip, s.userId)?.role : "Your travel space"}
              </small>
            </span>
            <Settings2 size={16} />
          </button>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-btn menu-button"
              aria-label="Open navigation menu"
              onClick={() => open("menu")}
            >
              <Menu size={21} />
            </button>
            <span className="desktop-crumb">
              Your workspace <ChevronRight size={13} />{" "}
              {trip?.destinations[0] || "Make room for a getaway"}
            </span>
            <button className="mobile-brand brand-button" onClick={() => go(4)}>
              <Logo />
            </button>
          </div>
          <div className="topbar-right">
            <button className="prototype-button" onClick={() => open("demo")}>
              Prototype <span className="status-dot" />
            </button>
            {trip && (
              <div className="avatar-stack">
                {trip.members
                  .filter((m) => m.status === "accepted")
                  .slice(0, 4)
                  .map((m, i) => (
                    <Avatar key={m.id} name={m.name} index={i} />
                  ))}
              </div>
            )}
            <button
              className="icon-btn"
              aria-label="Account and preferences"
              onClick={() => open("account")}
            >
              <Users size={18} />
            </button>
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className={`main-content page-${route.page}`}
        >
          {children}
        </main>
        <footer className="app-footer">
          <span>Plans made here stay in this browser.</span>
          <button onClick={() => open("demo")}>
            Demo controls & screen index
          </button>
        </footer>
      </div>
      {trip && (
        <nav className="mobile-nav" aria-label="Mobile navigation">
          <button
            className={[8, 7, 11].includes(route.page) ? "active" : ""}
            onClick={() => go(8)}
          >
            <Route size={19} />
            Itinerary
          </button>
          {active ? (
            <button
              className={route.page === 10 ? "active" : ""}
              onClick={() => go(10)}
            >
              <CalendarDays size={19} />
              Today
            </button>
          ) : (
            <button
              className={route.page === 9 ? "active" : ""}
              onClick={() => go(9)}
            >
              <Sparkles size={19} />
              Ideas
            </button>
          )}
          <button
            className={route.page === 17 ? "active" : ""}
            onClick={() => go(17)}
          >
            <Map size={19} />
            Map
          </button>
          <button onClick={() => open("menu")}>
            <Menu size={19} />
            More
          </button>
        </nav>
      )}
    </div>
  );
}
