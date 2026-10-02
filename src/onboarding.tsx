import React, { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Plus,
  MapPin,
  Check,
  ChevronRight,
  Link2,
  Mail,
  CalendarDays,
  X,
  Compass,
} from "lucide-react";
import { useApp } from "./state";
import {
  Badge,
  Button,
  Empty,
  ErrorBox,
  Field,
  Logo,
  PageHead,
  Photo,
  Avatar,
} from "./ui";
import { IMAGES, SERVICES, PERMISSIONS } from "./data";
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
export function Auth() {
  const { s, mutate, go, open, login, explore, toast } = useApp();
  const [signup, setSignup] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
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
          src={IMAGES.seattle}
          alt="Seattle skyline and Mount Rainier at dusk"
        />
        <div className="auth-visual-shade" />
        <Logo />
        <div className="auth-story">
          <span className="eyebrow light">THE GOOD PART STARTS TOGETHER</span>
          <h1>
            Less back and forth.
            <br />
            <em>More out there.</em>
          </h1>
          <p>
            Make a plan everyone can be part of.
            <br />
            Then make some memories.
          </p>
          <div className="photo-location">
            <MapPin size={16} />
            Seattle, Washington
          </div>
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
          <h2>{signup ? "Start something good." : "Welcome back."}</h2>
          <p>
            {signup
              ? "Create a fictional account to try planning a trip."
              : "Your people. Your places. All in one place."}
          </p>
          <div className="provider-buttons">
            <Button
              variant="outline"
              onClick={() =>
                open("authProvider", { service: "Google", signup })
              }
            >
              <span className="provider-letter">G</span>Continue with Google
            </Button>
            <Button
              variant="outline"
              onClick={() => open("authProvider", { service: "Apple", signup })}
            >
              <span className="apple-mark">●</span>Continue with Apple
            </Button>
          </div>
          <div className="divider">
            <span>or with email</span>
          </div>
          <form onSubmit={submit}>
            {signup && (
              <Field label="Your fictional name">
                <input
                  autoComplete="off"
                  required
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </Field>
            <Field label="Password">
              <input
                required
                type="password"
                autoComplete="off"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your demo password"
              />
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
          <div className="auth-demo">
            <div>
              <Compass size={19} />
              <strong>Just looking around?</strong>
            </div>
            <p>There’s a Seattle getaway already planned for you.</p>
            <Button variant="outline full" onClick={explore}>
              Explore the sample trip <ArrowUpRight size={16} />
            </Button>
          </div>
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
        eyebrow="A LITTLE SETUP · 1 OF 2"
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
                    <small>{granted.includes(p) ? "Granted" : "Needed"}</small>
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
        Trip Planner would like the following access for
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
  const { user, go, explore, open } = useApp();
  return (
    <>
      <PageHead
        eyebrow="A WORLD OF POSSIBILITIES"
        title={`Where to next, ${user?.name.split(" ")[0]}?`}
        description="Good trips start with a little possibility."
      />
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
          <Badge tone="green">READY TO EXPLORE</Badge>
          <h2>A few days in the Pacific Northwest.</h2>
          <p>
            Meet Maya and friends. Their fictional Seattle trip has plans,
            preferences, and a little room to wander.
          </p>
          <Button variant="light" onClick={explore}>
            Open the sample trip <ArrowUpRight size={16} />
          </Button>
        </div>
        <Photo src={IMAGES.seattle} alt="Seattle skyline" />
      </div>
      <div className="section-title">
        <div>
          <span className="eyebrow">A LITTLE INSPIRATION</span>
          <h2>Somewhere worth going.</h2>
        </div>
        <span className="muted">Illustrative trip estimates</span>
      </div>
      <div className="destination-grid">
        {[
          {
            name: "Seattle",
            tag: "City days, island escapes",
            image: IMAGES.seattle,
            cost: "$750",
            days: "4 days",
          },
          {
            name: "San Diego",
            tag: "A slower kind of sunshine",
            image: IMAGES.coast,
            cost: "$920",
            days: "5 days",
          },
          {
            name: "Chicago",
            tag: "Art, architecture & good food",
            image: IMAGES.city,
            cost: "$680",
            days: "3 days",
          },
        ].map((d) => (
          <article className="destination-card" key={d.name}>
            <Photo src={d.image} alt={`${d.name} travel inspiration`} />
            <div>
              <span className="eyebrow">{d.tag}</span>
              <h3>{d.name}</h3>
              <p>
                <strong>{d.cost}</strong> / person <span>{d.days}</span>
              </p>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
export function Trips() {
  const { s, user, mutate, go, open } = useApp();
  const [filter, setFilter] = useState("All");
  const trips = s.trips.filter((t) => member(t, s.userId));
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
            className={filter === f ? "active" : ""}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="trip-grid">
        {trips
          .filter(
            (t) =>
              filter === "All" ||
              (filter === "Past"
                ? t.end < s.date
                : filter === "Active"
                  ? isActive(t, s.date)
                  : t.start > s.date),
          )
          .map((t) => (
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
                    disabled={member(t, s.userId)?.role === "Viewer"}
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
              </div>
            </article>
          ))}
      </div>
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
  const { s, user, trip, route, mutate, go, toast } = useApp();
  const editing = route.params.get("edit") === "true" && trip;
  const original = editing ? trip : undefined;
  const [title, setTitle] = useState(original?.title || ""),
    [locations, setLocations] = useState<string[]>(
      original?.destinations || [],
    ),
    [place, setPlace] = useState(""),
    [start, setStart] = useState(original?.start || ""),
    [end, setEnd] = useState(original?.end || ""),
    [zone, setZone] = useState(original?.zone || "America/Los_Angeles"),
    [invites, setInvites] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  if (original && !isOwner(original, s.userId))
    return (
      <Empty
        title="Only the trip owner can change these details."
        body="You can still see the full itinerary."
        action={<Button onClick={() => go(8)}>Back to itinerary</Button>}
      />
    );
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const allPlaces = [...locations, ...(place.trim() ? [place.trim()] : [])];
    if (!allPlaces.length) {
      setError("Add at least one destination.");
      return;
    }
    if (end < start || days(start, end).length > 365) {
      setError("Choose an end date after the start, within one year.");
      return;
    }
    if (
      original &&
      original.events.some((e) => e.date < start || e.date > end)
    ) {
      setError(
        "Some events fall outside these dates. Move those events before shortening the trip.",
      );
      return;
    }
    const emails = invites
      .split(/[,\n]+/)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
    if (emails.some((email) => !/^\S+@\S+\.\S+$/.test(email))) {
      setError("Use valid fictional email addresses, separated by commas.");
      return;
    }
    setBusy(true);
    setTimeout(() => {
      const id = original?.id || uid();
      mutate((v) => {
        const invited = Array.from(new Set(emails))
          .filter(
            (email) =>
              email !== user!.email &&
              !original?.members.some((m) => m.email === email),
          )
          .map((email) => ({
            id: v.users.find((u) => u.email === email)?.id || uid(),
            name: email.split("@")[0].replace(/[._]/g, " "),
            email,
            role: "Viewer" as const,
            days: [],
            status: "pending" as const,
          }));
        if (original) {
          const t = v.trips.find((t) => t.id === id)!;
          Object.assign(t, {
            title: title.trim(),
            destinations: allPlaces,
            start,
            end,
            zone,
          });
          t.members.push(...invited);
          t.members.forEach(
            (m) => (m.days = m.days.filter((d) => d >= start && d <= end)),
          );
        } else {
          v.trips.push({
            id,
            title: title.trim(),
            destinations: allPlaces,
            start,
            end,
            zone,
            image: IMAGES.seattle,
            members: [
              {
                id: user!.id,
                name: user!.name,
                email: user!.email,
                role: "Owner",
                days: [],
                status: "accepted",
              },
              ...invited,
            ],
            events: [],
            prefs: {},
            expenses: [],
            budget: null,
            budgetMode: "group",
            individual: {},
            todos: [],
            dismissed: [],
          });
        }
        v.tripId = id;
      });
      toast(
        original
          ? "Trip details updated."
          : emails.length
            ? "Trip created. Invitations are simulated; no email was sent."
            : "Your new trip is ready.",
      );
      go(
        original
          ? 8
          : route.params.get("next")
            ? Number(route.params.get("next"))
            : 5,
      );
    }, 450);
  };
  return (
    <>
      <PageHead
        eyebrow={original ? "MAKE IT YOURS" : "THE FIRST STEP"}
        title={original ? "A few details, updated." : "Let’s make a trip."}
        description="A place, a few dates, your people. The rest can come together as you go."
      />
      <form className="form-layout" onSubmit={submit}>
        <div className="card form-card">
          <div className="step-heading">
            <span>01</span>
            <h2>The essentials</h2>
          </div>
          <Field label="Trip title">
            <input
              required
              maxLength={90}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Bachelorette trip"
            />
          </Field>
          <Field
            label="Where are you going?"
            hint="One destination is enough. Add more for a multi-stop trip."
          >
            <div className="input-action">
              <input
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (place.trim()) {
                      setLocations([...locations, place.trim()]);
                      setPlace("");
                    }
                  }
                }}
                placeholder="A city, a region, somewhere new…"
              />
              <Button
                variant="outline"
                onClick={() => {
                  if (place.trim()) {
                    setLocations([...locations, place.trim()]);
                    setPlace("");
                  }
                }}
              >
                Add
              </Button>
            </div>
          </Field>
          <div className="chips">
            {locations.map((p, i) => (
              <span className="chip" key={i}>
                <MapPin size={13} />
                {p}
                <button
                  type="button"
                  aria-label={`Remove ${p}`}
                  onClick={() =>
                    setLocations(locations.filter((_, n) => n !== i))
                  }
                >
                  <X size={13} />
                </button>
              </span>
            ))}
          </div>
          <div className="form-columns">
            <Field label="Start date">
              <input
                required
                type="date"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </Field>
            <Field label="End date">
              <input
                required
                type="date"
                min={start}
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </Field>
          </div>
          <Field
            label="Trip time zone"
            hint="Used for your trip dates and the Today dashboard."
          >
            <select value={zone} onChange={(e) => setZone(e.target.value)}>
              {[
                "America/Los_Angeles",
                "America/Denver",
                "America/Chicago",
                "America/New_York",
                "Europe/London",
                "Europe/Paris",
                "Asia/Taipei",
                "Asia/Tokyo",
                "Australia/Sydney",
              ].map((z) => (
                <option key={z}>{z}</option>
              ))}
            </select>
          </Field>
          <div className="step-heading">
            <span>02</span>
            <h2>Bring your people</h2>
          </div>
          <Field
            label="Invite by email (optional)"
            hint="Use fictional addresses, separated by commas. No invitations are actually sent."
          >
            <textarea
              rows={2}
              value={invites}
              onChange={(e) => setInvites(e.target.value)}
              placeholder="friend@example.com, another@example.com"
            />
          </Field>
          <div className="note">
            Everyone starts as a Viewer. You can assign editing permissions and
            days in The group.
          </div>
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
              {busy ? "Saving…" : original ? "Save changes" : "Create trip"}
              <ArrowRight size={16} />
            </Button>
          </div>
        </div>
        <aside className="form-aside">
          <div className="postcard">
            <Photo src={IMAGES.coast} alt="Coastal travel inspiration" />
            <div>
              <span className="eyebrow">ROOM FOR POSSIBILITY</span>
              <h2>
                The best parts
                <br />
                aren’t always planned.
              </h2>
            </div>
          </div>
          <p>
            <CalendarDays size={17} /> Dates turn your itinerary into an on-trip
            dashboard when the time comes.
          </p>
          <p>
            <Check size={17} /> Your new trip starts empty. Add only the plans
            you want.
          </p>
          <p className="fine-print">
            This prototype saves on this device only. Use fictional data for
            testing.
          </p>
        </aside>
      </form>
    </>
  );
}
