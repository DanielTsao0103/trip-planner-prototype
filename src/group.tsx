import React, { useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Leaf,
  Accessibility,
  Footprints,
  Utensils,
  Plus,
  Settings2,
  Sparkles,
  Ticket,
  Wallet,
  Users,
  Trash2,
  Mail,
} from "lucide-react";
import { useApp } from "./state";
import { Avatar, Badge, Button, ErrorBox, Field, PageHead } from "./ui";
import { blankPrefs, dateText, isOwner, type Preference } from "./domain";
export function Group() {
  const { trip: t, s, go, open, updateTrip, toast } = useApp();
  if (!t) return null;
  const owner = isOwner(t, s.userId);
  const responses = t.members.filter(
    (m) => m.status === "accepted" && t.prefs[m.id],
  );
  const tiles = [
    { title: "At the table", Icon: Leaf, keys: ["diet"] },
    {
      title: "A taste of somewhere",
      Icon: Utensils,
      keys: ["food", "dining", "atmosphere"],
    },
    { title: "Spending comfort", Icon: Wallet, keys: ["spending"] },
    { title: "Getting around", Icon: Accessibility, keys: ["access", "walk"] },
    {
      title: "What catches our eye",
      Icon: Sparkles,
      keys: ["interests", "destinations"],
    },
    { title: "A little preparation", Icon: Ticket, keys: ["tickets", "notes"] },
  ];
  return (
    <>
      <PageHead
        eyebrow="DIFFERENT PEOPLE. A SHARED ADVENTURE."
        title="Make it good for everyone."
        description="The little preferences that make a big difference."
        action={
          <Button variant="outline" onClick={() => go(15)}>
            My preferences <ArrowRight size={16} />
          </Button>
        }
      />
      <div className="section-title">
        <div>
          <h2>A picture of your people.</h2>
          <p>
            {responses.length} of{" "}
            {t.members.filter((m) => m.status === "accepted").length} travelers
            have shared preferences.
          </p>
        </div>
        <Badge tone="green">Visible to the group</Badge>
      </div>
      <div className="preference-grid">
        {tiles.map(({ title, Icon, keys }) => {
          const counts: Record<string, string[]> = {};
          responses.forEach((m) => {
            const p = t.prefs[m.id];
            keys.forEach((k) => {
              const value = p[k as keyof Preference];
              const values = Array.isArray(value)
                ? value
                : [k === "walk" ? `Walks up to ${value}m` : String(value)];
              values.filter(Boolean).forEach((v) => {
                counts[v] = [...(counts[v] || []), m.name];
              });
            });
          });
          return (
            <article className="card preference-tile" key={title}>
              <div className="tile-icon">
                <Icon size={22} strokeWidth={1.5} />
              </div>
              <h3>{title}</h3>
              {Object.entries(counts).length ? (
                <div className="preference-values">
                  {Object.entries(counts).map(([value, names]) => (
                    <details key={value}>
                      <summary>
                        {value}
                        <span>{names.length}</span>
                      </summary>
                      <small>{names.join(", ")}</small>
                    </details>
                  ))}
                </div>
              ) : (
                <p className="muted">Nothing shared yet.</p>
              )}
            </article>
          );
        })}
      </div>
      <div className="note">
        Different preferences stay visible. Unanswered surveys don’t mean no
        restrictions. Venue suitability still needs checking.
      </div>
      <div className="section-title collaborators-title">
        <div>
          <span className="eyebrow">THE PEOPLE PART</span>
          <h2>Your travel circle.</h2>
        </div>
        {owner && (
          <Button onClick={() => open("inviteMember")}>
            <Plus size={16} />
            Invite someone
          </Button>
        )}
      </div>
      <div className="card collaborators-table">
        <div className="collaborator-table-head">
          <span>TRAVELER</span>
          <span>ROLE & ACCESS</span>
          <span>STATUS</span>
          <span />
        </div>
        {t.members.map((m, i) => (
          <div className="collaborator-row" key={m.id}>
            <div className="person">
              <Avatar name={m.name} index={i} />
              <div>
                <strong>
                  {m.name}
                  {m.id === s.userId ? " (you)" : ""}
                </strong>
                <small>{m.email}</small>
              </div>
            </div>
            <div>
              <Badge tone={m.role === "Owner" ? "green" : ""}>{m.role}</Badge>
              {m.role === "Day Editor" && (
                <small className="assigned-days">
                  {m.days.length
                    ? m.days.map((d) => dateText(d, true)).join(", ")
                    : "No days assigned"}
                </small>
              )}
            </div>
            <span className={`member-status ${m.status}`}>
              <span className="status-dot" />
              {m.status === "accepted" ? "Joined" : "Invited · demo"}
            </span>
            <div className="collaborator-actions">
              {owner && m.id !== s.userId && (
                <>
                  <button
                    className="icon-btn"
                    aria-label={`Change permissions for ${m.name}`}
                    onClick={() => open("permissions", { memberId: m.id })}
                  >
                    <Settings2 size={17} />
                  </button>
                  <button
                    className="icon-btn"
                    aria-label={`Remove ${m.name}`}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remove ${m.name} from this trip? Their historical records will remain.`,
                        )
                      ) {
                        updateTrip(
                          (t) =>
                            (t.members = t.members.filter(
                              (x) => x.id !== m.id,
                            )),
                        );
                        toast(
                          "Collaborator removed. Historical expenses are preserved.",
                        );
                      }
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              )}
              {m.status === "pending" && owner && (
                <button
                  className="text-link"
                  onClick={() =>
                    open("invitation", { tripId: t.id, userId: m.id })
                  }
                >
                  Preview invite
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {!owner && (
        <p className="fine-print">
          Only the Owner can invite, remove, or change permissions.
        </p>
      )}
    </>
  );
}
function Choices({
  label,
  values,
  selected,
  onChange,
}: {
  label: string;
  values: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <fieldset className="choice-field">
      <legend>{label}</legend>
      <div className="choice-chips">
        {values.map((v) => (
          <label className={selected.includes(v) ? "selected" : ""} key={v}>
            <input
              type="checkbox"
              checked={selected.includes(v)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...selected, v]
                    : selected.filter((x) => x !== v),
                )
              }
            />
            {selected.includes(v) && <Check size={13} />}
            <span>{v}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
export function Survey() {
  const { trip: t, s, go, updateTrip, toast } = useApp();
  if (!t) return null;
  const [p, setP] = useState<Preference>(
      structuredClone(t.prefs[s.userId!] || blankPrefs()),
    ),
    [error, setError] = useState(""),
    [step, setStep] = useState(0);
  const set = <K extends keyof Preference>(key: K, value: Preference[K]) =>
    setP({ ...p, [key]: value });
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (p.walk < 0 || p.walk > 100000) {
      setError("Enter a walking limit between 0 and 100,000 meters.");
      return;
    }
    updateTrip((t) => (t.prefs[s.userId!] = p));
    toast("Your preferences are now reflected in the group’s tiles.");
    go(13);
  };
  return (
    <>
      <PageHead
        eyebrow="YOUR PART OF THE PLAN"
        title="What makes a good trip for you?"
        description="Share a little about yourself. We’ll help the plan fit the people."
      />
      <form className="survey-layout" onSubmit={save}>
        <aside className="survey-nav">
          <div className="card">
            <span className="eyebrow">A FEW LITTLE DETAILS</span>
            {["Food & dining", "Places & pace", "The practical things"].map(
              (label, i) => (
                <button
                  type="button"
                  className={step === i ? "active" : ""}
                  key={label}
                  onClick={() => setStep(i)}
                >
                  <span>{i + 1}</span>
                  {label}
                  <ChevronRight size={15} />
                </button>
              ),
            )}
          </div>
          <p className="fine-print">
            Your answers are shared with everyone on this trip. Use fictional
            details in this prototype.
          </p>
        </aside>
        <div className="card form-card">
          {step === 0 && (
            <>
              <div className="step-heading">
                <span>01</span>
                <h2>Good food, your way.</h2>
              </div>
              <Choices
                label="Dietary preferences & restrictions"
                values={[
                  "No restrictions",
                  "Vegetarian",
                  "Vegan",
                  "Gluten avoidance",
                  "Peanut avoidance",
                  "Dairy avoidance",
                  "Halal",
                  "Kosher",
                ]}
                selected={p.diet}
                onChange={(v) =>
                  set(
                    "diet",
                    v.includes("No restrictions") &&
                      v[v.length - 1] === "No restrictions"
                      ? ["No restrictions"]
                      : v.filter((x) => x !== "No restrictions"),
                  )
                }
              />
              <Field label="Local flavors or familiar favorites?">
                <select
                  value={p.food}
                  onChange={(e) => set("food", e.target.value)}
                >
                  {[
                    "Local favorites",
                    "Familiar favorites",
                    "A little of both",
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <div className="form-columns">
                <Field label="Spending comfort">
                  <select
                    value={p.spending}
                    onChange={(e) => set("spending", e.target.value)}
                  >
                    {["Budget-conscious", "Moderate", "Room to splurge"].map(
                      (v) => (
                        <option key={v}>{v}</option>
                      ),
                    )}
                  </select>
                </Field>
                <Field label="Dining style">
                  <select
                    value={p.dining}
                    onChange={(e) => set("dining", e.target.value)}
                  >
                    {[
                      "Casual & simple",
                      "A little extravagant",
                      "A mix of both",
                    ].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Restaurant atmosphere">
                <select
                  value={p.atmosphere}
                  onChange={(e) => set("atmosphere", e.target.value)}
                >
                  {["Relaxed", "Quiet", "Lively", "Fine dining"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
            </>
          )}
          {step === 1 && (
            <>
              <div className="step-heading">
                <span>02</span>
                <h2>Your kind of exploring.</h2>
              </div>
              <Choices
                label="Things you like to see and do"
                values={[
                  "Modern architecture",
                  "History",
                  "Culture",
                  "Art",
                  "Nature",
                  "Shopping",
                  "Food experiences",
                  "Rest & downtime",
                ]}
                selected={p.interests}
                onChange={(v) => set("interests", v)}
              />
              <Field label="Places you’d love to include">
                <textarea
                  rows={3}
                  value={p.destinations}
                  onChange={(e) => set("destinations", e.target.value)}
                  placeholder="A neighborhood, a museum, a little place you heard about…"
                />
              </Field>
              <Choices
                label="Accessibility needs"
                values={[
                  "Step-free access",
                  "Wheelchair access",
                  "Places to sit",
                  "Accessible restrooms",
                  "Low-sensory spaces",
                ]}
                selected={p.access}
                onChange={(v) => set("access", v)}
              />
              <Field
                label="Maximum comfortable continuous walk (meters)"
                hint="For example, 400m. A planning preference, not a verified route guarantee."
              >
                <input
                  type="number"
                  min="0"
                  max="100000"
                  value={p.walk}
                  onChange={(e) => set("walk", Number(e.target.value))}
                />
              </Field>
            </>
          )}
          {step === 2 && (
            <>
              <div className="step-heading">
                <span>03</span>
                <h2>The practical little things.</h2>
              </div>
              <Field label="Tickets and reservations">
                <select
                  value={p.tickets}
                  onChange={(e) => set("tickets", e.target.value)}
                >
                  {[
                    "Happy to book ahead",
                    "Prefer flexible / walk-in plans",
                    "Need help with advance tickets",
                    "Prefer free activities",
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </Field>
              <Field label="Anything else the group should know?">
                <textarea
                  rows={5}
                  value={p.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  placeholder="Other food needs, a slower pace, timing constraints…"
                />
              </Field>
              <div className="info-banner">
                <Users size={18} />
                <span>
                  Saving updates the shared preference tiles immediately. You
                  can come back and change your answers.
                </span>
              </div>
            </>
          )}
          <ErrorBox text={error} />
          <div className="form-actions">
            <Button
              variant="text"
              onClick={() => (step ? setStep(step - 1) : go(13))}
            >
              {step ? "Back" : "Cancel"}
            </Button>
            {step < 2 ? (
              <Button onClick={() => setStep(step + 1)}>
                Next <ArrowRight size={16} />
              </Button>
            ) : (
              <Button type="submit">
                Save my preferences <Check size={16} />
              </Button>
            )}
          </div>
        </div>
      </form>
    </>
  );
}
