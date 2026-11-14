/** Budget and Suggestions omit implementation notes; their real/local behavior is documented in ../IMPLEMENTATION_STATUS.md. Other screens retain their existing notes. */
import React, { useEffect, useRef, useId, useState, type ReactNode } from "react";
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
import { BrandLogo } from "./brand-logo";
import { ADMIN_ACCESS_PAGE, OKR_TRACKERS, okrLabel } from "./okr-trackers";
import { dateText, isActive, itineraryDay, member, timeText, type Event } from "./domain";
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
      data-ui="button"
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
/** Keep keyboard fields in the usable space between recovery and form actions. */
export function revealFocusedFormField(event: React.FocusEvent<HTMLFormElement>): void {
  const target = event.target as HTMLElement;
  const form = event.currentTarget;
  if (!target.matches("input, textarea, select")) return;
  requestAnimationFrame(() => {
    if (!target.isConnected || document.activeElement !== target) return;
    const actions = form.querySelector<HTMLElement>("[data-fixed-actions]");
    const fixedActions = actions && ["fixed", "sticky"].includes(getComputedStyle(actions).position);
    const notice = document.querySelector<HTMLElement>(".trip-recovery-banner");
    const stickyNotice = notice && ["fixed", "sticky"].includes(getComputedStyle(notice).position);
    if (!fixedActions && !stickyNotice) return;
    const bounds = target.getBoundingClientRect();
    const header = document.querySelector(".topbar")?.getBoundingClientRect().bottom ?? 0;
    const top = Math.max(0, header, stickyNotice ? notice.getBoundingClientRect().bottom : 0) + 12;
    const bottom = (fixedActions ? actions.getBoundingClientRect().top : window.innerHeight) - 12;
    if (bounds.top >= top && bounds.bottom <= bottom) return;
    const field = target.closest(".field")?.getBoundingClientRect();
    // Include its label when it fits, and center within the actual unobscured area.
    const visible = field && field.height <= bottom - top ? field : bounds;
    window.scrollBy({top: (visible.top + visible.bottom - top - bottom) / 2, behavior:"instant"});
  });
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
  let lengthError: ReactNode = null;
  // Input-action wrappers (for example, password reveal) still need their hint.
  const labelControl = (node: ReactNode): ReactNode => {
    if (!React.isValidElement(node) || typeof node.type !== "string")
      return node;
    const element = node as React.ReactElement<any>;
    if (["input", "select", "textarea"].includes(node.type)) {
      const max = element.props.maxLength;
      const tooLong = typeof max === "number" && String(element.props.value ?? "").length > max;
      const atLimit = typeof max === "number" && String(element.props.value ?? "").length === max;
      if (tooLong || atLimit)
        lengthError = (
          <small id={`${id}-length-error`}>
            {tooLong ? `Shorten this to ${max.toLocaleString("en-US")} characters or fewer.` : `${max.toLocaleString("en-US")} character limit reached.`}
          </small>
        );
      return React.cloneElement(element, {
        "aria-label": label,
        "aria-describedby":
          [
            element.props["aria-describedby"],
            hint ? id : "",
            tooLong || atLimit ? `${id}-length-error` : "",
          ]
            .filter(Boolean)
            .join(" ") || undefined,
        "aria-invalid":
          tooLong ? true : element.props["aria-invalid"],
      });
    }
    return element.props.children
      ? React.cloneElement(
          element,
          {},
          React.Children.map(element.props.children, labelControl),
        )
      : node;
  };
  const control = labelControl(children);
  return (
    <label className="field" data-ui="field">
      <span>{label}</span>
      {control}
      {hint && <small id={id}>{hint}</small>}
      {lengthError}
    </label>
  );
}
export function ErrorBox({ text }: { text: string }) {
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (text) errorRef.current?.focus();
  }, [text]);
  return text ? (
    <div className="error" role="alert" tabIndex={-1} ref={errorRef}>
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
  return <span className={`badge ${tone}`} data-ui="badge">{children}</span>;
}
/** Shows the account's picture when this id is the signed-in account, otherwise initials. */
export function Avatar({
  name,
  index = 0,
  id,
  large = false,
}: {
  name: string;
  index?: number;
  id?: string;
  large?: boolean;
}) {
  const src = useApp()?.avatarFor(id);
  const [failed, setFailed] = useState("");
  const showImage = Boolean(src) && failed !== src;
  return (
    <span className={`avatar avatar-${index % 4}${large ? " avatar-large" : ""}`} title={name}>
      {showImage ? (
        <img
          src={src}
          alt=""
          // Google photo hosts can reject requests that carry a referrer; initials show if it fails.
          referrerPolicy="no-referrer"
          onError={() => setFailed(src!)}
        />
      ) : (
        name
          .split(" ")
          .map((n) => n[0])
          .slice(0, 2)
          .join("")
      )}
    </span>
  );
}
export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty" data-ui="empty">
      <Compass size={34} strokeWidth={1.3} />
      <h3>{title}</h3>
      {body && <p>{body}</p>}
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
    <div className="page-head" data-ui="page-heading">
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
  optional = false,
}: {
  src: string;
  alt: string;
  className?: string;
  optional?: boolean;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  if (optional && (!src.trim() || failedSource === src)) return null;
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={(e) => {
        if (optional) setFailedSource(src);
        else e.currentTarget.style.opacity = ".25";
      }}
    />
  );
}
export function PhotoCredit({ credit, compact = false }: { credit?: { name: string; profileUrl: string; photoUrl: string }; compact?: boolean }) {
  if (!credit) return null;
  return <span className="photo-credit">Photo by <a href={credit.profileUrl} target="_blank" rel="noreferrer">{credit.name}</a>{!compact && <> on <a href={credit.photoUrl} target="_blank" rel="noreferrer">Unsplash</a></>}</span>;
}
export function EventCard({
  event,
  id,
  edit = false,
  onSelect,
  selected,
}: {
  event: Event;
  id?: string;
  edit?: boolean;
  onSelect?: () => void;
  selected?: boolean;
}) {
  const { go, open } = useApp();
  return (
    <button
      className="event-card"
      id={id}
      aria-expanded={onSelect ? !!selected : undefined}
      aria-label={onSelect ? `Show ${event.name} on map` : undefined}
      onClick={() =>
        onSelect ? onSelect() : edit
          ? go(7, { event: event.id, date: event.date, return: "11" })
          : go(11, { date: event.date, event: event.id })
      }
    >
      <Photo src={event.image} alt={event.place} optional />
      <div className="event-info">
        <div className="event-time">
          <Clock size={13} />
          <span>{timeText(event.start)} – {timeText(event.end)}</span>
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
  className = "",
  onClose,
  footer,
  navigation,
}: {
  title: string;
  children: ReactNode;
  wide?: boolean;
  className?: string;
  onClose?: () => void;
  footer?: ReactNode;
  navigation?: ReactNode;
}) {
  const { close: closeOverlay } = useApp();
  const close = onClose ?? closeOverlay;
  const ref = useRef<HTMLDivElement>(null);
  // React autoFocus runs during the DOM commit, before effects. Capture the
  // opener while rendering so an autofocus field cannot become its own return target.
  const opener = useRef(document.activeElement as HTMLElement);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const previous = opener.current;
    const openedOnRoute = location.hash;
    const el = ref.current!;
    // Include notices outside the shell, while preserving any existing inert state.
    const background = new globalThis.Map<HTMLElement, boolean>();
    let branch: HTMLElement = el.parentElement!;
    while (branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling instanceof HTMLElement && sibling !== branch) {
          background.set(sibling, sibling.inert);
          sibling.inert = true;
        }
      }
      if (branch.parentElement === document.body) break;
      branch = branch.parentElement;
    }
    const available = (node: HTMLElement): boolean =>
      !node.matches(":disabled") && !node.closest('[hidden], [inert], [aria-hidden="true"]') &&
      node.getClientRects().length > 0 && getComputedStyle(node).visibility !== "hidden";
    const focusable = (): HTMLElement[] => {
      const nodes = Array.from(el.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, a[href], summary, [tabindex], [contenteditable="true"]',
      )).filter(node => node.tabIndex >= 0 && available(node));
      // A radio group contributes one Tab stop, matching native browser behavior.
      return nodes.filter(node => {
        if (!(node instanceof HTMLInputElement) || node.type !== "radio" || !node.name) return true;
        const group = nodes.filter((other): other is HTMLInputElement =>
          other instanceof HTMLInputElement && other.type === "radio" &&
          other.name === node.name && other.form === node.form);
        return node === (group.find(other => other.checked) || group[0]);
      }).sort((a, b) => (a.tabIndex || Infinity) - (b.tabIndex || Infinity));
    };
    const focusFirst = () => (focusable()[0] || el).focus();
    focusFirst();
    const keepFocusInside = () => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || !el.contains(active) || !available(active)) focusFirst();
    };
    const onKey = (e: KeyboardEvent) => {
      // A child popup can consume Escape before the enclosing dialog handles it.
      if (e.defaultPrevented) return;
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      }
      if (e.key === "Tab") {
        const nodes = focusable();
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        const active = document.activeElement;
        if (!nodes.length) {
          e.preventDefault();
          el.focus();
        } else if (!nodes.includes(active as HTMLElement)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        } else if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", keepFocusInside);
    // Async saves and expanded forms can remove, hide, or disable the focused control.
    const observer = new MutationObserver(keepFocusInside);
    observer.observe(el, { childList: true, subtree: true, attributes: true,
      attributeFilter: ["disabled", "hidden", "inert", "aria-hidden", "class", "style", "open"] });
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", keepFocusInside);
      document.body.style.overflow = old;
      background.forEach((inert, node) => (node.inert = inert));
      // Navigating away should keep focus in the new page, not the old opener.
      if (location.hash === openedOnRoute && previous?.isConnected && available(previous))
        previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          // The backdrop disappears on close; its default focus would undo restoration.
          e.preventDefault();
          close();
        }
      }}
    >
      <div
        ref={ref}
        className={`modal ${wide ? "wide" : ""} ${className}`.trim()}
        data-ui="dialog"
        tabIndex={-1}
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
        {navigation && <div className="modal-navigation">{navigation}</div>}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
/** Shared, non-submitting confirmation actions; closing always keeps the current work. */
export function ConfirmDialog({ title, children, cancelLabel = "Keep editing", confirmLabel = "Discard changes", onCancel, onConfirm }: {
  title: string;
  children: ReactNode;
  cancelLabel?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return <Modal title={title} onClose={onCancel} footer={<div className="confirmation-actions">
    <Button type="button" variant="outline" onClick={onCancel}>{cancelLabel}</Button>
    <Button type="button" variant="danger" onClick={onConfirm}>{confirmLabel}</Button>
  </div>}>
    <p>{children}</p>
  </Modal>;
}

export function Logo() {
  return (
    <span className="logo">
      <span className="logo-icon">
        <Compass size={23} strokeWidth={1.7} />
      </span>
      trip planner
    </span>
  );
}

/** Parent links follow the screen hierarchy, even after a refresh or direct visit. */
function Breadcrumbs() {
  const { route, trip, s } = useApp();
  const trail = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = trail.current;
    if (!element) return;
    let active = true;
    const updateOverflow = () => {
      element.toggleAttribute('data-more-before', element.scrollLeft > 1);
      element.toggleAttribute('data-more-after', element.scrollLeft + element.clientWidth < element.scrollWidth - 1);
    };
    const revealCurrent = () => {
      if (active && window.innerWidth <= 760) {
        const focused = document.activeElement;
        if (focused instanceof HTMLAnchorElement && element.contains(focused))
          focused.scrollIntoView({ block: 'nearest', inline: 'center' });
        else element.scrollLeft = element.scrollWidth;
      }
      if (active) updateOverflow();
    };
    revealCurrent();
    // Font loading and resizing can widen the trail after the first route render.
    void document.fonts.ready.then(revealCurrent);
    const observer = new ResizeObserver(revealCurrent);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    element.addEventListener('scroll', updateOverflow, { passive: true });
    return () => { active = false; observer.disconnect(); element.removeEventListener('scroll', updateOverflow); };
  }, [route.page, route.params.toString()]);
  const page = route.page;
  const crumbs: { label: string; href: string }[] = [
    { label: "Home", href: "#/4" },
  ];
  const add = (label: string, target: number, params?: Record<string, string>) =>
    crumbs.push({
      label,
      href: `#/${target}${params ? `?${new URLSearchParams(params)}` : ""}`,
    });
  const tripPage = [7, 8, 9, 10, 11, 12, 13, 15, 16, 17].includes(page);
  const editingTrip = page === 6 && route.params.get("edit") === "true" && trip;

  if (page === 19) {
    add("Account", 19);
  } else if (page >= 20 && page <= 25) {
    add("Account", 19);
    add("Admin", 20);
    const tracker = OKR_TRACKERS.find((entry) => entry.page === page);
    if (tracker) add(okrLabel(tracker.owner), page);
    else if (page === ADMIN_ACCESS_PAGE) add("Admin access", page);
  } else if (page === 2 || page === 3) {
    add("Connected accounts", 2);
    if (page === 3) add(route.params.get("service") || "Connect provider", 3);
  } else if (page === 5 || page === 6 || tripPage) {
    add("My trips", 5);
    if (trip && (tripPage || editingTrip)) {
      add(trip.title, 8);
      if (page === 7 || page === 11) {
        const requested = route.params.get("date");
        const date = itineraryDay(trip, route.params.get("event"), requested, page === 11 ? s.date : trip.start);
        if (page === 11 || route.params.get("return") === "11")
          add(dateText(date, true), 11, { date });
        if (page === 7)
          add(route.params.has("event") ? "Edit event" : "Add event", 7);
      } else if (page === 15) {
        add("The group", 13);
        add("My preferences", 15);
      } else if (page === 16) {
        add("Today", 10);
        add("Nearby", 16);
      } else {
        const sections: Record<number, string> = {
          9: "Suggestions", 10: "Today", 12: "Budget", 13: "The group", 17: "Map",
        };
        if (sections[page]) add(sections[page], page);
      }
    } else if (tripPage) {
      add("Choose a trip", page);
    }
    if (page === 6) add(editingTrip ? "Edit trip" : "Create trip", 6);
  }

  return (
    <nav ref={trail} className="breadcrumbs" aria-label="Breadcrumb" onFocusCapture={event => {
      if (event.target instanceof HTMLAnchorElement && window.innerWidth <= 760)
        event.target.scrollIntoView({ block: 'nearest', inline: 'center' });
    }}>
      <ol>
        {crumbs.map((crumb, index) => (
          <li key={`${index}-${crumb.href}`}>
            {index > 0 && <ChevronRight size={13} aria-hidden="true" />}
            {index === crumbs.length - 1 ? (
              <span aria-current="page" title={crumb.label}>{page === 8 ? "Itinerary" : crumb.label}</span>
            ) : (
              <a href={crumb.href} title={crumb.label} aria-label={crumb.label}>
                {crumb.href === "#/8" ? <>
                  <span className="breadcrumb-trip-label">{crumb.label}</span>
                  <span className="breadcrumb-trip-short" aria-hidden="true">Trip</span>
                </> : crumb.label}
              </a>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
export function Shell({ children }: { children: ReactNode }) {
  const { user, trip, s, route, go, tripGo, open, returnFromSample, accountInfo, signOut, recoveryNotice } = useApp();
  const active = trip && isActive(trip, s.date);
  const tripContextTarget = [8, 9, 10, 11, 12, 13, 17].includes(route.page) ? route.page : 8;
  const nav = [
    { p: 8, label: "Itinerary", Icon: Route },
    { p: 10, label: "Today", Icon: CalendarDays },
    { p: 17, label: "Map", Icon: Map },
    { p: 12, label: "Budget", Icon: Wallet },
    { p: 13, label: "The group", Icon: Users },
    { p: 9, label: "Suggestions", Icon: Sparkles },
  ];
  return (
    <div className={`app-shell${route.page === 12 ? " budget-shell" : ""}`}>
      <aside className="sidebar">
        <button className="brand-button" onClick={() => go(4)} aria-label="Stir Crazy home">
          <BrandLogo />
        </button>
        <button
          className={`home-link${route.page === 4 ? " active" : ""}`}
          aria-current={route.page === 4 ? "page" : undefined}
          onClick={() => go(4)}
        >
          <House size={18} />
          Home
        </button>
        <button
          className="trip-switch"
          onClick={() => open("tripPicker", { target: tripContextTarget, activeOnly: tripContextTarget === 10 })}
        >
          <span className="eyebrow">{trip?.sample ? "SAMPLE TRIP" : "YOUR TRIP"}</span>
          <strong title={trip?.title}>{trip?.title || "Choose a trip"}</strong>
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
                aria-current={
                  route.page === p || (p === 8 && [7, 11].includes(route.page))
                    ? "page"
                    : undefined
                }
                className={
                  route.page === p || (p === 8 && [7, 11].includes(route.page))
                    ? "active"
                    : ""
                }
                onClick={() => tripGo(p)}
              >
                <Icon size={19} />
                {label}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="profile" onClick={() => go(19)}>
            <Avatar name={user?.name || "Guest"} id={user?.id} />
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
        {trip && (
          <button
            className="mobile-trip-context"
            onClick={() => open("tripPicker", { target: tripContextTarget, activeOnly: tripContextTarget === 10 })}
            aria-label={`Switch trip: ${trip.title}`}
          >
            <span>
              <MapPin size={14} />
              <strong>{trip.sample && <span className="sample-context-label">Sample · </span>}{trip.title}</strong>
            </span>
            <ChevronRight size={16} />
          </button>
        )}
            <Breadcrumbs />
          </div>
          <div className="topbar-right">
            {!accountInfo.cloud && <button className="demo-exit" aria-label="Exit demo" onClick={() => void signOut()}>Exit demo</button>}
            <button className="prototype-button" aria-label="Prototype" title="Prototype controls" onClick={() => open("demo")}>
              <Settings2 className="prototype-mobile-icon" size={18}/><span className="prototype-label">Prototype</span> <span className="status-dot" />
            </button>
            {trip && (() => {
              // The signed-in person is the picture button on the right, so only show the others here.
              const others = trip.members.filter(
                (m) => m.status === "accepted" && m.id !== s.userId && m.accountId !== s.userId,
              );
              return others.length > 0 ? (
                <div className="avatar-stack">
                  {others.slice(0, 4).map((m, i) => (
                    <Avatar key={m.id} name={m.name} index={i} id={m.accountId || m.id} />
                  ))}
                </div>
              ) : null;
            })()}
            <button
              className="account-button"
              aria-label="Account and preferences"
              aria-current={route.page === 19 ? "page" : undefined}
              onClick={() => go(19)}
            >
              <Avatar name={user?.name || "Guest"} id={user?.id} />
            </button>
          </div>
        </header>
        {recoveryNotice}
        <main
          id="main-content"
          tabIndex={-1}
          className={`main-content page-${route.page}`}
        >
          {s.sampleReturn && (
            <div className="sample-return info-banner">
              <Compass size={20} />
              <span>
                You’re exploring the fictional group. Your own trips are saved.
              </span>
              <Button variant="outline small" onClick={returnFromSample}>
                Back to my trips <ArrowLeft size={15} />
              </Button>
            </div>
          )}
          {children}
        </main>
      </div>
      {trip && ![2, 3, 6, 18].includes(route.page) && (
        <nav className="mobile-nav" aria-label="Mobile navigation">
          <button
            aria-current={[8, 7, 11].includes(route.page) ? "page" : undefined}
            className={[8, 7, 11].includes(route.page) ? "active" : ""}
            onClick={() => go(8)}
          >
            <Route size={19} />
            Itinerary
          </button>
          {active ? (
            <button
              aria-current={route.page === 10 ? "page" : undefined}
              className={route.page === 10 ? "active" : ""}
              onClick={() => go(10)}
            >
              <CalendarDays size={19} />
              Today
            </button>
          ) : (
            <button
              aria-current={route.page === 9 ? "page" : undefined}
              className={route.page === 9 ? "active" : ""}
              onClick={() => go(9)}
            >
              <Sparkles size={19} />
              Suggestions
            </button>
          )}
          <button
            aria-current={route.page === 17 ? "page" : undefined}
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
