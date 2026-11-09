import { RecipientField, useRecipients } from "./recipient-field";
import { DatePicker } from "./date-picker";
import { DestinationInput } from "./destination-input";
/** Implementation status: Real account trip forms persist the complete trip through saveTrip. Standalone demo trips remain browser-local; account invitations run after the trip save succeeds. See ../IMPLEMENTATION_STATUS.md. */
import {
  TEXT_LIMITS,
  MAX_DESTINATIONS,
  textError,
  emailError,
} from "./limits.ts";
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Plus,
  MapPin,
  Check,
  ChevronRight,
  ChevronLeft,
  Pause,
  Play,
  Link2,
  Mail,
  CalendarDays,
  X,
  Compass,
  Eye,
  EyeOff,
  Trash2,
  ImagePlus,
} from "lucide-react";
import { tripDetailsError } from "./account-trips";
import { useApp } from "./state";
import { ImportedBookings } from "./imported-bookings";
import {
  Badge,
  Button,
  Empty,
  ErrorBox,
  Field,
  Logo,
  PageHead,
  Photo,
  PhotoCredit,
  Avatar,
} from "./ui";
import { HERO_IMAGE, HERO_ALT } from "./hero";
import { IMAGES, SERVICES, PERMISSIONS } from "./data";
import { PREPLANNED_TRIPS, plannedTrip } from "./preplanned-trips";
import { searchDestinationPhotos, trackUnsplashSelection, uploadTripPhoto, type UnsplashPhoto } from "./trip-photos";
import { destinationTimeZone, timeZoneLabel } from "./destination-timezones";
import {
  uid,
  days,
  dateText,
  isOwner,
  member,
  isActive,
  type Trip,
  type User,
} from "./domain";
const PREPLANNED_CARD_WIDTH = 360;
const PREPLANNED_CARD_GAP = 20;
const PREPLANNED_CARD_STEP = PREPLANNED_CARD_WIDTH + PREPLANNED_CARD_GAP;
export function Auth() {
  const { s, mutate, go, open, login, explore, toast } = useApp();
  const [signup, setSignup] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [showPassword, setShowPassword] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const beginSignup = () => {
    setSignup(true);
    setError("");
    requestAnimationFrame(() => nameInput.current?.focus());
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const problem =
      (signup ? textError(name, "Your name", TEXT_LIMITS.name, true) : "") ||
      emailError(email);
    if (problem) {
      setError(problem);
      return;
    }
    const existing = s.users.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase(),
    );
    if (!signup) {
      if (!existing) {
        setError(
          "We don’t recognize that email. Create a fictional account to continue.",
        );
        return;
      }
      if (password !== "travel123") {
        setError(
          "That password doesn’t match this email. For this demo, use travel123.",
        );
        return;
      }
    } else if (existing) {
      setError(
        "This fictional account already exists. Switch to Log in and use travel123.",
      );
      return;
    } else if (password.length < 8) {
      setError("Use at least 8 characters for the demo password.");
      return;
    }
    setBusy(true);
    setTimeout(() => {
      if (signup) {
        const id = uid();
        mutate((v) => {
          v.users.push({
            id,
            name: name.trim() || "New traveler",
            email: email.trim().toLowerCase(),
            connections: {},
          });
          v.userId = id;
          v.tripId = null;
          v.trips.forEach((t) =>
            t.members.forEach((m) => {
              if (m.email.toLowerCase() === email.trim().toLowerCase())
                m.id = id;
            }),
          );
        });
        go(2);
      } else login(existing!.id);
      setBusy(false);
    }, 450);
  };
  return (
    <div className="auth">
      <div className="auth-visual">
        <Photo
          src={HERO_IMAGE}
          alt={HERO_ALT}
        />
        <div className="auth-visual-shade" />
        <Logo />
        <div className="auth-story">
          <h1>The world is huge, go out and explore it.</h1>
          <p>All your plans, in one place.</p>
        </div>
        <div className="auth-caption">
          A place for every plan. And everyone in it.
        </div>
      </div>
      <div className="auth-panel" id="main-content" tabIndex={-1}>
        <div className="auth-mobile-logo">
          <Logo />
        </div>
        <div className="auth-top">
          <Badge>INTERACTIVE PROTOTYPE</Badge>
          <button className="text-link" onClick={() => open("demo")}>
            Explore the screens <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="auth-form-wrap">
          <div className="eyebrow">YOUR NEXT CHAPTER</div>
          <h2>
            {signup ? "Start something good." : "Your next trip starts here."}
          </h2>
          <p>
            {signup
              ? "Create a fictional account to try planning a trip."
              : "A little planning. More time together."}
          </p>
          {!signup && (
            <div className="auth-demo quick-start">
              <div>
                <Compass size={19} />
                <strong>First time here?</strong>
              </div>
              <p>
                Try a ready-made Seattle getaway, or make a trip of your own.
              </p>
              <Button variant="full" onClick={beginSignup}>
                Start a new trip <ArrowRight size={16} />
              </Button>
              <Button variant="outline full" onClick={explore}>
                Explore the sample trip <ArrowUpRight size={16} />
              </Button>
              <small>No real account or connections needed.</small>
            </div>
          )}
          <p className="auth-signin-label">
            {signup ? "Choose how to join" : "Already tried it? Sign in below."}
          </p>
          <div className="provider-buttons">
            <Button
              variant="outline"
              onClick={() =>
                open("authProvider", { service: "Google", signup })
              }
            >
              <span className="provider-letter" aria-hidden="true">
                G
              </span>
              Continue with Google
            </Button>
            <Button
              variant="outline"
              onClick={() => open("authProvider", { service: "Apple", signup })}
            >
              <span className="apple-mark" aria-hidden="true">
                ●
              </span>
              Continue with Apple
            </Button>
          </div>
          <div className="divider">
            <span>or with email</span>
          </div>
          <form onSubmit={submit}>
            {signup && (
              <Field label="Your fictional name">
                <input
                  ref={nameInput}
                  autoComplete="off"
                  required
                  maxLength={TEXT_LIMITS.name}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Morgan"
                />
              </Field>
            )}
            <Field label="Email">
              <input
                required
                type="email"
                autoComplete="off"
                maxLength={TEXT_LIMITS.email}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </Field>
            <Field
              label="Password"
              hint={
                signup
                  ? "Use any fictional password with 8+ characters. To return later, use travel123."
                  : "For every demo account, the password is travel123."
              }
            >
              <div className="password-control">
                <input
                  aria-label="Password"
                  required
                  type={showPassword ? "text" : "password"}
                  autoComplete="off"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your demo password"
                />
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </Field>
            <ErrorBox text={error} />
            <Button type="submit" variant="full" disabled={busy}>
              {busy ? "Just a moment…" : signup ? "Create account" : "Log in"}
              <ArrowRight size={17} />
            </Button>
          </form>
          <button
            className="auth-toggle"
            onClick={() => {
              setSignup(!signup);
              setError("");
            }}
          >
            {signup
              ? "Already have an account? Log in"
              : "New here? Create an Account"}
          </button>
          <p className="fine-print">
            Use fictional details only. Demo login:{" "}
            <button
              className="inline-link"
              onClick={() => {
                setEmail("maya@example.com");
                setPassword("travel123");
                setSignup(false);
              }}
            >
              maya@example.com / travel123
            </button>
            <br />
            Nothing is sent, charged, or connected to a real account.
          </p>
        </div>
        <div className="auth-footer">Thoughtfully planned. Happily shared.</div>
      </div>
    </div>
  );
}
export function Connections() {
  const { user, s, go, open } = useApp();
  return (
    <div className="narrow-page">
      <PageHead
        eyebrow="OPTIONAL SETUP"
        title="Bring your inspiration along."
        description="Connect what’s useful. You can still plan a great trip without connecting anything."
      />
      <div className="info-banner">
        <Link2 size={18} />
        <span>
          These connections are simulated. Signing in with Google grants
          identity access only, not Gmail or social content.
        </span>
      </div>
      <div className="connection-list">
        {SERVICES.map((service, i) => {
          const granted = user?.connections[service] || [],
            all = PERMISSIONS(service);
          return (
            <div className="connection-card" key={service}>
              <div className={`service-logo service-${i}`}>
                {service === "Gmail" ? <Mail size={22} /> : service.slice(0, 1)}
              </div>
              <div className="connection-info">
                <div className="row">
                  <h3>{service}</h3>
                  <Badge tone={granted.length === all.length ? "green" : ""}>
                    {granted.length === all.length
                      ? "Connected"
                      : granted.length
                        ? "Partial access"
                        : "Not connected"}
                  </Badge>
                </div>
                {all.map((p) => (
                  <p className="permission-line" key={p}>
                    <span className={granted.includes(p) ? "granted" : ""}>
                      {granted.includes(p) ? (
                        <Check size={14} />
                      ) : (
                        <span className="small-circle" />
                      )}
                    </span>
                    {p}
                    <small>
                      {granted.includes(p) ? "Granted" : "Optional"}
                    </small>
                  </p>
                ))}
              </div>
              <Button variant="outline" onClick={() => go(3, { service })}>
                {granted.length ? "Review" : "Connect"}
              </Button>
            </div>
          );
        })}
      </div>
      <p className="fine-print">
        Social permissions are conceptual demo permissions. Gmail read access
        covers messages and settings; the demo uses fictional receipts only.
      </p>
      <div className="form-actions">
        <Button variant="text" onClick={() => open("skip")}>
          Skip for now
        </Button>
        <Button
          onClick={() =>
            go(
              s.trips.some((t) =>
                t.members.some(
                  (m) => m.id === s.userId && m.status === "pending",
                ),
              )
                ? 5
                : 4,
            )
          }
        >
          Continue <ArrowRight size={16} />
        </Button>
      </div>
    </div>
  );
}
export function ConnectProvider() {
  const { user, route, mutate, go, toast } = useApp();
  const service = route.params.get("service") || "Gmail",
    permissions = PERMISSIONS(service);
  const [selected, setSelected] = useState<string[]>(
      user?.connections[service] || permissions,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const finish = (fail = false) => {
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      if (fail) {
        setError(
          "The provider could not connect. Your existing permissions are unchanged. Retry or cancel.",
        );
        return;
      }
      mutate((v) => {
        v.users.find((u) => u.id === v.userId)!.connections[service] = selected;
      });
      toast(
        `${service}: ${selected.length ? "demo permissions updated" : "no access granted"}.`,
      );
      go(2);
    }, 650);
  };
  return (
    <div className="consent-page">
      <Badge>SIMULATED AUTHORIZATION</Badge>
      <div className="consent-brand">{service.slice(0, 1)}</div>
      <h1>Connect {service}</h1>
      <p>
        Stir Crazy would like the following access for
        <br />
        <strong>{user?.email}</strong>
      </p>
      <div className="card consent-list">
        {permissions.map((p) => (
          <label className="check-row" key={p}>
            <input
              type="checkbox"
              checked={selected.includes(p)}
              onChange={(e) =>
                setSelected(
                  e.target.checked
                    ? [...selected, p]
                    : selected.filter((x) => x !== p),
                )
              }
            />
            <span>
              {p}
              <small>
                {service === "Gmail"
                  ? "Fictional receipt matching. No sending or deleting email."
                  : "Fictional inspiration for your trip suggestions."}
              </small>
            </span>
          </label>
        ))}
      </div>
      <p className="fine-print">
        No account is accessed. These controls only update this prototype.
      </p>
      <ErrorBox text={error} />
      <div className="form-actions">
        <Button
          variant="outline"
          onClick={() => {
            toast("Connection canceled. No new access granted.");
            go(2);
          }}
        >
          Cancel
        </Button>
        <Button disabled={busy} onClick={() => finish()}>
          {busy ? "Connecting…" : "Allow selected access"}
        </Button>
      </div>
      <button
        className="text-link centered"
        disabled={busy}
        onClick={() => finish(true)}
      >
        Try unsuccessful connection
      </button>
    </div>
  );
}
export function Home() {
  const { go, explore, open, overlay, accountTrips } = useApp();
  const [carouselPosition, setCarouselPosition] = useState(1);
  const [trackAnimating, setTrackAnimating] = useState(true);
  const [visibleCardCount, setVisibleCardCount] = useState(3);
  const carouselWindow = useRef<HTMLDivElement>(null);
  const [carouselPaused, setCarouselPaused] = useState(false);
  const tripSequence = [PREPLANNED_TRIPS[PREPLANNED_TRIPS.length - 1], ...PREPLANNED_TRIPS, ...PREPLANNED_TRIPS.slice(0, 3)];
  const logicalIndex = (carouselPosition - 1 + PREPLANNED_TRIPS.length) % PREPLANNED_TRIPS.length;
  useEffect(() => {
    if (carouselPaused || overlay || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setCarouselPosition(index => index + 1);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [carouselPaused, overlay]);
  useEffect(() => {
    const element = carouselWindow.current;
    if (!element) return;
    const updateVisibleCount = () => setVisibleCardCount(Math.max(1, Math.min(3, Math.floor((element.clientWidth + PREPLANNED_CARD_GAP) / PREPLANNED_CARD_STEP))));
    updateVisibleCount();
    const observer = new ResizeObserver(updateVisibleCount);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const moveCarousel = (direction: number) => {
    setCarouselPaused(true);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCarouselPosition(index => direction > 0
        ? (index >= PREPLANNED_TRIPS.length ? 1 : index + 1)
        : (index <= 1 ? PREPLANNED_TRIPS.length : index - 1));
    } else {
      setCarouselPosition(index => Math.max(0, Math.min(PREPLANNED_TRIPS.length + 1, index + direction)));
    }
  };
  const settleCarouselLoop = (event: React.TransitionEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const loopForward = carouselPosition === PREPLANNED_TRIPS.length + 1;
    const loopBackward = carouselPosition === 0;
    if (!loopForward && !loopBackward) return;
    setTrackAnimating(false);
    setCarouselPosition(loopForward ? 1 : PREPLANNED_TRIPS.length);
    requestAnimationFrame(() => requestAnimationFrame(() => setTrackAnimating(true)));
  };
  return (
    <>
      <PageHead title="Home" />
      <div className="home-actions">
        <Button onClick={() => go(6)}>
          <Plus size={20} />
          New Trip
          <ArrowRight className="push" size={18} />
        </Button>
        <Button variant="outline" onClick={() => go(5)}>
          Open existing trip
          <ArrowRight className="push" size={18} />
        </Button>
      </div>
      <div className="sample-feature">
        <div>
          <Badge tone="green">Sample trip</Badge>
          <h2>Seattle & Bainbridge Island</h2>
          <p>
            Preview a sample itinerary, budget, and traveler preferences.
          </p>
          <Button variant="light" onClick={explore}>
            Open the sample trip <ArrowUpRight size={16} />
          </Button>
        </div>
        <Photo src={IMAGES.seattle} alt="Seattle skyline" />
      </div>
      {accountTrips && <ImportedBookings />}
      <div className="section-title">
        <div>
          <h2>Pre-planned trips</h2>
          <p>Choose a starting point. You can adjust the plan and dates when you add it.</p>
        </div>
        <span className="muted">Illustrative estimates per person</span>
      </div>
      <div className="planned-carousel" role="region" aria-roledescription="carousel" aria-label="Pre-planned trip carousel">
        <div className="planned-carousel-controls">
          <span className="muted">Trip {logicalIndex + 1} of {PREPLANNED_TRIPS.length}</span>
          <div>
            <button type="button" className="icon-btn" aria-label="Previous trips" onClick={() => moveCarousel(-1)}><ChevronLeft size={19} /></button>
            <button type="button" className="icon-btn" aria-label="Next trips" onClick={() => moveCarousel(1)}><ChevronRight size={19} /></button>
            <button type="button" className="carousel-pause" aria-pressed={carouselPaused} onClick={() => setCarouselPaused(paused => !paused)}>
              {carouselPaused ? <Play size={15} /> : <Pause size={15} />}
              {carouselPaused ? "Resume" : "Pause"} rotation
            </button>
          </div>
        </div>
        <div className="planned-carousel-window" ref={carouselWindow}>
          <div
            className={`planned-track ${trackAnimating ? "" : "without-transition"}`}
            style={{ transform: `translate3d(-${carouselPosition * PREPLANNED_CARD_STEP}px, 0, 0)` }}
            onTransitionEnd={settleCarouselLoop}
          >
            {tripSequence.map((planned, sequenceIndex) => {
              const isVisible = sequenceIndex >= carouselPosition && sequenceIndex < carouselPosition + visibleCardCount;
              return (
                <button
                  type="button"
                  className="destination-card planned-trip-card"
                  key={`${planned.id}-${sequenceIndex}`}
                  aria-hidden={!isVisible}
                  tabIndex={isVisible ? 0 : -1}
                  onClick={() => open("plannedTrip", { id: planned.id })}
                >
                  <Photo src={planned.image} alt={`${planned.destinations[0]} trip`} />
                  <span className="planned-card-copy">
                    <span className="planned-card-destination">{planned.destinations.join(" · ")}</span>
                    <strong className="planned-card-title">{planned.title}</strong>
                    <span className="planned-card-meta"><strong>${planned.estimate}</strong> / person <span>{planned.days} days</span></span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
const dateAfter = (iso: string, offset: number) => {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};
export function Trips() {
  const { s, user, mutate, go, open, route, pendingTripIds } = useApp();
  const [filter, setFilter] = useState("All");
  const trips = s.trips.filter((t) => member(t, s.userId));
  const visibleTrips = trips.filter(
    (t) =>
      filter === "All" ||
      (filter === "Past"
        ? t.end < s.date
        : filter === "Active"
          ? isActive(t, s.date)
          : t.start > s.date),
  );
  const pending = s.trips.filter((t) =>
    t.members.some((m) => m.id === s.userId && m.status === "pending"),
  );
  return (
    <>
      <PageHead
        eyebrow="YOUR TRAVEL COLLECTION"
        title="A good trip stays with you."
        description="The plans ahead, and the places you’ve been."
        action={
          <Button onClick={() => go(6)}>
            <Plus size={17} />
            New trip
          </Button>
        }
      />
      {route.params.get("created") &&
        trips.some((t) => t.id === route.params.get("created")) && (
          <div className="info-banner success-banner" role="status">
            <Check size={20} />
            <span>
              <strong>Your trip is ready.</strong> Open its itinerary below to
              start planning.
            </span>
          </div>
        )}
      {pending.map((t) => (
        <div className="info-banner" key={t.id}>
          <Mail size={20} />
          <span>
            You’re invited to <strong>{t.title}</strong>
          </span>
          <Button
            variant="small"
            onClick={() =>
              open("invitation", { tripId: t.id, userId: s.userId })
            }
          >
            Review invitation
          </Button>
        </div>
      ))}
      <div className="tabs">
        {["All", "Upcoming", "Active", "Past"].map((f) => (
          <button
            key={f}
            aria-pressed={filter === f}
            className={filter === f ? "active" : ""}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="trip-grid">
        {visibleTrips.map((t) => (
          <article className="trip-card" key={t.id}>
            <button
              className="trip-photo"
              onClick={() => {
                mutate((v) => (v.tripId = t.id));
                go(8);
              }}
            >
              <Photo src={t.image} alt={t.destinations[0]} />
              <Badge tone="white">
                {t.end < s.date
                  ? "Past trip"
                  : isActive(t, s.date)
                    ? "Happening now"
                    : "On the horizon"}
              </Badge>
            </button>
            <PhotoCredit credit={t.imageCredit} />
            <div className="trip-card-body">
              <div className="eyebrow">
                {dateText(t.start, true)} – {dateText(t.end, true)} ·{" "}
                {member(t, s.userId)?.role}
              </div>
              <h2>
                <button
                  onClick={() => {
                    mutate((v) => (v.tripId = t.id));
                    go(8);
                  }}
                >
                  {t.title}
                </button>
              </h2>
              <p className="fine-print">
                {pendingTripIds.includes(t.id)
                  ? "Not saved yet"
                  : t.persistence === "account"
                    ? "Saved to your account"
                    : "Saved in this browser"}
              </p>
              <p>
                <MapPin size={14} />
                {t.destinations.join(" · ")}
              </p>
              <div className="row trip-bottom">
                <Button
                  variant="text"
                  onClick={() => {
                    mutate((v) => (v.tripId = t.id));
                    go(8);
                  }}
                >
                  Open itinerary <ArrowRight size={15} />
                </Button>
                <Button
                  variant="outline small"
                  onClick={() => {
                    mutate((v) => (v.tripId = t.id));
                    go(7, {
                      date:
                        member(t, s.userId)?.role === "Day Editor"
                          ? member(t, s.userId)!.days[0] || t.start
                          : t.start,
                    });
                  }}
                >
                  <Plus size={14} />
                  Add event
                </Button>
              </div>
              {isOwner(t, s.userId) && !t.sample && (
                <Button
                  variant="text danger small"
                  aria-label={`Delete trip: ${t.title}`}
                  onClick={() => open("deleteTrip", { tripId: t.id })}
                >
                  <Trash2 size={14} /> Delete trip
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
      {!!trips.length && !visibleTrips.length && (
        <Empty
          title={`No ${filter.toLowerCase()} trips right now.`}
          body="Your other trips are still here. Show them all or start planning something new."
          action={
            <Button variant="outline" onClick={() => setFilter("All")}>
              Show all trips
            </Button>
          }
        />
      )}
      {!trips.length && (
        <Empty
          title="Your first trip is waiting."
          body="Create a trip and start with a clean slate, or explore the sample from Home."
          action={<Button onClick={() => go(6)}>Create a trip</Button>}
        />
      )}
    </>
  );
}
export function TripForm() {
  const { s, user, trip, route, saveTrip, invite, accountTrips, go, toast, open } =
    useApp();
  const draftId = useRef(uid());
  const saving = useRef(false);
  const editing = route.params.get("edit") === "true" && trip;
  const original = editing ? trip : undefined;
  const template = original ? undefined : plannedTrip(route.params.get("template"));
  const [title, setTitle] = useState(original?.title || template?.title || ""),
    [locations, setLocations] = useState<string[]>(
      original?.destinations || template?.destinations || [],
    ),
    [place, setPlace] = useState(""),
    [start, setStart] = useState(original?.start || ""),
    [end, setEnd] = useState(original?.end || ""),
    [zone, setZone] = useState(original?.zone || "America/Los_Angeles"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const recipients = useRecipients();
  const [savedId, setSavedId] = useState("");
  const [photoResults, setPhotoResults] = useState<UnsplashPhoto[]>([]);
  const [photoStatus, setPhotoStatus] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState<UnsplashPhoto | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState("");
  const [zoneByDestination, setZoneByDestination] = useState<Record<string, string | null>>(
    Object.fromEntries((original?.destinations ?? []).flatMap((destination, index) => {
      const value = original?.destinationTimezones?.[index] ?? (index === 0 ? original?.zone : undefined);
      return value ? [[destination, value]] : [];
    })),
  );
  const [zoneLoading, setZoneLoading] = useState(false);
  const [zoneError, setZoneError] = useState("");
  const firstDestination = locations[0] || "";
  const [photoDestination, setPhotoDestination] = useState(firstDestination);
  const activePhotoDestination = locations.includes(photoDestination) ? photoDestination : firstDestination;
  const previousDestination = useRef(activePhotoDestination);
  useEffect(() => {
    if (previousDestination.current !== activePhotoDestination) {
      setSelectedPhoto(null);
      previousDestination.current = activePhotoDestination;
    }
  }, [activePhotoDestination]);
  useEffect(() => {
    const missing = locations.filter(destination => !(destination in zoneByDestination));
    if (!missing.length) return;
    const controller = new AbortController();
    setZoneLoading(true);
    setZoneError("");
    Promise.all(missing.map(async destination => [destination, await destinationTimeZone(destination, controller.signal)] as const))
      .then(entries => {
        if (controller.signal.aborted) return;
        setZoneByDestination(current => ({ ...current, ...Object.fromEntries(entries) }));
      })
      .catch(() => { if (!controller.signal.aborted) setZoneError("Some destination time zones could not be found. You can still save the trip."); })
      .finally(() => { if (!controller.signal.aborted) setZoneLoading(false); });
    return () => controller.abort();
  }, [locations, zoneByDestination]);
  useEffect(() => {
    const primaryZone = zoneByDestination[locations[0]];
    if (primaryZone && primaryZone !== zone) setZone(primaryZone);
  }, [locations, zoneByDestination, zone]);
  useEffect(() => {
    setPhotoResults([]);
    if (!activePhotoDestination) { setPhotoStatus(""); return; }
    const controller = new AbortController();
    setPhotoStatus("Finding destination photos…");
    const timer = window.setTimeout(() => {
      searchDestinationPhotos(activePhotoDestination, controller.signal)
        .then((photos) => {
          if (controller.signal.aborted) return;
          setPhotoResults(photos);
          setPhotoStatus(photos.length ? "" : "Not enough matching photos found. You can upload your own.");
        })
        .catch(() => { if (!controller.signal.aborted) setPhotoStatus("Photo suggestions are unavailable right now. You can upload your own."); });
    }, 350);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [activePhotoDestination]);
  useEffect(() => () => { if (uploadPreview) URL.revokeObjectURL(uploadPreview); }, [uploadPreview]);
  const previewPlaces = Array.from(
    new Map(
      [...locations, ...(place.trim() ? [place.trim()] : [])].map((p) => [
        p.toLowerCase(),
        p,
      ]),
    ).values(),
  );
  const timezoneGroups = locations.reduce<{ timeZone: string | null; destinations: string[] }[]>((groups, destination) => {
    const timeZone = zoneByDestination[destination] ?? null;
    const group = timeZone ? groups.find(item => item.timeZone === timeZone) : undefined;
    if (group) group.destinations.push(destination);
    else groups.push({ timeZone, destinations: [destination] });
    return groups;
  }, []);
  const tripLength = start && end && end >= start ? days(start, end).length : 0;
  const addPlace = () => {
    if (!place.trim()) return;
    const problem = textError(
      place,
      "Destination",
      TEXT_LIMITS.destination,
      true,
    );
    if (problem) {
      setError(problem);
      return;
    }
    if (locations.length >= MAX_DESTINATIONS) {
      setError("Add up to 20 destinations.");
      return;
    }
    setError("");
    if (!locations.some((p) => p.toLowerCase() === place.trim().toLowerCase()))
      setLocations([...locations, place.trim()]);
    setPlace("");
  };
  if (original && !isOwner(original, s.userId))
    return (
      <Empty
        title="Only the trip owner can change these details."
        body="You can still see the full itinerary."
        action={<Button onClick={() => go(8)}>Back to itinerary</Button>}
      />
    );
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving.current) return;
    setError("");
    const problem = tripDetailsError({
      title,
      destinations: previewPlaces,
      start,
      end,
      zone,
    });
    if (problem) {
      setError(problem);
      return;
    }
    if (original?.events.some((e) => e.date < start || e.date > end)) {
      setError(
        "Some events fall outside these dates. Move those events before shortening the trip.",
      );
      return;
    }
    const emails = recipients.commit();
    if (!emails) return;
    if (original?.todos.some((todo) => todo.date < start || todo.date > end)) {
      setError("Move or delete reminders outside the new dates first.");
      return;
    }
    if (
      original?.members.some(
        (m) =>
          m.status !== "removed" &&
          m.role === "Day Editor" &&
          !m.days.some((d) => d >= start && d <= end),
      )
    ) {
      setError(
        "Reassign Day Editor permissions before shortening these dates.",
      );
      return;
    }
    const draft: Trip = original
      ? structuredClone(original)
      : {
          id: draftId.current,
          title: "",
          destinations: [],
          start: "",
          end: "",
          zone: "",
          image: IMAGES.coast,
          members: [
            {
              id: user!.id,
              name: user!.name,
              email: user!.email,
              role: "Owner",
              days: [],
              status: "accepted",
            },
          ],
          events: [],
          prefs: {},
          expenses: [],
          budget: null,
          budgetMode: "group",
          individual: {},
          todos: [],
          dismissed: [],
        };
    if (template && !original) {
      draft.events = template.stops.map(stop => ({
        id: uid(),
        name: stop.name,
        date: dateAfter(start, stop.day),
        start: stop.start,
        end: stop.end,
        cost: 0,
        attendees: [user!.id],
        image: template.image,
        notes: stop.notes,
        place: stop.place,
      }));
      draft.image = template.image;
    }
    Object.assign(draft, {
      title: title.trim(),
      destinations: previewPlaces,
      destinationTimezones: previewPlaces.map(destination => zoneByDestination[destination] ?? null),
      start,
      end,
      zone,
    });
    if (selectedPhoto) {
      draft.image = selectedPhoto.url;
      draft.imageSource = "unsplash";
      draft.imageCredit = selectedPhoto.credit;
    }
    draft.members.forEach((m) => {
      m.days = m.days.filter((d) => d >= start && d <= end);
    });
    saving.current = true;
    setBusy(true);
    try {
      if (!savedId && uploadFile) {
        if (!accountTrips || !user) throw new Error("Sign in to your account to upload a trip photo.");
        draft.image = await uploadTripPhoto(uploadFile, user.id, draft.id);
        draft.imageSource = "upload";
        draft.imageCredit = undefined;
      }
      if (!savedId && selectedPhoto) await trackUnsplashSelection(selectedPhoto.downloadLocation);
      if (!savedId) {
        await saveTrip(draft);
        setSavedId(draft.id);
      }
      if (emails.length) {
        const failed = await invite(draft.id, emails);
        if (failed.length) {
          recipients.setEmails(failed.map(f => f.email));
          setError("Trip saved. " + failed.map(f => f.email + " — " + f.error).join(" "));
          return;
        }
      }
      go(
        original
          ? 8
          : route.params.get("next")
            ? Number(route.params.get("next"))
            : 5,
        original ? {} : { created: draft.id },
      );
    } catch (issue) {
      setError(
        issue instanceof Error
          ? issue.message
          : "Could not save. Your input is still here; please try again.",
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  return (
    <>
      <PageHead
        title={original ? "Edit your Trip" : "Make your Trip"}
      />
      <form className="form-layout" onSubmit={submit} aria-busy={busy}>
        <div className="card form-card">
          <div className="trip-form-intro">
            <p><CalendarDays size={17} /> Dates turn your itinerary into an on-trip dashboard when the time comes.</p>
            <p><Check size={17} /> {template ? "Edit this starter plan and choose your trip dates." : "Your new trip starts empty. Add only the plans you want."}</p>
          </div>
          <fieldset
            disabled={busy || !!savedId}
            style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
          >
            <div className="step-heading">
              <span>01</span>
              <h2>The essentials</h2>
            </div>
            <Field label="Trip title">
              <input
                required
                maxLength={TEXT_LIMITS.title}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Bachelorette trip"
              />
            </Field>
            <Field
              label="Where are you going?"
              hint="Add one or more destinations"
            >
              <DestinationInput value={place} onChange={setPlace} onAdd={addPlace} />
            </Field>
            <div className="chips">
              {locations.map((p, i) => (
                <span className="chip" key={i}>
                  <MapPin size={13} />
                  {p}
                  <button
                    type="button"
                    aria-label={`Remove ${p}`}
                    onClick={() => {
                      const remaining = locations.filter((_, n) => n !== i);
                      setLocations(remaining);
                      if (p === activePhotoDestination) {
                        setPhotoDestination(remaining[0] || "");
                        setSelectedPhoto(null);
                      }
                    }}
                  >
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>
            <section className="trip-photo-picker" aria-label="Choose a trip photo">
              <h3>Trip photo</h3>
              <p className="trip-photo-intro">Photos on <a href="https://unsplash.com/?utm_source=trip_planner_prototype&utm_medium=referral" target="_blank" rel="noreferrer">Unsplash</a>. Choose one or upload your own.</p>
              {locations.length > 1 && <div className="trip-photo-destination">
                <label htmlFor="trip-photo-destination">Photos for</label>
                <select id="trip-photo-destination" value={activePhotoDestination} onChange={(event) => {
                  setPhotoDestination(event.target.value);
                  setSelectedPhoto(null);
                }}>
                  {locations.map((location) => <option key={location} value={location}>{location}</option>)}
                </select>
              </div>}
              {photoStatus && <p role="status">{photoStatus}</p>}
              {photoResults.length > 0 && <div className="trip-photo-options">
                {photoResults.map((photo) => <div key={photo.id}>
                  <button type="button"
                    className={selectedPhoto?.id === photo.id ? "selected" : ""}
                    aria-label={`Choose photo by ${photo.credit.name}`}
                    aria-pressed={selectedPhoto?.id === photo.id}
                    onClick={() => { setSelectedPhoto(photo); setUploadFile(null); setUploadPreview(""); }}>
                    <img src={photo.thumb} alt={photo.alt} />
                  </button>
                  <PhotoCredit credit={photo.credit} compact />
                </div>)}
              </div>}
              <label className="trip-photo-upload">
                <ImagePlus size={20} aria-hidden="true" />
                <span>Or Upload Your Own Photo<small>JPEG, PNG, or WebP · up to 5 MB</small></span>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  if (!file) return;
                  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
                    setError("Choose a JPEG, PNG, or WebP image under 5 MB."); return;
                  }
                  setUploadFile(file); setUploadPreview(URL.createObjectURL(file)); setSelectedPhoto(null); setError("");
                }} />
              </label>
              {(uploadPreview || selectedPhoto?.url || original?.image) && <div className="trip-photo-selection">
                <img src={uploadPreview || selectedPhoto?.url || original?.image} alt="Selected trip cover" />
                {selectedPhoto && <PhotoCredit credit={selectedPhoto.credit} compact />}
                {!selectedPhoto && !uploadFile && <PhotoCredit credit={original?.imageCredit} compact />}
              </div>}
            </section>
            <div className="form-columns">
              <DatePicker
                label="Start date"
                required
                value={start}
                onChange={(next) => {
                  setStart(next);
                  if (template) setEnd(dateAfter(next, template.days - 1));
                  else if (!end || end < next) setEnd(next);
                }}
              />
              <DatePicker
                label="End date"
                required
                min={template && start ? dateAfter(start, template.days - 1) : start}
                align="right"
                value={end}
                onChange={setEnd}
              />
            </div>
            <Field label="Trip time zones" hint={zoneLoading ? "Finding time zones for your destinations…" : zoneError || "Each time zone follows its destination order."}>
              {locations.length ? <ul className="trip-timezone-list">
                {timezoneGroups.map(group => {
                  const labels = group.destinations.map(destination => {
                    const [city, ...area] = destination.split(",").map(part => part.trim());
                    return { city, area: area.join(", ") };
                  });
                  const areas = [...new Set(labels.map(label => label.area).filter(Boolean))];
                  const timezone = group.timeZone ? timeZoneLabel(group.timeZone) : "Time zone unavailable";
                  return <li key={group.timeZone ?? group.destinations[0]}><ul className="trip-timezone-group">{labels.map(label => <li key={label.city}><strong>{label.city} — {timezone}</strong></li>)}</ul>{areas.length > 0 && <small>{areas.join(", ")}</small>}</li>;
                })}
              </ul> : <p className="trip-timezone-empty">Add destinations to see their time zones.</p>}
            </Field>
          </fieldset>
          <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <div className="step-heading">
              <span>02</span>
              <h2>Bring your people</h2>
            </div>
            <RecipientField recipients={recipients} live={accountTrips} users={s.users} label="Invite by email (optional)" disabled={busy}/>
            <section
              className="mobile-trip-preview note"
              aria-label="Trip preview"
            >
              <strong>{title.trim() || "Your trip"}</strong>
              <p>{previewPlaces.join(" · ") || "Add a destination"}</p>
              <p>
                {tripLength
                  ? `${dateText(start, true)} – ${dateText(end, true)} · ${tripLength} ${tripLength === 1 ? "day" : "days"}`
                  : "Choose your dates"}
              </p>
            </section>
            <ErrorBox text={error} />
            <div className="form-actions">
              <Button
                variant="text"
                onClick={() => {
                  if (title || locations.length) {
                    if (
                      !window.confirm(
                        "Leave this form? Unsaved changes will be lost.",
                      )
                    )
                      return;
                  }
                  go(original ? 8 : 4);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : savedId ? (recipients.emails.length || recipients.draft ? "Retry invitations" : "Continue to trip") : original ? "Save changes" : "Create trip"}
                <ArrowRight size={16} />
              </Button>
            </div>
            {original && !original.sample && (
              <Button
                variant="text danger"
                disabled={busy}
                onClick={() => open("deleteTrip", { tripId: original.id })}
              >
                <Trash2 size={16} /> Delete trip
              </Button>
            )}
          </fieldset>
        </div>
        <aside className="form-aside">
          <p><CalendarDays size={17} /> Dates turn your itinerary into an on-trip dashboard when the time comes.</p>
          <p><Check size={17} /> Your new trip starts empty. Add only the plans you want.</p>
        </aside>
      </form>
    </>
  );
}
