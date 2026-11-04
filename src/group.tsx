/** Implementation status: Account survey answers and guest traveler roles/days are database-backed. Guest records do not grant Auth-account access; actual collaborator invitations are not implemented. See ../IMPLEMENTATION_STATUS.md. */
import { TEXT_LIMITS, textError } from "./limits.ts";
import React, { useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Carrot,
  Check,
  ChevronRight,
  Leaf,
  Accessibility,
  Armchair,
  DoorOpen,
  Footprints,
  MilkOff,
  MoonStar,
  NutOff,
  Sprout,
  WheatOff,
  Utensils,
  Plus,
  PersonStanding,
  Settings2,
  Sparkles,
  Tag,
  Ticket,
  Wallet,
  Users,
  VolumeX,
  Trash2,
  Mail,
} from "lucide-react";
import { useApp } from "./state";
import { Avatar, Badge, Button, ErrorBox, Field, PageHead } from "./ui";
import { blankPrefs, dateText, isOwner, type Preference } from "./domain";

function DiningSectionGraphic({ kind }: { kind: "city-town" | "plate" | "disco-chandelier" }) {
  const common = {
    width: 21,
    height: 21,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.45,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (kind === "city-town") {
    return (
      <svg {...common}>
        <path d="M2.5 19V9h3V5h4v14M2.5 19h9" />
        <path d="M4 12h1m2-4h1m-1 4h1m-1 4h1" />
        <path d="M12 19V11l5-5 5 5v8M14.5 19v-4h2.5v4m2-6h.01" />
        <path d="M12 3v18" strokeDasharray="1.5 2" />
      </svg>
    );
  }
  if (kind === "plate") {
    return (
      <svg {...common}>
        <path d="M3.5 4v5m-2-5v3.2a2 2 0 0 0 4 0V4m-2 5v11" />
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="5.5" />
        <path d="M20.5 4c-1.3 1.5-1.8 3.5-1.8 5.5V11h3V4m-1.5 7v9" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M2.5 6.5V3.8A1.3 1.3 0 0 1 3.8 2.5h6.4a1.3 1.3 0 0 1 1.3 1.3v2.7a1.3 1.3 0 0 1-1.3 1.3H6.5l-2.4 1.8V7.8a1.3 1.3 0 0 1-1.6-1.3Z" />
      <path d="M13 5h6.7A1.3 1.3 0 0 1 21 6.3V9a1.3 1.3 0 0 1-1.3 1.3h-.2v1.8l-2.4-1.8H13A1.3 1.3 0 0 1 11.7 9V6.3A1.3 1.3 0 0 1 13 5Z" />
      <circle cx="7" cy="13" r="2" />
      <circle cx="17" cy="13" r="2" />
      <path d="M2.8 20.5c.3-2.8 1.8-4.2 4.2-4.2s3.9 1.4 4.2 4.2m1.6 0c.3-2.8 1.8-4.2 4.2-4.2s3.9 1.4 4.2 4.2" />
    </svg>
  );
}

function RampGraphic() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 19h18M4 18l15-9M7 16v-3m4 1v-3m4-1V7" />
    </svg>
  );
}

function MobilityRouteGraphic() {
  return (
    <svg className="mobility-route-art" viewBox="0 0 320 140" preserveAspectRatio="none" aria-hidden="true">
      <path className="mobility-route-path" d="M18 92c36 27 59 13 82-13s46-38 73-21 48 34 72 20 37-31 57-47" />
      <path className="mobility-route-grass" d="M19 120c18-14 34-14 55 0M246 119c18-10 33-12 55-1" />
    </svg>
  );
}

export function Group() {
  const { trip: t, s, go, open, updateTrip, toast } = useApp();
  if (!t) return null;
  const owner = isOwner(t, s.userId);
  const responses = t.members.filter(
    (m) => m.status === "accepted" && t.prefs[m.id],
  );
  const dietaryIcons: Record<string, typeof Leaf> = {
    Vegetarian: Carrot,
    Vegan: Sprout,
    "Gluten avoidance": WheatOff,
    "Peanut avoidance": NutOff,
    "Dairy avoidance": MilkOff,
    Halal: MoonStar,
    Kosher: BadgeCheck,
  };
  const tiles = [
    { title: "Dietary requirements", Icon: Leaf, keys: ["diet"] },
    {
      title: "Dining preferences",
      Icon: Utensils,
      keys: ["food", "dining", "atmosphere"],
    },
    { title: "Spending preferences", Icon: Wallet, keys: ["spending"] },
    { title: "Mobility and accessibility", Icon: Accessibility, keys: ["access", "walk"] },
    {
      title: "Interests and destinations",
      Icon: Sparkles,
      keys: ["interests", "destinations"],
    },
    { title: "Tickets and notes", Icon: Ticket, keys: ["tickets", "notes"] },
  ];
  return (
    <>
      <PageHead
        title="The group"
        action={
          <Button variant="outline" onClick={() => go(15)}>
            My preferences <ArrowRight size={16} />
          </Button>
        }
      />
      <div className="section-title">
        <div>
          <h2>Group preferences</h2>
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
          const noRestrictionNames: string[] = [];
          responses.forEach((m) => {
            const p = t.prefs[m.id];
            keys.forEach((k) => {
              const value = p[k as keyof Preference];
              const values = Array.isArray(value)
                ? value
                : [k === "walk" ? `Walks up to ${value}m` : String(value)];
              values.filter(Boolean).forEach((v) => {
                if (title === "Dietary requirements" && v === "No restrictions") {
                  if (!noRestrictionNames.includes(m.name)) noRestrictionNames.push(m.name);
                  return;
                }
                counts[v] = [...(counts[v] || []), m.name];
              });
            });
          });
          const answers = Object.entries(counts).sort(
            ([valueA, namesA], [valueB, namesB]) =>
              namesB.length - namesA.length || valueA.localeCompare(valueB),
          );
          const sharedTravelers = new Set(Object.values(counts).flat()).size;
          const mostSelected = Math.max(1, ...answers.map(([, names]) => names.length));
          const diningSections = [
            { key: "food", label: "Local flavors vs. Familiar favorites", graphic: "city-town" as const },
            { key: "dining", label: "Dining style", graphic: "plate" as const },
            { key: "atmosphere", label: "Restaurant atmosphere", graphic: "disco-chandelier" as const },
          ].map(({ key, label, graphic }) => {
            const values: Record<string, string[]> = {};
            responses.forEach((member) => {
              const value = t.prefs[member.id][key as keyof Preference];
              if (typeof value === "string" && value.trim()) {
                values[value] = [...(values[value] || []), member.name];
              }
            });
            return { label, graphic, options: Object.entries(values).sort(([a], [b]) => a.localeCompare(b)) };
          });
          const spendingLevels = ["Budget-conscious", "Moderate", "Room to splurge"];
          const spendingResponses = responses.flatMap((member) => {
            const value = t.prefs[member.id].spending;
            const level = spendingLevels.indexOf(value);
            return level >= 0 ? [{ member, value, level }] : [];
          });
          const averageSpendingLevel = spendingResponses.length
            ? spendingLevels[Math.round(
                spendingResponses.reduce((sum, response) => sum + response.level, 0) /
                  spendingResponses.length,
              )]
            : null;
          const spendingDistribution = spendingLevels.map((value, level) => ({
            value,
            level,
            members: spendingResponses.filter((response) => response.level === level),
          }));
          const walkGroups = new Map<number, typeof responses>();
          responses.forEach((member) => {
            const distance = Number(t.prefs[member.id].walk);
            if (Number.isFinite(distance) && distance >= 0) {
              walkGroups.set(distance, [...(walkGroups.get(distance) || []), member]);
            }
          });
          const walkingDistances = [...walkGroups.entries()].sort(([a], [b]) => a - b);
          const accessCategories = [
            { label: "Step-free access", Icon: null },
            { label: "Wheelchair access", Icon: Accessibility },
            { label: "Places to sit", Icon: Armchair },
            { label: "Accessible restrooms", Icon: DoorOpen },
            { label: "Low-sensory spaces", Icon: VolumeX },
          ].map(({ label, Icon: AccessIcon }) => ({
            label,
            Icon: AccessIcon,
            members: responses.filter((member) => t.prefs[member.id].access.includes(label)),
          })).filter(({ members }) => members.length > 0);
          return (
            <article className="card preference-tile" key={title}>
              <div className="tile-icon">
                <Icon size={22} strokeWidth={1.5} />
              </div>
              <h3>{title}</h3>
              <p className="preference-response-count">
                {title === "Dietary requirements"
                  ? `${sharedTravelers + noRestrictionNames.length} of ${t.members.filter((m) => m.status === "accepted").length} travelers responded`
                  : `${sharedTravelers} of ${t.members.filter((m) => m.status === "accepted").length} travelers shared`}
              </p>
              {title === "Dining preferences" ? (
                <div className="dining-preference-sections">
                  {diningSections.map(({ label, options, graphic }) => (
                    <section className="dining-preference-section" key={label}>
                      <h4 className="dining-preference-heading">
                        <span className="dining-preference-heading-icon" aria-hidden="true">
                          <DiningSectionGraphic kind={graphic} />
                        </span>
                        <span>{label}</span>
                      </h4>
                      {options.length ? (
                        <div className="dining-preference-options">
                          {options.map(([value, names]) => {
                            const id = `dining-tooltip-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
                            return (
                              <button
                                type="button"
                                className="dining-preference-option"
                                key={value}
                                aria-label={`${value}: ${names.join(", ")}`}
                                aria-describedby={id}
                              >
                                <span className="dining-preference-value">{value}</span>
                                <span className="dining-preference-dots" aria-hidden="true">
                                  {names.map((name, index) => (
                                    <span className="dining-preference-dot" key={`${name}-${index}`} />
                                  ))}
                                </span>
                                <span className="dining-preference-tooltip" id={id} role="tooltip">
                                  <strong>{value}</strong>
                                  <span>{names.join(", ")}</span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="muted preference-empty">Nothing shared yet.</p>
                      )}
                    </section>
                  ))}
                </div>
              ) : title === "Spending preferences" ? (
                spendingResponses.length ? (
                  <div className="spending-preference-chart" aria-label="Group spending comfort scale">
                    <div className="spending-scale-labels" aria-hidden="true">
                      {spendingLevels.map((level) => <span key={level}>{level}</span>)}
                    </div>
                    <div className="spending-scale-track">
                      <span className="spending-scale-line" aria-hidden="true" />
                      {spendingDistribution.map(({ value, level, members }) => (
                        <React.Fragment key={value}>
                          <span
                            className="spending-scale-stop"
                            style={{ left: `${10 + level * 40}%` }}
                            aria-hidden="true"
                          />
                          {members.map(({ member }, index) => {
                            const offset = (index - (members.length - 1) / 2) * 12;
                            const id = `spending-tooltip-${member.id.replace(/[^a-z0-9]+/gi, "-")}`;
                            return (
                              <button
                                type="button"
                                className={`spending-marker spending-marker-${t.members.indexOf(member) % 4}`}
                                key={member.id}
                                style={{
                                  left: `calc(${10 + level * 40}% + ${offset}px)`,
                                }}
                                aria-label={`${member.name}: ${value}`}
                                aria-describedby={id}
                              >
                                <span className="spending-marker-tooltip" id={id} role="tooltip">
                                  <strong>{value}</strong>
                                  <span>{member.name}</span>
                                </span>
                              </button>
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </div>
                    {averageSpendingLevel && (
                      <div className="spending-average">
                        <span className="spending-average-icon" aria-hidden="true"><Tag size={18} /></span>
                        <span><strong>Average Spending Preference:</strong> {averageSpendingLevel}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="muted preference-empty">Nothing shared yet.</p>
                )
              ) : title === "Mobility and accessibility" ? (
                walkingDistances.length || accessCategories.length ? (
                  <div className="mobility-preference-chart">
                    {walkingDistances.length > 0 && (
                      <section className="mobility-walking-section" aria-label="Walking comfort">
                        <div className="mobility-walking-heading">
                          <Footprints size={14} aria-hidden="true" />
                          <span>Comfortable continuous walk</span>
                        </div>
                        <div className="mobility-route-stage" role="group" aria-label="Walking distance preferences">
                          <MobilityRouteGraphic />
                          {walkingDistances.map(([distance, members], index) => {
                            const maxDistance = 2000;
                            const progress = Math.min(distance, maxDistance) / maxDistance;
                            const left = 7 + progress * 86;
                            const top = 67 - Math.sin(progress * Math.PI) * 40;
                            const size = 42 + Math.min(members.length - 1, 3) * 8;
                            const id = `mobility-walk-tooltip-${Math.round(distance)}-${index}`;
                            return (
                              <button
                                type="button"
                                className="mobility-route-marker"
                                key={distance}
                                style={{
                                  left: `${left}%`,
                                  top: `${top}%`,
                                  "--mobility-marker-size": `${size}px`,
                                } as React.CSSProperties}
                                aria-label={`Walks up to ${distance} meters: ${members.map((member) => member.name).join(", ")}`}
                                aria-describedby={id}
                              >
                                <span className="mobility-route-person" aria-hidden="true"><PersonStanding size={20} /></span>
                                {members.length > 1 && <span className="mobility-route-count" aria-hidden="true">{members.length}</span>}
                                <span className="mobility-preference-tooltip" id={id} role="tooltip">
                                  <strong>Up to {distance.toLocaleString()} m</strong>
                                  <span>{members.map((member) => member.name).join(", ")}</span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="mobility-route-range" aria-hidden="true"><span>Shorter walks</span><span>Longer walks</span></div>
                      </section>
                    )}
                    {accessCategories.length > 0 && (
                      <section className="mobility-access-section" aria-label="Accessibility preferences">
                        <h4>Access needs</h4>
                        <div className="mobility-access-grid">
                          {accessCategories.map(({ label, Icon: AccessIcon, members }) => {
                            const id = `mobility-access-tooltip-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
                            return (
                              <button
                                type="button"
                                className="mobility-access-option"
                                key={label}
                                aria-label={`${label}: ${members.map((member) => member.name).join(", ")}`}
                                aria-describedby={id}
                              >
                                <span className="mobility-access-icon" aria-hidden="true">
                                  {AccessIcon ? <AccessIcon size={15} strokeWidth={1.7} /> : <RampGraphic />}
                                </span>
                                <span className="mobility-access-label">{label}</span>
                                <span className="mobility-access-dots" aria-hidden="true">
                                  {members.map((member) => <span className="mobility-access-dot" key={member.id} />)}
                                </span>
                                <span className="mobility-preference-tooltip" id={id} role="tooltip">
                                  <strong>{label}</strong>
                                  <span>{members.map((member) => member.name).join(", ")}</span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    )}
                  </div>
                ) : (
                  <p className="muted preference-empty">Nothing shared yet.</p>
                )
              ) : title === "Dietary requirements" ? (
                <>
                  {answers.length > 0 && (
                    <div className="dietary-bubble-chart" role="group" aria-label="Dietary preferences and restrictions">
                      {answers.map(([value, names]) => {
                        const Icon = dietaryIcons[value] || Leaf;
                        const size = 48 + Math.min(names.length - 1, 4) * 12;
                        const id = `dietary-tooltip-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
                        return (
                          <button
                            type="button"
                            className="dietary-bubble-item"
                            key={value}
                            style={{ "--bubble-size": `${size}px` } as React.CSSProperties}
                            aria-label={`${value}: ${names.join(", ")}`}
                            aria-describedby={id}
                          >
                            <span className="dietary-bubble" aria-hidden="true">
                              <Icon size={Math.round(size * 0.36)} strokeWidth={1.7} />
                              <span className="dietary-bubble-count">{names.length}</span>
                            </span>
                            <span className="dietary-bubble-label">{value}</span>
                            <span className="dietary-bubble-tooltip" id={id} role="tooltip">
                              <strong>{value}</strong>
                              <span>{names.join(", ")}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {noRestrictionNames.length > 0 && (
                    <p className="dietary-no-restrictions">
                      No restrictions <span>{noRestrictionNames.length}</span>
                    </p>
                  )}
                  {answers.length === 0 && noRestrictionNames.length === 0 && (
                    <p className="muted preference-empty">Nothing shared yet.</p>
                  )}
                </>
              ) : answers.length ? (
                <div className="preference-values">
                  {answers.map(([value, names]) => (
                    <details key={value} className="preference-answer">
                      <summary aria-label={`${value}: ${names.length} ${names.length === 1 ? "traveler" : "travelers"}`}>
                        {value}
                        <span className="preference-answer-count">{names.length}</span>
                        <span className="preference-answer-bar" aria-hidden="true">
                          <span style={{ width: `${(names.length / mostSelected) * 100}%` }} />
                        </span>
                      </summary>
                      <small>{names.join(", ")}</small>
                    </details>
                  ))}
                </div>
              ) : (
                <p className="muted preference-empty">Nothing shared yet.</p>
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
          <h2>Travelers</h2>
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
        {t.members
          .filter((m) => m.status !== "removed")
          .map((m, i) => (
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
                {m.status === "accepted"
                  ? "Joined"
                  : t.persistence === "account"
                    ? "Pending"
                    : "Invited · demo"}
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
                    {t.persistence === "account"
                      ? "Manage traveler"
                      : "Preview invite"}
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
    const problem =
      textError(
        p.destinations,
        "Places to include",
        TEXT_LIMITS.preferencePlaces,
      ) || textError(p.notes, "Additional notes", TEXT_LIMITS.notes);
    if (problem) {
      setError(problem);
      return;
    }
    if (!Number.isFinite(p.walk) || p.walk < 0 || p.walk > 100000) {
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
                  maxLength={TEXT_LIMITS.preferencePlaces}
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
                  maxLength={TEXT_LIMITS.notes}
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
