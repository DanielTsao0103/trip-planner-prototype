import { useState, type CSSProperties } from "react";
import { Check, Moon, RotateCcw, Sun } from "lucide-react";
import { PageHead, Button, Badge } from "./ui";
import { THEMES, DEFAULT_STYLE, setStyle, useStyle, useSystemDark, resolvePalette } from "./theme";

/** DESIGN PREVIEW ONLY: the controls below change the sample card, not the real site yet. */

const HEADINGS = [
  { id: "serif", name: "Fraunces", sample: "Aa", family: '"Fraunces", serif' },
  { id: "sans", name: "DM Sans", sample: "Aa", family: '"DM Sans", sans-serif' },
  { id: "playfair", name: "Playfair", sample: "Aa", family: '"Playfair Display", serif' },
  { id: "lora", name: "Lora", sample: "Aa", family: '"Lora", serif' },
  { id: "poppins", name: "Poppins", sample: "Aa", family: '"Poppins", sans-serif' },
  { id: "grotesk", name: "Grotesk", sample: "Aa", family: '"Space Grotesk", sans-serif' },
  { id: "caveat", name: "Handwritten", sample: "Aa", family: '"Caveat", cursive' },
];

const CORNERS = [
  { id: "square", name: "Square", radius: 3 },
  { id: "soft", name: "Soft", radius: 10 },
  { id: "round", name: "Round", radius: 20 },
];

const DEFAULTS = DEFAULT_STYLE;

export function StylePage() {
  const applied = useStyle();
  const systemDark = useSystemDark();
  const [choice, setChoice] = useState(applied);
  const pick = (key: "theme" | "mode" | "heading" | "corners", id: string) =>
    setChoice({ ...choice, [key]: id });

  const pal = resolvePalette(choice, systemDark);
  const heading = HEADINGS.find((h) => h.id === choice.heading)!;
  const corners = CORNERS.find((c) => c.id === choice.corners)!;
  const changed = JSON.stringify(choice) !== JSON.stringify(DEFAULTS);
  const unapplied = JSON.stringify(choice) !== JSON.stringify(applied);

  const previewVars = {
    "--sp-primary": pal.primary,
    "--sp-tint": pal.tint,
    "--sp-soft": pal.soft,
    "--sp-bg": pal.bg,
    "--sp-surface": pal.surface,
    "--sp-ink": pal.ink,
    "--sp-muted": pal.muted,
    "--sp-line": pal.line,
    "--sp-track": pal.track,
    "--sp-on-primary": pal.onPrimary,
    "--sp-radius": `${corners.radius}px`,
    "--sp-heading": heading.family,
  } as CSSProperties;

  return (
    <>
      <PageHead
        eyebrow="Style"
        title="Make it feel like yours."
        description="Try colors, type and shapes on the sample card. When you like it, press Apply to my site and every page follows."
        action={<Badge>Preview, then apply</Badge>}
      />
      <div className="style-layout">
        <div className="style-controls">
          <section className="card style-group">
            <h2>Light or dark</h2>
            <p>Dark mode switches every color below to its dark version. Your font and corners stay the same.</p>
            <div className="style-switch-row">
              <div>
                <strong>Match my device</strong>
                <span>Turn dark mode on automatically when your phone or laptop is in dark mode.</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={choice.matchDevice}
                aria-label="Match my device"
                className="style-switch"
                onClick={() => setChoice({ ...choice, matchDevice: !choice.matchDevice })}
              >
                <i />
              </button>
            </div>
            <div className="style-options" role="group" aria-label="Light or dark mode">
              {[
                { id: "light", name: "Light", icon: <Sun size={16} /> },
                { id: "dark", name: "Dark", icon: <Moon size={16} /> },
              ].map((m) => {
                const active = (pal.isDark ? "dark" : "light") === m.id;
                return (
                  <button
                    key={m.id}
                    className="style-option"
                    aria-pressed={active}
                    disabled={choice.matchDevice}
                    onClick={() => pick("mode", m.id)}
                  >
                    {m.icon}
                    <span>{m.name}</span>
                    {active && <Check size={14} />}
                  </button>
                );
              })}
            </div>
            {choice.matchDevice && (
              <p className="style-hint">Following your device right now. Turn off Match my device to choose Light or Dark yourself.</p>
            )}
          </section>

          <section className="card style-group">
            <h2>Color theme</h2>
            <p>Sets the main color, a matching background, and the chart colors.</p>
            <div className="style-options theme-options" role="group" aria-label="Color theme">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  className="style-option theme-option"
                  aria-pressed={choice.theme === t.id}
                  onClick={() => pick("theme", t.id)}
                >
                  <span className="theme-dots">
                    <i style={{ background: (pal.isDark ? t.dark : t).primary }} />
                    <i style={{ background: (pal.isDark ? t.dark : t).soft }} />
                    <i style={{ background: (pal.isDark ? t.dark : t).tint }} />
                  </span>
                  <span>{t.name}</span>
                  {choice.theme === t.id && <Check size={14} />}
                </button>
              ))}
            </div>
          </section>

          <section className="card style-group">
            <h2>Headings</h2>
            <p>The type used for page titles.</p>
            <div className="style-options" role="group" aria-label="Heading style">
              {HEADINGS.map((h) => (
                <button
                  key={h.id}
                  className="style-option"
                  aria-pressed={choice.heading === h.id}
                  onClick={() => pick("heading", h.id)}
                >
                  <span className="font-chip" style={{ fontFamily: h.family }}>{h.sample}</span>
                  <span>{h.name}</span>
                  {choice.heading === h.id && <Check size={14} />}
                </button>
              ))}
            </div>
          </section>

          <section className="card style-group">
            <h2>Corners</h2>
            <p>How round buttons and cards look.</p>
            <div className="style-options" role="group" aria-label="Corner style">
              {CORNERS.map((c) => (
                <button
                  key={c.id}
                  className="style-option"
                  aria-pressed={choice.corners === c.id}
                  onClick={() => pick("corners", c.id)}
                >
                  <span className="corner-chip" style={{ borderTopLeftRadius: c.radius }} />
                  <span>{c.name}</span>
                  {choice.corners === c.id && <Check size={14} />}
                </button>
              ))}
            </div>
          </section>
        </div>

        <aside className="style-side">
          <div className="style-preview" style={previewVars} aria-label="Style preview">
            <div className="sp-top">
              <span className="sp-logo">trip planner</span>
              <span className="sp-chip">Oct 15 to Oct 18</span>
            </div>
            <div className="sp-body">
              <div className="sp-eyebrow">YOUR TRIP</div>
              <h3>Seattle &amp; Bainbridge getaway</h3>
              <p>4 travelers, 6 plans, one shared budget.</p>
              <div className="sp-actions">
                <span className="sp-button">Add event</span>
                <span className="sp-button ghost">Meet your group</span>
              </div>
              <div className="sp-card">
                <div className="sp-row">
                  <span>Spent so far</span>
                  <strong>$1,940.00</strong>
                </div>
                <div className="sp-bar"><i /></div>
                <div className="sp-row small">
                  <span>of $3,000.00</span>
                  <span>65%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="style-actions">
            <Button
              variant="text"
              disabled={!changed}
              onClick={() => setChoice(DEFAULTS)}
            >
              <RotateCcw size={14} /> Reset
            </Button>
            <Button disabled={!unapplied} onClick={() => setStyle(choice)}>
              {unapplied ? "Apply to my site" : "Applied"}
            </Button>
          </div>
          <p className="style-note">
            Your style is saved on this device and used on every page, including light or dark mode.
          </p>
        </aside>
      </div>
    </>
  );
}
