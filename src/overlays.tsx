/** Implementation status: Account guest details, role/day settings, budgets, and repayment markers persist through updateTrip. Invitations use Supabase. Provider/OCR/receipt/transaction previews remain simulations. See ../IMPLEMENTATION_STATUS.md. */
import { RecipientField, useRecipients } from "./recipient-field";
import { TEXT_LIMITS, textError } from "./limits.ts";
import React, { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  Compass,
  LogOut,
  Mail,
  MapPin,
  Palette,
  Plus,
  Settings2,
  Sparkles,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useApp } from "./state";
import {
  Avatar,
  Badge,
  Button,
  Empty,
  ErrorBox,
  Field,
  Logo,
  Modal,
} from "./ui";
import { seed, PAGES, PERMISSIONS, SERVICES } from "./data";
import {
  days,
  dateText,
  timeText,
  tripDateRange,
  isActive,
  isOwner,
  member,
  money,
  uid,
  splitCents,
  type Role,
} from "./domain";
import { BudgetSetup, ExpenseForm, RepaymentForm } from "./finance";
import { addCalendarDays } from "./calendar";
import { plannedTrip } from "./preplanned-trips";
import { NearbySuggestions } from "./nearby-suggestions";
function AuthProvider() {
  const { overlay, s, mutate, go, login, close } = useApp();
  const { service, signup } = overlay!.data;
  const [unknown, setUnknown] = useState(false);
  const create = () => {
    const id = uid();
    mutate((v) => {
      v.users.push({
        id,
        name: "Jordan Lee",
        email: `jordan.${id.slice(0, 5)}@example.com`,
        connections: {},
      });
      v.userId = id;
      v.tripId = null;
    });
    go(2);
  };
  return (
    <Modal title={`Continue with ${service}`}>
      <Badge>SIMULATED SIGN-IN</Badge>
      <h3>
        {unknown && !signup
          ? "Let’s create your account."
          : "Choose a fictional account"}
      </h3>
      {unknown && !signup ? (
        <>
          <p>This account hasn’t joined Stir Crazy yet.</p>
          <Button variant="full" onClick={create}>
            Create an account
          </Button>
        </>
      ) : (
        <div className="account-choices">
          <button onClick={() => (signup ? create() : login("maya"))}>
            <Avatar name="Maya Chen" />
            <span>
              <strong>{signup ? "Jordan Lee" : "Maya Chen"}</strong>
              <small>
                {signup
                  ? "New fictional account"
                  : "maya@example.com · returning traveler"}
              </small>
            </span>
            <ArrowRight size={16} />
          </button>
          {!signup && (
            <button onClick={() => setUnknown(true)}>
              <Avatar name="Jordan Lee" />
              <span>
                <strong>Jordan Lee</strong>
                <small>Unrecognized fictional account</small>
              </span>
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      )}
      <p className="fine-print">
        No real {service} account is accessed. Gmail and social permissions are
        separate.
      </p>
      <Button variant="text" onClick={close}>
        Cancel
      </Button>
    </Modal>
  );
}
function InviteMember() {
  const { trip, s, invite, close, toast } = useApp();
  const recipients = useRecipients();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  if (!trip || !isOwner(trip, s.userId)) return null;
  const live = trip.persistence === "account";
  return <Modal title="Invite travelers">
    <form onSubmit={async e => {
      e.preventDefault();
      if (busy) return;
      const emails = recipients.commit();
      if (!emails?.length) {
        if (emails) recipients.setError("Add at least one email address.");
        return;
      }
      setBusy(true);
      setError("");
      try {
        const failed = await invite(trip.id, emails);
        if (failed.length) {
          const sent = emails.filter(email => !failed.some(failure => failure.email === email));
          setSuccess(sent.length ? `${live ? "Invitation sent" : "Demo invitation added"} to ${sent.join(", ")}. Only the remaining addresses need a retry.` : "");
          recipients.setEmails(failed.map(f => f.email));
          setError(failed.map(f => f.email + " — " + f.error).join(" "));
        } else {
          toast(live ? "Trip shared with your travelers." : "Demo invitations added.");
          close();
        }
      } catch (issue) { setError(issue instanceof Error ? issue.message : "Could not invite travelers."); }
      finally { setBusy(false); }
    }}>
      <RecipientField recipients={recipients} live={live} users={s.users} disabled={busy}/>
      {success && <p className="note" role="status">{success}</p>}
      <ErrorBox text={error}/>
      <Button variant="full" type="submit" disabled={busy || (!recipients.emails.length && !recipients.draft.trim())}>
        <Mail size={16}/> {busy ? "Inviting…" : error ? "Retry invitations" : live ? "Send invitations" : "Invite in demo"}
      </Button>
    </form>
  </Modal>;
}
function Permissions() {
  const { trip: t, s, overlay, saveTrip, close, toast } = useApp();
  const m = t?.members.find((m) => m.id === overlay?.data?.memberId);
  const [role, setRole] = useState<Role>(m?.role || "Viewer"),
    [dates, setDates] = useState(m?.days || []),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  if (!t || !m || !isOwner(t, s.userId) || m.role === "Owner" || m.status === "removed" || m.signupPending) return null;
  return (
    <Modal title="Permissions">
      <p className="permission-traveler">{m.name}</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (saving) return;
          const assigned = role === "Day Editor" ? dates.filter(d => isActive(t, d)) : [];
          if (role === "Day Editor" && !assigned.length) {
            setError("Assign at least one day.");
            return;
          }
          setError("");
          setSaving(true);
          try {
            await saveTrip({ ...t, members: t.members.map(person => person.id === m.id
              ? { ...person, role, days: assigned } : person) });
            if (t.persistence !== "account") toast("Permissions updated.");
            close();
          } catch (issue) {
            setError(issue instanceof Error ? issue.message : "Could not save permissions.");
          } finally {
            setSaving(false);
          }
        }}
      >
        <Field label="Role">
          <select
            value={role}
            disabled={saving}
            onChange={(e) => { setRole(e.target.value as Role); setError(""); }}
          >
            <option>Viewer</option>
            <option>Editor</option>
            <option>Day Editor</option>
          </select>
        </Field>
        <p className="note">
          {role === "Viewer"
            ? "Can view the plan and contribute their own preferences and expenses."
            : role === "Editor"
              ? "Can add and edit plans across all days. Cannot change membership or trip settings."
              : "Can add and edit plans only on the days selected below."}
        </p>
        {role === "Day Editor" && (
          <fieldset>
            <legend>Assigned days</legend>
            {days(t.start, t.end).map((d, i) => (
              <label className="check-row" key={d}>
                <input
                  type="checkbox"
                  disabled={saving}
                  checked={dates.includes(d)}
                  onChange={(e) => {
                    setDates(e.target.checked ? [...dates, d] : dates.filter((x) => x !== d));
                    setError("");
                  }}
                />
                <span>
                  Day {i + 1} · {dateText(d)}
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <ErrorBox text={error} />
        <Button type="submit" variant="full" disabled={saving}>
          {saving ? "Saving permissions…" : "Save permissions"}
        </Button>
      </form>
    </Modal>
  );
}
function Gmail() {
  const { trip: t, s, updateTrip, close, toast } = useApp();
  const [stage, setStage] = useState("review");
  if (!t) return null;
  const match = t.expenses.find(
    (e) => e.id === "xdinner" || e.id === "gmail-example",
  );
  return (
    <Modal title="A receipt, in the right place">
      <Badge>DEMO GMAIL RECEIPT</Badge>
      <div className="receipt-preview">
        <span>JUNIPER TABLE</span>
        <h3>Dinner for four</h3>
        <p>October 15, 2026</p>
        <hr />
        <div className="row">
          <span>Total</span>
          <strong>$120.00</strong>
        </div>
      </div>
      <p>
        {match
          ? "We found an existing $120 dinner expense. Attach this sample receipt without adding another charge."
          : "No matching expense exists in this trip. Review the sample details before adding it."}
      </p>
      {stage === "done" ? (
        <div className="success">
          <Check size={19} />
          Receipt {match ? "matched" : "added"}. Your totals are correct.
        </div>
      ) : (
        <Button
          variant="full"
          onClick={() => {
            if (match && match.payer !== member(t, s.userId)?.id) {
              toast("Only the payer can update this expense.", "budget");
              return;
            }
            if (match) {
              updateTrip((t) => {
                t.expenses.find((e) => e.id === match.id)!.source =
                  "Demo Gmail · matched";
              });
            } else
              updateTrip((t) =>
                t.expenses.push({
                  id: "gmail-example",
                  purpose: "Juniper Table sample dinner",
                  amount: 12000,
                  category: "Food",
                  payer: member(t, s.userId)!.id,
                  shares: splitCents(
                    12000,
                    t.members
                      .filter((m) => m.status === "accepted")
                      .map((m) => m.id),
                  ),
                  date: s.date,
                  source: "Demo Gmail",
                  settled: [],
                }),
              );
            setStage("done");
            toast(
              match
                ? "Receipt matched. No duplicate expense."
                : "Sample expense added.",
              "budget",
            );
          }}
        >
          {match ? "Match to existing expense" : "Add reviewed sample expense"}
        </Button>
      )}
      <Button variant="text full" onClick={close}>
        Done
      </Button>
    </Modal>
  );
}
function Demo() {
  const { s, user, trip, route, mutate, go, close, explore, signOut, overlay } =
    useApp();
  const [feedback, setFeedback] = useState("");
  const [section, setSection] = useState(overlay?.data?.section === "time" || overlay?.data?.section === "screens" ? overlay.data.section as string : "experience");
  const [date, setDate] = useState(s.date),
    [time, setTime] = useState(s.time);
  const opensToday = (trip && isActive(trip, date)) ||
    s.trips.filter((item) => member(item, s.userId) && isActive(item, date)).length === 1;
  const landingLabel = opensToday ? "Apply & open Today" : "Apply & open Home";
  const landing = () => {
    mutate((v) => {
      v.date = date;
      v.time = time;
      v.noticeDismissed = false;
    });
    const accepted = s.trips.filter(
      (t) => member(t, s.userId) && isActive(t, date),
    );
    if (trip && isActive(trip, date)) go(10);
    else if (accepted.length === 1) {
      mutate((v) => (v.tripId = accepted[0].id));
      go(10);
    } else go(4);
  };
  return (
    <Modal title="Prototype controls" navigation={
      <div className="demo-mobile-tabs" role="group" aria-label="Prototype sections">
        {[["experience", "Scenario"], ["time", "Date & time"], ["screens", "Screens"]].map(([id,label]) => <Button key={id} variant="outline" aria-pressed={section === id} onClick={() => setSection(id)}>{label}</Button>)}
      </div>
    } footer={section === "time" ? <div className="demo-time-footer"><Button variant="full" disabled={!s.userId || !date || !time} onClick={landing}>{landingLabel} <ArrowRight size={15}/></Button></div> : undefined}>
      <p className="fine-print">
        Explore fictional trips and simulated integrations in this browser.
      </p>
      <div className="demo-grid" data-active={section}>
        <div className="card" data-section="experience">
          <h3>Try the experience</h3>
          <Button variant="outline full" onClick={explore}>
            Explore the sample trip
          </Button>
          <Button
            variant="outline full"
            onClick={() => {
              void signOut();
            }}
          >
            Start at Log in / Create account
          </Button>
          <Field label="View as a fictional participant">
            <select
              value={s.userId || ""}
              onChange={(e) => {
                const id = e.target.value;
                mutate((v) => {
                  v.userId = id;
                  const accessible = v.trips.find((t) => member(t, id));
                  if (!v.trips.some((t) => t.id === v.tripId && member(t, id)))
                    v.tripId = accessible?.id || null;
                });
                setFeedback("Participant changed. Permissions update immediately.");
              }}
            >
              <option value="" disabled>
                Choose participant
              </option>
              {s.users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {trip?.members.find((m) => m.id === u.id)
                    ? ` · ${trip.members.find((m) => m.id === u.id)!.role}`
                    : ""}
                </option>
              ))}
            </select>
          </Field>
          <label className="check-row">
            <input
              type="checkbox"
              checked={s.location}
              onChange={(e) => mutate((v) => (v.location = e.target.checked))}
            />
            <span>Simulated location available</span>
          </label>
          <Button
            variant="text"
            onClick={() => {
              if (
                !window.confirm(
                  "Restore the fictional sample trips? Trips you created will be preserved.",
                )
              )
                return;
              mutate((v) => {
                v.trips = [
                  ...seed().trips,
                  ...v.trips.filter((t) => !t.sample),
                ];
                v.noticeDismissed = false;
              });
              setFeedback("Sample trips restored. Your own trips are unchanged.");
            }}
          >
            Restore sample trips
          </Button>
          {feedback && <p className="inline-status" role="status">{feedback}</p>}
        </div>
        <div className="card" data-section="time">
          <h3>Travel through time</h3>
          <div className="form-columns">
            <Field label="Demo date">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field label="Demo time">
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </Field>
          </div>
          <div className="chips">
            {[
              ["Before", addCalendarDays(trip?.start || s.date, -1)],
              ["During", trip?.start || s.date],
              ["After", addCalendarDays(trip?.end || s.date, 1)],
            ].map(([label, d]) => (
              <button key={label} className="chip" onClick={() => setDate(d)}>
                {label}
              </button>
            ))}
          </div>
          <p className="fine-print">
            Presets follow {trip?.title || "the selected trip"}. Date/time are interpreted in{" "}
            {trip?.zone || "the selected trip’s time zone"}. Active dates open
            Today. Other dates open Home.
          </p>
          <Button
            variant="full demo-time-apply"
            disabled={!s.userId || !date || !time}
            onClick={landing}
          >
            {landingLabel} <ArrowRight size={15} />
          </Button>
          <h3>Your testing session</h3>
          <p className="fine-print">
            Demo trips stay in this browser. Real account trips save to the
            database. Another tester opens their own independent copy. A share
            link does not synchronize trip edits.
          </p>
        </div>
      </div>
      <section className="demo-screen-section" data-active={section}>
      <h3>Screen index</h3>
      <div className="screen-index">
        {Object.entries(PAGES).map(([id, label]) => (
          <button
            disabled={id === "14" || (!user && Number(id) > 1)}
            key={id}
            onClick={() => {
              const p = Number(id);
              if (p === 1) {
                void signOut();
                return;
              }
              if (p === 3) {
                go(3, { service: "Gmail" });
                return;
              }
              if ([7, 8, 9, 10, 11, 12, 13, 15, 16, 17].includes(p) && !trip) {
                mutate((v) => {
                  if (!v.sampleReturn && v.userId && v.userId !== "maya")
                    v.sampleReturn = { userId: v.userId, tripId: v.tripId };
                  v.userId = "maya";
                  v.tripId = "seattle";
                });
              }
              if (p === 10 || p === 16)
                mutate((v) => (v.date = trip?.start || "2026-10-15"));
              go(p);
            }}
          >
            <span>{id.padStart(2, "0")}</span>
            {label}
            {id === "14" ? null : <ArrowUpRight size={13} />}
          </button>
        ))}
      </div>
      <p className="fine-print">
        Page 14 is reserved because the requirements omit it. Page 16 is an
        overlay. Separate mobile layouts appear automatically on narrow screens.
      </p>
      </section>
    </Modal>
  );
}
function DeleteTrip() {
  const { s, overlay, deleteTrip, close, go, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const target = s.trips.find((t) => t.id === overlay?.data?.tripId);
  if (!target || target.sample || !isOwner(target, s.userId)) return null;
  return (
    <Modal title="Delete this trip?">
      <p>
        Delete <strong>{target.title}</strong>{" "}
        {target.persistence === "account"
          ? "from your account"
          : "from this browser"}
        ? This cannot be undone.
      </p>
      <ErrorBox text={error} />
      <div className="form-actions">
        <Button variant="outline" disabled={busy} onClick={close}>
          Keep trip
        </Button>
        <Button
          variant="danger"
          disabled={busy}
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            setError("");
            try {
              await deleteTrip(target);
              go(5);
              if (target.persistence !== "account")
                toast("Trip deleted from this browser.");
            } catch (issue) {
              setError(
                issue instanceof Error
                  ? issue.message
                  : "Could not delete the trip. Please try again.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Deleting…" : "Delete trip"}
        </Button>
      </div>
    </Modal>
  );
}

function TripPicker() {
  const { s, overlay: o, mutate, go } = useApp();
  const [query, setQuery] = useState("");
  if (!o) return null;
    const availableTrips = s.trips.filter(trip => member(trip, s.userId));
    const trips = availableTrips.filter(trip => !o.data?.activeOnly || isActive(trip, s.date));
    const outsideDates = o.data?.activeOnly && availableTrips.length > 0 && trips.length === 0;
    const matches = trips.filter(trip => `${trip.title} ${trip.destinations.join(" ")} ${trip.start} ${trip.end}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
    return (
      <Modal title="Choose a trip" navigation={trips.length > 5 ? <div className="trip-picker-search">
        <Field label="Find a trip"><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, destination, or year" /></Field>
        {query.trim() && <p className="fine-print" role="status">{matches.length} {matches.length === 1 ? "trip" : "trips"} found</p>}
      </div> : undefined} footer={<Button variant="outline full" onClick={() => go(6, { next: String(o.data?.target || 8) })}><Plus size={16} />Create a new trip</Button>}>
        <div className="trip-picker">
          {matches.map((t) => (
            <button
              key={t.id}
              aria-current={t.id === s.tripId ? "true" : undefined}
              onClick={() => {
                mutate((v) => (v.tripId = t.id));
                go(o.data?.target || 8);
              }}
            >
              <span>
                <strong>{t.title}</strong>
                <small>
                  {t.id === s.tripId && "Current trip · "}{tripDateRange(t.start, t.end)}
                </small>
                <small className="trip-picker-destinations" title={t.destinations.join(" · ")}>{t.destinations.length > 1 && `${t.destinations.length} destinations · `}{t.destinations.join(" · ")}</small>
              </span>
              <ArrowRight size={17} />
            </button>
          ))}
        </div>
        {trips.length > 0 && !matches.length && <Empty title="No matching trips" body="Try a name, destination, or year." action={<Button variant="outline" onClick={() => setQuery("")}>Clear search</Button>} />}
        {!trips.length && (
          <Empty
            title={outsideDates ? "No trips on this date" : "Your first trip starts here."}
            body={outsideDates ? `Your trips fall outside ${dateText(s.date)}. Open My trips to plan ahead.` : "Create one to use your budget, calendar, map, and group tools."}
            action={outsideDates && <Button onClick={() => go(5)}>View all trips</Button>}
          />
        )}

      </Modal>
    );
}

export function Overlays() {
  const app = useApp();
  const {
    overlay: o,
    trip: t,
    s,
    user,
    mutate,
    updateTrip,
    open,
    close,
    go,
    tripGo,
    toast,
  } = app;
  if (!o) return null;
  if (o.kind === "plannedTrip") return <PlannedTripPreview />;
  if (o.kind === "deleteTrip") return <DeleteTrip />;
  if (o.kind === "demo") return <Demo />;
  if (o.kind === "authProvider") return <AuthProvider />;
  if (o.kind === "expense") return <ExpenseForm />;
  if (o.kind === "budgetSetup") return <BudgetSetup />;
  if (o.kind === "inviteMember") return <InviteMember />;
  if (o.kind === "permissions") return <Permissions />;
  if (o.kind === "gmail") return <Gmail />;
  if (o.kind === "message")
    return (
      <Modal title={o.data.title}>
        <p className="message-body-copy">{o.data.body}</p>
        <Button variant="full" onClick={close}>
          Got it
        </Button>
      </Modal>
    );
  if (o.kind === "menu")
    return (
      <Modal title="Your next stop" className="menu-navigation-modal">
        <nav className="menu-sections" aria-label="All pages">
          <section><h3>Workspace</h3><div className="menu-links">
            {[[4, "Home"], [5, "My trips"], [6, "New trip"]].map(([page, label]) => <button key={page} aria-current={app.route.page === page ? "page" : undefined} onClick={() => go(Number(page))}>{label}</button>)}
            <button onClick={() => go(4, {section:"templates"})}>Pre-planned trips</button>
          </div></section>
          <section><h3>Your trip{t?.title ? ` - ${t.title}` : ""}</h3><div className="menu-links">
            {[[8, "Itinerary"], [11, "Day & map"], [17, "Map"], [12, "Budget"], [13, "The group"], [9, "Suggestions"], [15, "My preferences"], ...(t && isActive(t, s.date) ? [[10, "Today"]] : [])].map(([page, label]) => <button key={page} aria-current={app.route.page === page ? "page" : undefined} onClick={() => tripGo(Number(page))}>{label}</button>)}
          </div></section>
          <section><h3>Personal</h3><div className="menu-links"><button onClick={() => go(19)}>Your account <Users size={17}/></button><button onClick={() => go(18)}>Style <Palette size={17}/></button><button onClick={() => open("demo")}>Prototype</button></div></section>
        </nav>
      </Modal>
    );
  if (o.kind === "tripPicker") return <TripPicker />;
  if (o.kind === "invitation") {
    const trip = s.trips.find((t) => t.id === o.data.tripId),
      m = trip?.members.find((m) => m.id === o.data.userId);
    if (!trip || !m) return null;
    if (trip.persistence === "account")
      return (
        <Modal title="Traveler details">
          <h2>{m.name}</h2>
          <p>
            {m.email} · {m.role}
          </p>
          <p>
            This traveler is saved with your trip. Adding them as a guest lets
            you include them in plans and expense splits; it does not give
            another account access or send an invitation.
          </p>
          <Button
            onClick={() => {
              updateTrip((t) => {
                t.members.find((person) => person.id === m.id)!.status =
                  "accepted";
              });
              close();
            }}
          >
            Add as guest traveler
          </Button>
        </Modal>
      );
    return (
      <Modal title="You’re invited">
        <Badge>FICTIONAL INVITATION PREVIEW</Badge>
        <h2>{trip.title}</h2>
        <p>
          {dateText(trip.start, true)}–{dateText(trip.end, true)} ·{" "}
          {trip.destinations.join(", ")}
        </p>
        <p>
          Joining as <strong>{m.name}</strong>, with <strong>{m.role}</strong>{" "}
          access.
        </p>
        <p className="fine-print">
          Accepting switches the prototype to this fictional participant. No
          invitation was sent.
        </p>
        <div className="form-actions">
          <Button
            variant="text"
            onClick={() => {
              mutate((v) => {
                const t = v.trips.find((t) => t.id === trip.id)!;
                t.members = t.members.filter((x) => x.id !== m.id);
              });
              toast("Demo invitation declined.");
              close();
            }}
          >
            Decline
          </Button>
          <Button
            onClick={() => {
              mutate((v) => {
                const target = v.trips.find((t) => t.id === trip.id)!;
                target.members.find((x) => x.id === m.id)!.status = "accepted";
                if (!v.users.some((u) => u.id === m.id))
                  v.users.push({
                    id: m.id,
                    name: m.name,
                    email: m.email,
                    connections: {},
                  });
                v.userId = m.id;
                v.tripId = trip.id;
              });
              go(15);
              toast("Invitation accepted. Tell the group what you enjoy.");
            }}
          >
            Accept & share preferences <ArrowRight size={15} />
          </Button>
        </div>
      </Modal>
    );
  }
  if (o.kind === "settle" && t) return <RepaymentForm />;
  if (o.kind === "transaction") {
    const finishTransaction = () => {
      o.data?.onResolved?.();
      close();
    };
    return (
      <Modal title="A little purchase, logged" onClose={finishTransaction}>
        <Badge>DEMO TRANSACTION NOTIFICATION</Badge>
        <h3>$6.50 · sample coffee</h3>
        <p>
          A fictional transaction was added to Food. This simulates the
          experience; no banking notifications are read.
        </p>
        <div className="form-actions">
          <Button
            variant="outline"
            onClick={() => {
              updateTrip(
                (t) =>
                  (t.expenses = t.expenses.filter(
                    (e) => e.id !== "demo-transaction",
                  )),
              );
              toast("Sample transaction removed.", "budget");
              finishTransaction();
            }}
          >
            Undo
          </Button>
          <Button onClick={finishTransaction}>Keep expense</Button>
        </div>
      </Modal>
    );
  }
  if (o.kind === "nearby") return <NearbySuggestions key={t?.id || "no-trip"} />;
  return null;
}

function PlannedTripPreview() {
  const { overlay, close, go } = useApp();
  const planned = plannedTrip(overlay?.data?.id ?? null);
  if (!planned) return null;
  return (
    <Modal title={planned.title} wide footer={      <div className="form-actions planned-modal-actions">
        <Button variant="outline" onClick={close}>Keep browsing</Button>
        <Button onClick={() => go(6, { template: planned.id })}>Add this trip <ArrowRight size={17} /></Button>
      </div>}>
      <div className="planned-modal-intro">
        <img src={planned.image} alt={`${planned.destinations[0]} scenery`} />
        <div>
          <span className="eyebrow">{planned.days} day starter itinerary</span>
          <p>{planned.summary}</p>
          <p className="planned-modal-estimate"><strong>${planned.estimate}</strong> / person · illustrative estimate</p>
        </div>
      </div>
      <h3 className="planned-modal-subhead">A look at the itinerary</h3>
      <ol className="planned-stop-list planned-modal-stops">
        {planned.stops.map((stop, index) => (
          <li key={`${stop.day}-${stop.name}-${index}`}>
            <span className="planned-stop-day">Day {stop.day + 1}</span>
            <span><strong>{stop.name}</strong><small>{timeText(stop.start)}–{timeText(stop.end)} · {stop.place}</small></span>
          </li>
        ))}
      </ol>
      <p className="muted planned-estimate-note">Choose your dates and destinations next. You can edit activities after creating the trip.</p>
    </Modal>
  );
}
