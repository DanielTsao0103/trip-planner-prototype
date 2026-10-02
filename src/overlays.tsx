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
  isActive,
  isOwner,
  member,
  money,
  uid,
  splitCents,
  type Role,
} from "./domain";
import { BudgetSetup, ExpenseForm } from "./finance";
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
          <p>This account hasn’t joined Trip Planner yet.</p>
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
  const { trip: t, s, updateTrip, close, toast } = useApp();
  const [email, setEmail] = useState(""),
    [name, setName] = useState(""),
    [error, setError] = useState("");
  if (!t || !isOwner(t, s.userId)) return null;
  return (
    <Modal title="A trip is better together">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const address = email.trim().toLowerCase();
          if (t.members.some((m) => m.email === address)) {
            setError("This person is already invited or part of the trip.");
            return;
          }
          updateTrip((t) =>
            t.members.push({
              id: s.users.find((u) => u.email === address)?.id || uid(),
              name: name.trim(),
              email: address,
              role: "Viewer",
              days: [],
              status: "pending",
            }),
          );
          toast("Fictional invitation created. No email was sent.");
          close();
        }}
      >
        <Field label="Fictional name">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex Morgan"
          />
        </Field>
        <Field label="Fictional email">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="alex@example.com"
          />
        </Field>
        <p className="note">
          They’ll start as a Viewer. Adjust their permissions afterward.
        </p>
        <ErrorBox text={error} />
        <Button variant="full" type="submit">
          Create demo invitation <Mail size={16} />
        </Button>
      </form>
    </Modal>
  );
}
function Permissions() {
  const { trip: t, s, overlay, updateTrip, close, toast } = useApp();
  const m = t?.members.find((m) => m.id === overlay?.data?.memberId);
  const [role, setRole] = useState<Role>(m?.role || "Viewer"),
    [dates, setDates] = useState(m?.days || []),
    [error, setError] = useState("");
  if (!t || !m || !isOwner(t, s.userId) || m.id === s.userId) return null;
  return (
    <Modal title={`Permissions for ${m.name}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (role === "Day Editor" && !dates.length) {
            setError("Assign at least one day.");
            return;
          }
          updateTrip((t) => {
            const target = t.members.find((x) => x.id === m.id)!;
            target.role = role;
            target.days = role === "Day Editor" ? dates : [];
          });
          toast("Permissions updated.");
          close();
        }}
      >
        <Field label="Role">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
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
                  checked={dates.includes(d)}
                  onChange={(e) =>
                    setDates(
                      e.target.checked
                        ? [...dates, d]
                        : dates.filter((x) => x !== d),
                    )
                  }
                />
                <span>
                  Day {i + 1} · {dateText(d)}
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <ErrorBox text={error} />
        <Button type="submit" variant="full">
          Save permissions
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
                  payer: s.userId!,
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
  const { s, user, trip, route, mutate, go, close, explore, toast } = useApp();
  const [date, setDate] = useState(s.date),
    [time, setTime] = useState(s.time);
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
    <Modal title="Prototype controls" wide>
      <p className="fine-print">
        Fictional data, local browser storage, simulated integrations. These
        controls let you explore scenarios without changing any real account.
      </p>
      <div className="demo-grid">
        <div className="card">
          <h3>Try the experience</h3>
          <Button variant="outline full" onClick={explore}>
            Explore the sample trip
          </Button>
          <Button
            variant="outline full"
            onClick={() => {
              mutate((v) => {
                v.userId = null;
                v.tripId = null;
                delete v.sampleReturn;
              });
              go(1);
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
                toast("Participant changed. Permissions update immediately.");
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
              toast("Sample trips restored. Your own trips are unchanged.");
            }}
          >
            Restore sample trips
          </Button>
        </div>
        <div className="card">
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
              ["Before", "2026-10-14"],
              ["During", "2026-10-16"],
              ["After", "2026-10-19"],
            ].map(([label, d]) => (
              <button key={label} className="chip" onClick={() => setDate(d)}>
                {label}
              </button>
            ))}
          </div>
          <p className="fine-print">
            Date/time are interpreted in{" "}
            {trip?.zone || "the selected trip’s time zone"}. Active dates open
            Today. Other dates open Home.
          </p>
          <Button
            variant="full"
            disabled={!s.userId || !date || !time}
            onClick={landing}
          >
            Apply & preview landing <ArrowRight size={15} />
          </Button>
          <h3>Your testing session</h3>
          <p className="fine-print">
            New trips are saved only in this browser. Another tester opens their
            own independent copy. A share link does not synchronize trip edits.
          </p>
        </div>
      </div>
      <h3>Screen index</h3>
      <div className="screen-index">
        {Object.entries(PAGES).map(([id, label]) => (
          <button
            disabled={id === "14" || (!user && Number(id) > 1)}
            key={id}
            onClick={() => {
              const p = Number(id);
              if (p === 3) {
                go(3, { service: "Gmail" });
                return;
              }
              if ([7, 8, 9, 10, 11, 12, 13, 15, 16, 17].includes(p) && !trip) {
                mutate((v) => {
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
        <p>{o.data.body}</p>
        <Button variant="full" onClick={close}>
          Got it
        </Button>
      </Modal>
    );
  if (o.kind === "skip") {
    const missing = SERVICES.filter((service) =>
      PERMISSIONS(service).some(
        (p) => !user?.connections[service]?.includes(p),
      ),
    );
    return (
      <Modal title="You can travel a little lighter">
        <p>Without these connections, a few extras will be unavailable:</p>
        <ul className="clean-list">
          {missing.map((service) => (
            <li key={service}>
              <span>•</span>
              {service === "Gmail"
                ? "Gmail receipt matching"
                : `${service} inspiration in your suggestions`}
            </li>
          ))}
        </ul>
        <p>
          You can still create trips, enter events, upload sample confirmations,
          and use preference-based suggestions.
        </p>
        <div className="form-actions">
          <Button variant="outline" onClick={close}>
            Keep connecting
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
            Skip & continue
          </Button>
        </div>
      </Modal>
    );
  }
  if (o.kind === "menu")
    return (
      <Modal title="Your next stop">
        <div className="menu-links">
          <button onClick={() => open("account")}>
            Your account <Users size={17} />
          </button>
          {[
            [4, "Home"],
            [5, "All trips"],
            [6, "New trip"],
            [12, "Budget"],
            [11, "Calendar"],
            [17, "Map"],
            [13, "Collaborators"],
            [9, "Suggestions"],
            [15, "My preferences"],
          ].map(([p, label]) => (
            <button
              key={p}
              onClick={() =>
                Number(p) < 7 ? go(Number(p)) : tripGo(Number(p))
              }
            >
              {label}
              <ArrowRight size={17} />
            </button>
          ))}
          <button
            onClick={() =>
              open("message", {
                title: "Pre-planned trips",
                body: "Coming soon. For now, explore the built-in fictional trip or create your own.",
              })
            }
          >
            Pre-planned trips<Badge>Coming soon</Badge>
          </button>
        </div>
      </Modal>
    );
  if (o.kind === "account")
    return (
      <Modal title="Your corner of the trip">
        <div className="person">
          <Avatar name={user?.name || "Guest"} />
          <div>
            <strong>{user?.name}</strong>
            <small>{user?.email}</small>
          </div>
        </div>
        <div className="menu-links">
          <button onClick={() => tripGo(15)}>
            My travel preferences
            <ArrowRight size={16} />
          </button>
          <button onClick={() => go(5)}>
            My trips
            <ArrowRight size={16} />
          </button>
          <button onClick={() => open("demo")}>
            Switch demo participant
            <Users size={16} />
          </button>
          <button
            onClick={() => {
              mutate((v) => {
                v.userId = null;
                v.tripId = null;
              });
              go(1);
            }}
          >
            Log out
            <LogOut size={16} />
          </button>
        </div>
      </Modal>
    );
  if (o.kind === "tripPicker") {
    const trips = s.trips.filter(
      (t) =>
        member(t, s.userId) && (!o.data?.activeOnly || isActive(t, s.date)),
    );
    return (
      <Modal title="Which trip are we planning?">
        <div className="trip-picker">
          {trips.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                mutate((v) => (v.tripId = t.id));
                go(o.data?.target || 8);
              }}
            >
              <MapPin size={20} />
              <span>
                <strong>{t.title}</strong>
                <small>
                  {dateText(t.start, true)} – {dateText(t.end, true)}
                </small>
              </span>
              <ArrowRight size={17} />
            </button>
          ))}
        </div>
        {!trips.length && (
          <Empty
            title="Your first trip starts here."
            body="Create one to use your budget, calendar, map, and group tools."
          />
        )}
        <Button
          variant="outline full"
          onClick={() => go(6, { next: String(o.data?.target || 8) })}
        >
          <Plus size={16} />
          Create a new trip
        </Button>
      </Modal>
    );
  }
  if (o.kind === "invitation") {
    const trip = s.trips.find((t) => t.id === o.data.tripId),
      m = trip?.members.find((m) => m.id === o.data.userId);
    if (!trip || !m) return null;
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
  if (o.kind === "settle" && t) {
    const expense = t.expenses.find((e) => e.id === o.data.expenseId);
    if (!expense || expense.payer !== s.userId)
      return (
        <Modal title="Only the creditor can mark this paid">
          <Button onClick={close}>Close</Button>
        </Modal>
      );
    return (
      <Modal title="All square?">
        <p>
          Record that you received{" "}
          <strong>{money(expense.shares[o.data.debtor])}</strong> for{" "}
          {expense.purpose}.
        </p>
        <p className="fine-print">
          This only updates the reimbursement log. No money is transferred or
          verified.
        </p>
        <Button
          variant="full"
          onClick={() => {
            updateTrip((t) =>
              t.expenses
                .find((e) => e.id === expense.id)!
                .settled.push(o.data.debtor),
            );
            toast("Repayment marked completed. Spending totals are unchanged.");
            close();
          }}
        >
          Mark completed <Check size={16} />
        </Button>
      </Modal>
    );
  }
  if (o.kind === "transaction")
    return (
      <Modal title="A little purchase, logged">
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
              toast("Sample transaction removed.");
              close();
            }}
          >
            Undo
          </Button>
          <Button onClick={close}>Keep expense</Button>
        </div>
      </Modal>
    );
  if (o.kind === "nearby") {
    const eligible =
      t &&
      isActive(t, s.date) &&
      s.location &&
      !s.noticeDismissed &&
      (t.prefs[s.userId!]?.walk === undefined ||
        t.prefs[s.userId!].walk >= 214);
    const dismiss = () => {
      mutate((v) => (v.noticeDismissed = true));
      if (app.route.page === 16) go(10);
      else close();
    };
    return (
      <Modal
        title={
          eligible ? "A good little detour." : "No nearby suggestion right now"
        }
      >
        {eligible ? (
          <>
            <Badge tone="green">
              <Sparkles size={13} />A SAMPLE MATCH FOR YOU
            </Badge>
            <div className="nearby-photo" />
            <h2>Cedar Gallery</h2>
            <p>
              A little local art, just around the corner. Matches cultural
              interests and the sample step-free preference.
            </p>
            <div className="nearby-stats">
              <span>
                <MapPin size={16} />
                420 ft nearby
              </span>
              <span>700 ft route · about 4 min</span>
            </div>
            <p className="fine-print">
              Simulated location and suitability. The roughly 500-foot trigger
              is straight-line proximity, not walking distance. Actual access
              needs checking.
            </p>
            <div className="form-actions">
              <Button variant="outline" onClick={dismiss}>
                No
              </Button>
              <Button
                onClick={() => {
                  mutate((v) => (v.noticeDismissed = true));
                  go(17, { place: "Cedar Gallery · nearby sample" });
                }}
              >
                Go <ArrowRight size={17} />
              </Button>
            </div>
          </>
        ) : (
          <>
            <p>
              {!t
                ? "Choose a trip first."
                : !isActive(t, s.date)
                  ? "Nearby suggestions appear during active trip dates."
                  : !s.location
                    ? "Enable the simulated location in demo controls."
                    : s.noticeDismissed
                      ? "You dismissed the sample suggestion. You can reset it below."
                      : "The sample route exceeds your saved walking limit."}
            </p>
            <Button
              variant="outline"
              onClick={() => mutate((v) => (v.noticeDismissed = false))}
            >
              Reset nearby suggestion
            </Button>
            <Button variant="text" onClick={() => open("demo")}>
              Demo controls
            </Button>
          </>
        )}
      </Modal>
    );
  }
  return null;
}
