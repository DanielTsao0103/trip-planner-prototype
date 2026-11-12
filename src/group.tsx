/** Implementation status: Account survey answers and guest traveler roles/days are database-backed. Owners can assign editing roles to accepted accounts. See ../IMPLEMENTATION_STATUS.md. */
import { TEXT_LIMITS, textError } from "./limits.ts";
import "./group-refinement.css";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Carrot,
  Check,
  ChevronRight,
  ChevronDown,
  Leaf,
  Landmark,
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
  Palette,
  Settings2,
  Sparkles,
  Tag,
  Building2,
  CookingPot,
  ShoppingBag,
  TreePine,
  Ticket,
  Wallet,
  Users,
  VolumeX,
  Trash2,
  Mail,
  Trees,
  MapPin,
  NotebookPen,
  type LucideIcon,
} from "lucide-react";
import { useApp } from "./state";
import { Avatar, Badge, Button, ConfirmDialog, ErrorBox, Field, Modal, PageHead } from "./ui";
import { blankPrefs, dateText, isOwner, member, type Trip, type Preference } from "./domain";

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

function SpendingLevelGraphic({ level }: { level: string }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (level === "Budget-conscious") {
    return (
      <svg width="30" height="30" viewBox="0 0 32 32" {...common} aria-hidden="true">
        <circle cx="16" cy="16" r="11.5" />
        <circle cx="16" cy="16" r="8.5" opacity=".55" />
        <path d="M18.8 11.7c-.6-.6-1.4-.9-2.5-.9-1.7 0-2.8.9-2.8 2.1 0 3.4 5.5 1.5 5.5 4.4 0 1.3-1.1 2.2-2.9 2.2-1.2 0-2.2-.4-3-1.2M16 9.3v13.4" />
      </svg>
    );
  }
  if (level === "Moderate") {
    return (
      <svg width="38" height="30" viewBox="0 0 44 32" {...common} aria-hidden="true">
        <rect x="3.5" y="7" width="37" height="18" rx="2.5" />
        <path d="M6.5 10h4v3h-4zm27 9h4v3h-4zM13 10h18M13 22h15" opacity=".6" />
        <ellipse cx="22" cy="16" rx="5.5" ry="6.5" />
        <circle cx="22" cy="14.2" r="1.6" />
        <path d="M19.4 19.4c.5-1.6 1.4-2.4 2.6-2.4s2.1.8 2.6 2.4" />
      </svg>
    );
  }
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" {...common} aria-hidden="true">
      <path d="M13.5 5.5h9l-1.6 4.8c3.9 2.1 7.3 5.8 7.3 10.4 0 5.5-4.5 9.4-10.2 9.4S7.8 26.2 7.8 20.7c0-4.6 3.4-8.3 7.3-10.4l-1.6-4.8Z" />
      <path d="M13.5 5.5c.9 2.7 2.4 4.1 4.5 4.1s3.6-1.4 4.5-4.1M18 13.9v12.6m3.1-9.4c-.7-.7-1.6-1-2.9-1-1.8 0-3 .9-3 2.2 0 3.4 5.8 1.6 5.8 4.6 0 1.4-1.2 2.3-3.1 2.3-1.3 0-2.3-.5-3.2-1.3" />
    </svg>
  );
}

/** Keep group counts literal so larger groups never require counting dots. */
function PreferenceVoterCount({ count }: { count: number }) {
  return <span className="preference-voter-count" aria-hidden="true">{count}</span>;
}

/** Long name lists belong in the existing dialog, not a floating preview. */
function travelerPreview(names: string[]): string {
  return names.length === 1 ? names[0] : `${names.length} travelers`;
}

const mobilityRadiusPalette = ["#6cab8a", "#55abc0", "#d57272", "#b08bc1"];

type MobilityRadius = { distance: number; count: number; color: string; names: string[] };

const interestAccents: Record<string, string> = {
  "Modern architecture": "#79aabd",
  History: "#d0a25f",
  Culture: "#8faac4",
  Art: "#d184a0",
  Nature: "#91a96f",
  Shopping: "#b39acb",
  "Food experiences": "#d79254",
  "Rest & downtime": "#879ac4",
};

function InterestTileGrid({ items }: { items: [string, string[]][] }) {
  const { open } = useApp();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  return (
    <div
      className="interest-tile-grid"
      role="group"
      aria-label="Group interests and places"
      onMouseLeave={() => setActiveIndex(null)}
    >
      {items.map(([label, names], index) => {
        const Icon = interestOptionIcons[label] || MapPin;
        const tooltipId = `interest-tile-tooltip-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        return (
          <div
            className={`interest-tile-wrap${activeIndex === index ? " is-active" : ""}`}
            key={label}
            style={{
              "--interest-accent": interestAccents[label] || "#90a8bd",
            } as React.CSSProperties}
            onMouseEnter={() => setActiveIndex(index)}
          >
            <button
              type="button"
              className="interest-tile-button"
              aria-label={`${label}, ${names.length} ${names.length === 1 ? "vote" : "votes"}. Voted by ${names.join(", ")}`}
              aria-describedby={tooltipId}
              onClick={() => {
                if (window.matchMedia("(hover: none), (pointer: coarse)").matches) {
                  open("message", { title: label, body: names.join("\n") });
                }
              }}
              onFocus={() => setActiveIndex(index)}
              onBlur={() => setActiveIndex(null)}
            >
              <span className="interest-tile-cover" aria-hidden="true">
                <span className="interest-tile-icon"><Icon size={18} strokeWidth={1.7} /></span>
                <PreferenceVoterCount count={names.length} />
                <span className="interest-tile-title">{label}</span>
              </span>
            </button>
            <span className="interest-tile-tooltip" id={tooltipId} role="tooltip">
              <strong>{label} · {names.length} {names.length === 1 ? "vote" : "votes"}</strong>
              <span>Voted by {names.join(", ")}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function Group() {
  const { trip: t, s, go, open, updateTrip, toast } = useApp();
  const travelersHeading = useRef<HTMLHeadingElement>(null);
  const preferenceGrid = useRef<HTMLDivElement>(null);
  const [travelerQuery, setTravelerQuery] = useState("");
  const [removal, setRemoval] = useState<{ tripId: string; memberId: string } | null>(null);
  const [sharedNote, setSharedNote] = useState<{ note: string; names: string[] } | null>(null);
  useLayoutEffect(() => {
    const grid = preferenceGrid.current;
    if (!grid) return;
    const measure = () => {
      grid.style.removeProperty("--group-preference-tile-height");
      const cards = Array.from(grid.querySelectorAll<HTMLElement>(".preference-tile"));
      const height = Math.max(320, ...cards.map((card) => card.getBoundingClientRect().height));
      grid.style.setProperty("--group-preference-tile-height", `${Math.ceil(height)}px`);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  });
  useEffect(() => {
    let active: HTMLElement | null = null;
    let trigger: Element | null = null;
    const dismiss = () => {
      active?.classList.remove("chart-tooltip-active");
      active = null;
      trigger = null;
    };
    const position = (event: Event) => {
      const target = event.target instanceof Element ? event.target.closest("button") : null;
      const movingBetweenInterestTiles = target?.matches(".interest-tile-button") && trigger?.matches(".interest-tile-button");
      if (event.type === "pointerover" && trigger?.contains(document.activeElement) && !movingBetweenInterestTiles) return;
      const tooltip = target?.querySelector<HTMLElement>('[role="tooltip"]') || target?.parentElement?.querySelector<HTMLElement>('.interest-tile-tooltip');
      if (!tooltip || !target || document.querySelector('[role="dialog"]')) { dismiss(); return; }
      dismiss();
      active = tooltip;
      trigger = target;
      tooltip.classList.add("chart-tooltip-floating", "chart-tooltip-active");
      const rect = target.getBoundingClientRect();
      const contentLeft = document.querySelector("main")?.getBoundingClientRect().left || 0;
      tooltip.style.maxWidth = `${Math.max(120, Math.min(280, innerWidth - contentLeft - 16))}px`;
      // Start inside the viewport before measuring; hidden tooltips never affect page width.
      tooltip.style.left = `${contentLeft + 8}px`;
      tooltip.style.top = "8px";
      const { width, height } = tooltip.getBoundingClientRect();
      tooltip.style.left = `${Math.max(contentLeft + 8, Math.min(innerWidth - width - 8, rect.left + rect.width / 2 - width / 2))}px`;
      tooltip.style.top = `${rect.top > height + 12 ? rect.top - height - 8 : Math.max(8, Math.min(innerHeight - height - 8, rect.bottom + 8))}px`;
    };
    const keyboard = (event: KeyboardEvent) => { if (event.key === "Escape") dismiss(); };
    const leave = (event: Event) => {
      // Pointer events from a different chart must not dismiss the keyboard tooltip.
      if (!(event.target instanceof Node) || !trigger?.contains(event.target)) return;
      if (event.type === "pointerout" && trigger.contains(document.activeElement)) return;
      const next = (event as FocusEvent | PointerEvent).relatedTarget;
      if (!(next instanceof Node) || !trigger.contains(next)) dismiss();
    };
    document.addEventListener("pointerover", position);
    document.addEventListener("focusin", position);
    document.addEventListener("keydown", keyboard);
    document.addEventListener("pointerout", leave);
    document.addEventListener("focusout", leave);
    document.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      dismiss();
      document.removeEventListener("pointerover", position);
      document.removeEventListener("focusin", position);
      document.removeEventListener("keydown", keyboard);
      document.removeEventListener("pointerout", leave);
      document.removeEventListener("focusout", leave);
      document.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, []);
  if (!t) return null;
  const owner = isOwner(t, s.userId);
  const removalTarget = removal?.tripId === t.id && owner
    ? t.members.find(person => person.id === removal.memberId && person.role !== "Owner" && person.status !== "removed") : undefined;
  const finishRemoval = () => {
    setRemoval(null);
    requestAnimationFrame(() => {
      travelersHeading.current?.focus({ preventScroll: true });
      travelersHeading.current?.scrollIntoView({ block: "start" });
    });
  };
  const activeTravelers = t.members.filter((m) => m.status !== "removed");
  const query = travelerQuery.trim().toLocaleLowerCase();
  const visibleTravelers = activeTravelers.filter((m) =>
    !query || `${m.name} ${m.email || ""}`.toLocaleLowerCase().includes(query),
  );
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
          <div className="group-page-actions">
            <Button variant="outline" onClick={() => {
              travelersHeading.current?.focus({ preventScroll: true });
              travelersHeading.current?.scrollIntoView({ block: "start" });
            }}><Users size={16} /> Travelers</Button>
            <Button variant="outline" onClick={() => go(15)}>
              My preferences <ArrowRight size={16} />
            </Button>
          </div>
        }
      />
      <div className="section-title">
        <div>
          <h2>Preferences</h2>
          <p>
            {responses.length} of{" "}
            {t.members.filter((m) => m.status === "accepted").length} travelers
            have shared preferences.
          </p>
        </div>
        <Badge tone="green">Visible to the group</Badge>
      </div>
      {responses.length > 0 && <label className="preference-jump">Jump to
        <select aria-label="Jump to a preference" value="" onChange={(event) => {
          const section = document.getElementById(`group-preference-${event.target.value}`);
          section?.scrollIntoView({block:"start"}); section?.focus({preventScroll:true});
        }}><option value="" disabled>Choose a category</option>{tiles.map(({title}, index) => <option key={title} value={index}>{title}</option>)}</select>
      </label>}
      {responses.length > 0 && <p className="group-chart-legend">Traveler counts · Select an item for names.</p>}
      <div className="preference-grid" ref={preferenceGrid}>
        {tiles.map(({ title, Icon, keys }, tileIndex) => {
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
          const ticketGroups: Record<string, string[]> = {};
          const noteGroups: Record<string, string[]> = {};
          responses.forEach((member) => {
            const preference = t.prefs[member.id];
            const ticketPreference = preference.tickets.trim();
            const note = preference.notes.trim();
            if (ticketPreference) {
              ticketGroups[ticketPreference] = [...(ticketGroups[ticketPreference] || []), member.name];
            }
            if (note) {
              noteGroups[note] = [...(noteGroups[note] || []), member.name];
            }
          });
          const ticketOptions = Object.entries(ticketGroups).sort(([a], [b]) => a.localeCompare(b));
          const noteOptions = Object.entries(noteGroups).sort(([a], [b]) => a.localeCompare(b));
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
          const radiusGroups = walkingDistances.map(([distance, members], index) => ({
            distance,
            count: members.length,
            color: mobilityRadiusPalette[index % mobilityRadiusPalette.length],
            names: members.map((member) => member.name),
            members,
          }));
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
            <article id={`group-preference-${tileIndex}`} tabIndex={-1} className={`card preference-tile${responses.length === 0 ? " preference-tile-empty" : ""}`} key={title}>
              <div className="tile-icon">
                <Icon size={22} strokeWidth={1.5} />
              </div>
              <h3>{title}</h3>
              <p className="preference-response-count">
                {title === "Dietary requirements"
                  ? `${sharedTravelers + noRestrictionNames.length} of ${t.members.filter((m) => m.status === "accepted").length} travelers responded`
                  : `${sharedTravelers} of ${t.members.filter((m) => m.status === "accepted").length} travelers shared`}
              </p>
              {responses.length === 0 ? (
                <p className="muted preference-empty">Nothing shared yet.</p>
              ) : title === "Dining preferences" ? (
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
                                aria-haspopup="dialog"
                                onClick={() => open("message", {title: value, body: names.join("\n")})}
                              >
                                <span className="dining-preference-value">{value}</span>
                                <PreferenceVoterCount count={names.length} />
                                <span className="dining-preference-tooltip" id={id} role="tooltip">
                                  <strong>{value}</strong>
                                  <span>{travelerPreview(names)}</span>
                                  <small className="chart-tooltip-hint">Select to view full names</small>
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
                  <div className="spending-preference-chart" aria-label="Group spending preferences">
                    <div className="spending-categories">
                      {spendingDistribution.map(({ value, members }) => (
                        <div className="spending-category" key={value} role="group" aria-label={value}>
                          <span className="spending-scale-icon" aria-hidden="true">
                            <SpendingLevelGraphic level={value} />
                            <span>{value}</span>
                          </span>
                          <div className="spending-marker-group">
                            {members.length === 0 && <span className="spending-empty" aria-label={`No travelers selected ${value}`}>None yet</span>}
                            {members.length > 4 ? <button type="button" className="spending-count" aria-label={`${members.length} travelers: ${value}`} aria-haspopup="dialog" onClick={() => open("message", {title: value, body: members.map(({member}) => member.name).join("\n")})}>{members.length}</button> : members.map(({ member }) => {
                              const id = `spending-tooltip-${member.id.replace(/[^a-z0-9]+/gi, "-")}`;
                              return (
                                <button
                                  type="button"
                                  className={`spending-marker spending-marker-${t.members.indexOf(member) % 4}`}
                                  key={member.id}
                                  aria-label={`${member.name}: ${value}`}
                                  aria-describedby={id}
                                  aria-haspopup="dialog"
                                  onClick={() => open("message", {title: value, body: member.name})}
                                >
                                  <span className="spending-marker-tooltip" id={id} role="tooltip">
                                    <strong>{value}</strong>
                                    <span>{member.name}</span>
                                    <small className="chart-tooltip-hint">Select to view full names</small>
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="spending-chart-legend">Each dot is one traveler. Select a dot or count to see names.</p>
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
                        <div className="mobility-radius-options" role="group" aria-label="Walking radius and traveler counts">
                          {radiusGroups.map(({ distance, count, color, members }) => {
                            const id = `mobility-radius-tooltip-${Math.round(distance)}`;
                            return (
                              <button
                                type="button"
                                className="mobility-radius-option"
                                key={distance}
                                style={{
                                  "--mobility-radius-color": color,
                                  "--mobility-radius-size": `${Math.round(12 + (Math.min(distance, 2000) / 2000) * 10)}px`,
                                } as React.CSSProperties}
                                aria-label={`Up to ${distance.toLocaleString()} meters: ${count} ${count === 1 ? "traveler" : "travelers"}, ${members.map((member) => member.name).join(", ")}`}
                                aria-describedby={id}
                                aria-haspopup="dialog"
                                onClick={() => open("message", {title: `Up to ${distance.toLocaleString()} meters`, body: members.map(member => member.name).join("\n")})}
                              >
                                <span className="mobility-radius-swatch" aria-hidden="true" />
                                <span className="mobility-radius-label">Up to {distance.toLocaleString()} m</span>
                                <span className="mobility-radius-people">
                                  <span className="mobility-radius-count">{count} {count === 1 ? "traveler" : "travelers"}</span>
                                  </span>
                                <span className="mobility-preference-tooltip" id={id} role="tooltip">
                                  <strong>Up to {distance.toLocaleString()} m</strong>
                                  <span>{travelerPreview(members.map((member) => member.name))}</span>
                                  <small className="chart-tooltip-hint">Select to view full names</small>
                                </span>
                              </button>
                            );
                          })}
                        </div>
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
                                aria-haspopup="dialog"
                                onClick={() => open("message", {title: label, body: members.map(member => member.name).join("\n")})}
                              >
                                <span className="mobility-access-icon" aria-hidden="true">
                                  {AccessIcon ? <AccessIcon size={15} strokeWidth={1.7} /> : <RampGraphic />}
                                </span>
                                <span className="mobility-access-label">{label}</span>
                                <PreferenceVoterCount count={members.length} />
                                <span className="mobility-preference-tooltip" id={id} role="tooltip">
                                  <strong>{label}</strong>
                                  <span>{travelerPreview(members.map((member) => member.name))}</span>
                                  <small className="chart-tooltip-hint">Select to view full names</small>
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
              ) : title === "Tickets and notes" ? (
                <div className="dining-preference-sections tickets-notes-sections">
                  <section className="dining-preference-section tickets-notes-section">
                    <h4 className="dining-preference-heading">
                      <span className="dining-preference-heading-icon tickets-notes-heading-icon" aria-hidden="true">
                        <Ticket size={18} strokeWidth={1.7} />
                      </span>
                      <span>Tickets and reservations</span>
                    </h4>
                    {ticketOptions.length ? (
                      <div className="dining-preference-options">
                        {ticketOptions.map(([value, names], index) => {
                          const id = `ticket-option-tooltip-${index}`;
                          return (
                            <button
                              type="button"
                              className="dining-preference-option"
                              key={value}
                              aria-label={`${value}: ${names.join(", ")}`}
                              aria-describedby={id}
                              aria-haspopup="dialog"
                              onClick={() => open("message", {title: value, body: names.join("\n")})}
                            >
                              <span className="dining-preference-value">{value}</span>
                              <PreferenceVoterCount count={names.length} />
                              <span className="dining-preference-tooltip" id={id} role="tooltip">
                                <strong>{value}</strong>
                                <span>{travelerPreview(names)}</span>
                                  <small className="chart-tooltip-hint">Select to view full names</small>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="muted preference-empty">Nothing shared yet.</p>
                    )}
                  </section>
                  <section className="dining-preference-section tickets-notes-section">
                    <h4 className="dining-preference-heading">
                      <span className="dining-preference-heading-icon tickets-notes-heading-icon" aria-hidden="true">
                        <NotebookPen size={18} strokeWidth={1.7} />
                      </span>
                      <span>Additional notes</span>
                    </h4>
                    {noteOptions.length ? (
                      <div className="dining-preference-options">
                        {noteOptions.map(([note, names], index) => {
                          const preview = note.replace(/\s+/g, " ");
                          return (
                            <button
                              type="button"
                              className="dining-preference-option tickets-notes-note-option"
                              key={note}
                              aria-label={names.length === 1 ? `Read note from ${names[0]}` : `Read note ${index + 1} from ${names.length} travelers`}
                              aria-haspopup="dialog"
                              onClick={(event) => {
                                // Safari pointer clicks do not reliably focus buttons.
                                // Capture this opener before the dialog traps focus.
                                event.currentTarget.focus({ preventScroll: true });
                                setSharedNote({ note, names });
                              }}
                            >
                              <span className="dining-preference-value tickets-notes-note-value">{preview}</span>
                              <PreferenceVoterCount count={names.length} />
                              <ChevronRight size={16} aria-hidden="true" />
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="muted preference-empty">Nothing shared yet.</p>
                    )}
                  </section>
                </div>
              ) : title === "Interests and destinations" ? (
                answers.length ? (
                  <InterestTileGrid items={answers} />
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
                            aria-haspopup="dialog"
                            onClick={() => open("message", {title: value, body: names.join("\n")})}
                          >
                            <span className="dietary-bubble" aria-hidden="true">
                              <Icon size={Math.round(size * 0.36)} strokeWidth={1.7} />
                              <span className="dietary-bubble-count">{names.length}</span>
                            </span>
                            <span className="dietary-bubble-label">{value}</span>
                            <span className="dietary-bubble-tooltip" id={id} role="tooltip">
                              <strong>{value}</strong>
                              <span>{travelerPreview(names)}</span>
                                  <small className="chart-tooltip-hint">Select to view full names</small>
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
          <h2 ref={travelersHeading} id="group-travelers" tabIndex={-1}>Travelers</h2>
        </div>
        {owner && (
          <Button onClick={() => open("inviteMember")}>
            <Plus size={16} />
            Invite someone
          </Button>
        )}
      </div>
      {(activeTravelers.length >= 8 || travelerQuery) && (
        <div className="traveler-filter">
          <Field label="Find a traveler">
            <input type="search" value={travelerQuery} placeholder="Name or email" aria-describedby="traveler-filter-count"
              onChange={(event) => setTravelerQuery(event.target.value)} />
          </Field>
          {travelerQuery && <Button variant="text" onClick={() => setTravelerQuery("")}>Clear filter</Button>}
          <p id="traveler-filter-count" role="status">{query ? `${visibleTravelers.length} of ${activeTravelers.length} travelers` : `${activeTravelers.length} travelers`}</p>
        </div>
      )}
      <div className="card collaborators-table">
        <div className="collaborator-table-head">
          <span>TRAVELER</span>
          <span>ROLE & ACCESS</span>
          <span>STATUS</span>
          <span />
        </div>
        {visibleTravelers.length === 0 && <p className="traveler-filter-empty">No travelers match “{travelerQuery.trim()}”. Try another name or email.</p>}
        {visibleTravelers.map((m) => (
            <div className="collaborator-row" key={m.id}>
              <div className="person">
                <Avatar name={m.name} index={activeTravelers.indexOf(m)} id={m.accountId || m.id} />
                <div>
                  <strong>
                    {m.name}
                    {(m.id === s.userId || m.accountId === s.userId) ? " (you)" : ""}
                  </strong>
                  <small>{m.email}</small>
                </div>
              </div>
              <div>
                <Badge tone={m.role === "Owner" ? "green" : ""}>{m.role}</Badge>
                {m.role === "Day Editor" && (
                  <small className="assigned-days">
                    {m.days.length
                      ? [...m.days].sort().map((d) => dateText(d, true)).join(", ")
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
                {owner && m.role !== "Owner" && (
                  <>
                    {!m.signupPending && <button
                      className="icon-btn member-permissions-button"
                      aria-label={`Change permissions for ${m.name}`}
                      title="Change permissions"
                      onClick={() => open("permissions", { memberId: m.id })}
                    >
                      <Settings2 size={17} /> <span>Permissions</span>
                    </button>}
                    <button
                      className="icon-btn"
                      aria-label={`Remove ${m.name}`}
                      onClick={event => {
                        // Safari pointer clicks do not focus buttons automatically.
                        event.currentTarget.focus({ preventScroll: true });
                        setRemoval({ tripId: t.id, memberId: m.id });
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
                {m.status === "pending" && !m.signupPending && owner && (
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
      {removal && removalTarget && <ConfirmDialog title="Remove this traveler?"
        cancelLabel="Keep traveler" confirmLabel="Remove traveler"
        onCancel={() => setRemoval(null)} onConfirm={() => {
          // Revalidate against the current render because shared trip updates can arrive while open.
          if (removalTarget) {
            updateTrip(current => {
              if (current.id === removal.tripId && isOwner(current, s.userId))
                current.members = current.members.filter(person => person.id !== removal.memberId || person.role === "Owner");
            });
            toast("Collaborator removed. Historical expenses are preserved.");
          }
          finishRemoval();
        }}>
        Remove <strong>{removalTarget.name}</strong> from this trip? Their historical records will remain.
      </ConfirmDialog>}
      {removal && !removalTarget && <Modal title="Traveler changed" onClose={finishRemoval} footer={<Button variant="outline full" onClick={finishRemoval}>Close</Button>}>
        <p>This traveler is no longer available to remove. Review the updated traveler list.</p>
      </Modal>}
      {sharedNote && (
        <Modal title={sharedNote.names.length === 1 ? `Note from ${sharedNote.names[0]}` : `Note from ${sharedNote.names.length} travelers`}
          onClose={() => setSharedNote(null)} footer={<Button variant="full" onClick={() => setSharedNote(null)}>Got it</Button>}>
          <p className="group-shared-note">{sharedNote.note}</p>
          {sharedNote.names.length > 1 && (
            <details className="group-note-authors" open={sharedNote.names.length <= 4 ? true : undefined}>
              <summary>Shared by {sharedNote.names.length} travelers · View names</summary>
              <ul>{sharedNote.names.map((name, index) => <li key={`${name}-${index}`}>{name}</li>)}</ul>
            </details>
          )}
        </Modal>
      )}
      {!owner && (
        <p className="fine-print">
          Only the Owner can invite, remove, or change permissions.
        </p>
      )}
    </>
  );
}
const interestOptionIcons: Record<string, LucideIcon> = {
  "Modern architecture": Building2,
  History: Landmark,
  Culture: BookOpen,
  Art: Palette,
  Nature: TreePine,
  Shopping: ShoppingBag,
  "Food experiences": CookingPot,
  "Rest & downtime": Armchair,
};

function Choices({
  label,
  values,
  selected,
  onChange,
  icons,
}: {
  label: string;
  values: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  icons?: Record<string, LucideIcon>;
}) {
  return (
    <fieldset className="choice-field">
      <legend>{label}</legend>
      <div className="choice-chips">
        {values.map((v) => {
          const Icon = icons?.[v];
          return (
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
            {Icon && <Icon className="choice-chip-icon" size={15} strokeWidth={1.7} aria-hidden="true" />}
            <span>{v}</span>
          </label>
          );
        })}
      </div>
    </fieldset>
  );
}
/** Recover only the complete known answer shape; browser storage is untrusted input. */
function isSurveyAnswers(value: unknown): value is Preference {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const fields = blankPrefs();
  const answers = value as Record<string, unknown>;
  return Object.keys(answers).length === Object.keys(fields).length &&
    Object.entries(fields).every(([key, defaultValue]) => {
      const answer = answers[key];
      return Array.isArray(defaultValue)
        ? Array.isArray(answer) && answer.length <= 100 && answer.every(item => typeof item === "string" && item.length <= 1000)
        : typeof defaultValue === "number"
          ? typeof answer === "number" && Number.isFinite(answer)
          : typeof answer === "string" && answer.length <= 100000;
    });
}

export function Survey({ trip: t, leaveOnboarding }: { trip: Trip; leaveOnboarding?: () => void }) {
  const { s, go, route, savePreferences, toast, open, dismissMessage } = useApp();
  useEffect(() => dismissMessage(), []);
  const returnPage = route.params.get("return") === "9" ? 9 : route.params.get("return") === "10" ? 10 : 13;
  const traveler = member(t, s.userId)!;
  const [saving, setSaving] = useState(false);
  // sessionStorage is tab-local; the key also separates accounts, trips and travelers.
  const draftKey = `trip-survey-draft-v1:${s.userId}:${t.id}:${traveler.id}`;
  const panel = useRef<HTMLDivElement>(null);
  const surveyLayout = useRef<HTMLFieldSetElement>(null);
  const inviteForm = useRef<HTMLFormElement>(null);
  const [failedSaveAttempt, setFailedSaveAttempt] = useState(0);
  useEffect(() => {
    if (!failedSaveAttempt || !inviteForm.current ||
        !window.matchMedia("(max-width: 700px) and (max-height: 650px)").matches) return;
    const frame = requestAnimationFrame(() => {
      const alert = inviteForm.current?.querySelector<HTMLElement>('.error[role="alert"]');
      // Reveal the error, recovery advice and retry together after an async
      // rejection; ordinary validation and draft edits must not trigger a jump.
      alert?.focus({ preventScroll: true });
      alert?.scrollIntoView({ block: "start", behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [failedSaveAttempt]);
  const [recovery] = useState(() => {
    const initial = structuredClone(t.prefs[traveler.id] || blankPrefs());
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (!raw) return { answers: initial, step: 0, restored: false, warning: "", invalid: false };
      const stored = JSON.parse(raw);
      const legacy = isSurveyAnswers(stored);
      const answers = legacy ? stored : stored?.answers;
      const validEnvelope = stored?.version === 2 && stored.accountId === s.userId && stored.tripId === t.id &&
        stored.travelerId === traveler.id && Number.isInteger(stored.step) && stored.step >= 0 && stored.step <= 2;
      if (!isSurveyAnswers(answers) || (!legacy && !validEnvelope)) throw new Error("invalid");
      const restored = JSON.stringify(answers) !== JSON.stringify(initial);
      return { answers: restored ? answers : initial, step: restored && !legacy ? stored.step as number : 0,
        restored, expanded: restored && !legacy && (stored.expanded === null ||
          (Number.isInteger(stored.expanded) && stored.expanded >= 0 && stored.expanded <= 3))
          ? stored.expanded as number | null : null, warning: "", invalid: false };
    } catch (issue) {
      const invalid = issue instanceof SyntaxError || (issue instanceof Error && issue.message === "invalid");
      return { answers: initial, step: 0, restored: false, invalid,
        warning: invalid ? "This browser draft could not be restored. Download or discard it before making a new recovery copy."
          : "Browser draft recovery is unavailable. Keep this page open until you save, or download your answers." };
    }
  });
  const [expanded, setExpanded] = useState<number | null>(recovery.expanded ?? null);
  const [p, setP] = useState<Preference>(recovery.answers);
  const [error, setError] = useState("");
  const [step, setStep] = useState(recovery.step);
  const [hasDraft, setHasDraft] = useState(recovery.restored);
  const [restoredDraft, setRestoredDraft] = useState(recovery.restored);
  const [storageWarning, setStorageWarning] = useState(recovery.warning);
  const [invalidDraft, setInvalidDraft] = useState(recovery.invalid);
  useEffect(() => {
    // Resume only a recovered ordinary survey. Keep its section navigation and
    // sharing notice in view; fresh visits and invitation onboarding start normally.
    if (!recovery.restored || leaveOnboarding || window.innerWidth > 700) return;
    const frame = requestAnimationFrame(() => surveyLayout.current?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [recovery.restored, leaveOnboarding]);
  const persistDraft = (answers: Preference, currentStep: number, currentExpanded = expanded) => {
    setHasDraft(true);
    if (invalidDraft) return;
    try {
      sessionStorage.setItem(draftKey, JSON.stringify({ version: 2, accountId: s.userId, tripId: t.id,
        travelerId: traveler.id, answers, step: currentStep, expanded: currentExpanded }));
      setStorageWarning("");
    } catch {
      setStorageWarning("Your latest answers could not be backed up in this browser. Keep this page open until you save, or download your answers.");
    }
  };
  const set = <K extends keyof Preference>(key: K, value: Preference[K]) => {
    const next = { ...p, [key]: value };
    setP(next);
    setError("");
    persistDraft(next, step);
  };
  const discardDraft = () => {
    try { sessionStorage.removeItem(draftKey); }
    catch {
      setStorageWarning("The browser draft could not be removed. Your answers are still here; try again before leaving this page.");
      return;
    }
    setP(structuredClone(t.prefs[traveler.id] || blankPrefs()));
    setHasDraft(false);
    setRestoredDraft(false);
    setInvalidDraft(false);
    setStorageWarning("");
    setError("");
  };
  const downloadDraft = () => {
    let data = JSON.stringify(p, null, 2);
    if (invalidDraft) {
      try { data = sessionStorage.getItem(draftKey) || data; } catch { /* Current answers remain downloadable. */ }
    }
    const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = "trip-preferences-draft.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const resumeDraft = () => {
    const section = expanded ?? 0;
    if (leaveOnboarding && expanded === null) {
      setExpanded(section);
      persistDraft(p, step, section);
    }
    requestAnimationFrame(() => {
      const target = leaveOnboarding
        ? document.getElementById(`invite-panel-${section}`)
        : panel.current?.querySelector<HTMLElement>('.step-heading');
      if (!target) return;
      target.tabIndex = -1;
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'start' });
    });
  };
  const draftNotice = (restoredDraft || storageWarning) && (
    <div className="survey-draft-notice">
      <p role={storageWarning ? "alert" : "status"}>{storageWarning || (restoredDraft
        ? "Unsaved preferences restored from this tab. Save them to share with your group."
        : "Unsaved preferences kept in this tab until you save or discard them.")}</p>
      <div>
        {restoredDraft && !storageWarning && <Button variant="outline" onClick={resumeDraft} disabled={saving}>Resume editing</Button>}
        {storageWarning && <Button variant="text" onClick={downloadDraft} disabled={saving}>Download draft</Button>}
        <Button variant="text" onClick={discardDraft} disabled={saving}>Discard draft</Button>
      </div>
    </div>
  );
  const accessRecovery = /invitation.*(?:no longer active|expired)|access.*(?:revoked|removed)/i.test(error) && (
    <p className="note">Ask the trip owner to restore your access. {storageWarning ? "Keep this page open or download your draft to preserve your answers." : "Your answers are kept in this tab."}</p>
  );
  const draftStatus = hasDraft && !restoredDraft && !storageWarning && (
    <div className="survey-draft-status">
      <small>Draft kept in this tab.</small>
      <Button variant="text" onClick={discardDraft} disabled={saving}>Discard draft</Button>
    </div>
  );
  function advance(next: number) {
    if (next > step && step === 1 && (!Number.isInteger(p.walk) || p.walk < 0 || p.walk > 100000)) {
      setError("Enter a whole number between 0 and 100,000 meters.");
      return;
    }
    setError("");
    setStep(next);
    if (hasDraft) persistDraft(p, next);
    // Step changes should reveal the fields on shorter screens, not repeat the introduction.
    requestAnimationFrame(() => {
      if (window.innerWidth <= 700) panel.current?.scrollIntoView({ block: "start" });
    });
  }
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || (!leaveOnboarding && step !== 2)) return;
    const placesError = textError(p.destinations, "Places to include", TEXT_LIMITS.preferencePlaces);
    const problem = placesError || textError(p.notes, "Additional notes", TEXT_LIMITS.notes);
    if (problem) {
      if (leaveOnboarding) setExpanded(placesError ? 1 : 3);
      else setStep(placesError ? 1 : 2);
      setError(problem);
      return;
    }
    if (!Number.isInteger(p.walk) || p.walk < 0 || p.walk > 100000) {
      if (leaveOnboarding) setExpanded(2);
      else setStep(1);
      setError("Enter a whole number between 0 and 100,000 meters.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await savePreferences(t, p);
      try { sessionStorage.removeItem(draftKey); }
      catch {
        // If deletion is denied, replacing the old copy with confirmed answers prevents
        // stale answers from being restored on the next visit. Never navigate if both fail.
        try {
          sessionStorage.setItem(draftKey, JSON.stringify({ version: 2, accountId: s.userId, tripId: t.id,
            travelerId: traveler.id, answers: p, step }));
        } catch {
          setRestoredDraft(false);
          setStorageWarning("Your preferences were saved, but the older browser draft could not be cleared. Keep this page open and retry Discard draft before leaving.");
          return;
        }
      }
      toast("Trip preferences saved.", "preferences");
      go(leaveOnboarding ? 8 : returnPage);
      if (!leaveOnboarding && route.params.get("nearby") === "true") open("nearby");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not save preferences. Try again.");
      setFailedSaveAttempt(attempt => attempt + 1);
    } finally {
      setSaving(false);
    }
  };
  const diningFields = (
    <>
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
  );
  const interestFields = (
    <>
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
        icons={interestOptionIcons}
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
    </>
  );
  const mobilityFields = (
    <>
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
  );
  const bookingFields = (
    <>
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
    </>
  );
  if (leaveOnboarding) {
    const sections = [
      { title: "Food & dining", Icon: Utensils, fields: diningFields,
        summary: [...p.diet, p.food === "A little of both" ? "Local and familiar food" : p.food, p.spending + " spending", p.dining, p.atmosphere].join(" · ") },
      { title: "Places & interests", Icon: MapPin, fields: interestFields,
        summary: [...p.interests, p.destinations].filter(Boolean).join(" · ") || "Add activities or places you’d like to visit" },
      { title: "Walking & accessibility", Icon: Footprints, fields: mobilityFields,
        summary: [Number.isInteger(p.walk) && p.walk >= 0 && p.walk <= 100000
          ? `Walks up to ${p.walk.toLocaleString()} m` : "Walking distance needs review", ...p.access].join(" · ") },
      { title: "Tickets & notes", Icon: Ticket, fields: bookingFields,
        summary: [p.tickets, p.notes].filter(Boolean).join(" · ") },
    ];
    return (
      <div className="invite-review">
        <header>
          <p className="invite-trip-name"><Check size={16} aria-hidden="true" /> Joined {t.title}</p>
          <h1>Your trip preferences</h1>
          <p>Review the starting choices below. You can change them now or later from the group page.</p>
        </header>
        <form ref={inviteForm} onSubmit={save} noValidate>
          {draftNotice}
          <fieldset disabled={saving} aria-busy={saving} className="invite-review-fields">
            {sections.map(({title, Icon, fields, summary}, index) => (
              <section key={title} className="invite-review-section">
                <h2><button type="button" aria-expanded={expanded === index} aria-controls={`invite-panel-${index}`}
                  onClick={() => {
                    const next = expanded === index ? null : index;
                    setExpanded(next);
                    if (hasDraft) persistDraft(p, step, next);
                  }}>
                  <Icon className="invite-category-icon" size={20} aria-hidden="true" />
                  <span><strong>{title}</strong>{expanded !== index && <small>{summary}</small>}</span>
                  <ChevronDown className="invite-chevron" size={18} aria-hidden="true" />
                </button></h2>
                <div id={`invite-panel-${index}`} hidden={expanded !== index} className="invite-review-panel">
                  {fields}
                </div>
              </section>
            ))}
          </fieldset>
          <ErrorBox text={error} />
          {accessRecovery}
          <p className="invite-audience"><Users size={16} aria-hidden="true" /> Everyone on this trip can see your answers. Use fictional details in this prototype.</p>
          {draftStatus}
          <div className="invite-review-actions">
            <Button type="submit" disabled={saving}>{saving ? "Saving preferences…" : "Save and open trip"} <ArrowRight size={16} /></Button>
            <Button variant="text" onClick={leaveOnboarding} disabled={saving}>Back to my trips</Button>
          </div>
        </form>
      </div>
    );
  }
  return (
    <div className="ordinary-survey">
      <PageHead
        eyebrow="YOUR PART OF THE PLAN"
        title="Your trip preferences"
        description="Share what makes a good trip for you."
      />
      <form onSubmit={save}>
        <fieldset className="survey-layout survey-fields" ref={surveyLayout} disabled={saving} aria-busy={saving}>
        <aside className="survey-nav">
          <div className="card">
            <span className="eyebrow">A FEW LITTLE DETAILS</span>
            {["Food & dining", "Places & pace", "Practical details"].map(
              (label, i) => (
                <button
                  type="button"
                  className={step === i ? "active" : ""}
                  key={label}
                  onClick={() => advance(i)}
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
        <div className="card form-card" ref={panel}>
          {draftNotice}
          {step === 0 && (
            <>
              <div className="step-heading"><span>01</span><h2>Good food, your way.</h2></div>
              {diningFields}
            </>
          )}
          {step === 1 && (
            <>
              <div className="step-heading"><span>02</span><h2>Your kind of exploring.</h2></div>
              {interestFields}{mobilityFields}
            </>
          )}
          {step === 2 && (
            <>
              <div className="step-heading"><span>03</span><h2>The practical little things.</h2></div>
              {bookingFields}
              <div className="info-banner">
                <Users size={18} />
                <span>Your group can see your saved preferences. You can come back and change them.</span>
              </div>
            </>
          )}
          <ErrorBox text={error} />
          {accessRecovery}
          {draftStatus}
          <div className="form-actions survey-actions">
            <div className="survey-back-actions">
              {step > 0 && <Button variant="text" onClick={() => advance(step - 1)}>Back</Button>}
              <Button variant="text" onClick={() => go(returnPage)}>Cancel</Button>
            </div>
            {step < 2 ? (
              <Button onClick={() => advance(step + 1)}>
                Next <ArrowRight size={16} />
              </Button>
            ) : (
              <Button type="submit">
                {saving ? "Saving preferences…" : "Save my preferences"} <Check size={16} />
              </Button>
            )}
          </div>
        </div>
        </fieldset>
      </form>
    </div>
  );
}
