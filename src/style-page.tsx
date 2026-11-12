import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, Moon, RotateCcw, Sun } from "lucide-react";
import { PageHead, Button, Badge } from "./ui";
import { brandLogoUrl } from "./brand-logo";
import { THEMES, DEFAULT_STYLE, setStyle, useStyle, useSystemDark, resolvePalette } from "./theme";
import { retryStyleSync, useStyleSaveStatus } from "./style-sync";
import "./account-style-refinement.css";

/** Preview choices locally, then apply them across the site and the signed-in account. */

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
  const saveStatus = useStyleSaveStatus();
  const previousApplied = useRef(applied);
  const previewRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const lastChoiceRef = useRef<HTMLElement | null>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const saveActionRef = useRef<HTMLButtonElement>(null);
  const restoreSaveFocus = useRef(false);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const [previewVisible, setPreviewVisible] = useState(true);
  useEffect(() => {
    if (saveStatus !== "save-error" && saveStatus !== "load-error") return;
    const restoreActionFocus = saveStatus === "save-error" && restoreSaveFocus.current;
    restoreSaveFocus.current = false;
    let settledFrame = 0;
    const frame = requestAnimationFrame(() => {
      settledFrame = requestAnimationFrame(() => {
        const actions = actionsRef.current;
        const feedback = feedbackRef.current;
        if (!actions || !feedback) return;
        // Saving disables Apply and may drop focus onto BODY. Reconnect the
        // same action as Retry without taking focus from a newly edited choice.
        if (restoreActionFocus && document.activeElement === document.body)
          saveActionRef.current?.focus({ preventScroll: true });
        const fixedActions = getComputedStyle(actions).position === "fixed";
        const first = fixedActions || saveStatus === "load-error" ? feedback : actions;
        const last = saveStatus === "load-error" ? feedback.nextElementSibling : feedback;
        const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--release-notice-height")) || 0;
        const bottom = fixedActions ? actions.getBoundingClientRect().top : window.innerHeight;
        // A newly expanded error can trigger scroll anchoring above its Retry
        // action. Reveal the complete recovery group without stealing focus.
        if (first.getBoundingClientRect().top < top + 12 || (last?.getBoundingClientRect().bottom ?? 0) > bottom - 12)
          first.scrollIntoView({ block: "center" });
      });
    });
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(settledFrame); };
  }, [saveStatus]);
  useEffect(() => {
    const preview = previewRef.current;
    if (!preview) return;
    const observer = new IntersectionObserver(([entry]) => setPreviewVisible(entry.intersectionRatio >= 0.2), { threshold: 0.2 });
    observer.observe(preview);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const previous = previousApplied.current;
    previousApplied.current = applied;
    // Refresh untouched previews after account loading without discarding a new selection.
    setChoice((preview) => JSON.stringify(preview) === JSON.stringify(previous) ? applied : preview);
  }, [applied]);
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
        title="Style"
        description="Preview colors, fonts and corners, then apply them across the app."
      />
      <div className="style-layout">
        <div className="style-controls" ref={controlsRef} tabIndex={-1} aria-label="Style choices" onFocusCapture={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest(".style-group")) lastChoiceRef.current = target;
        }}>
          <Button variant={`text style-tablet-preview${previewVisible ? " preview-in-view" : ""}`} onClick={() => {
            previewRef.current?.scrollIntoView({ block: "center" });
            previewRef.current?.focus({ preventScroll: true });
          }}>View preview</Button>
          <section className="card style-group">
            <h2>Light or dark</h2>
            <div className="style-switch-row">
              <div>
                <strong>Match my device</strong>
                <span id="device-mode-description">{choice.matchDevice
                  ? `Your device is using ${pal.isDark ? "Dark" : "Light"}. Turn off to choose below.`
                  : "Choose below, or turn on to follow your device."}</span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={choice.matchDevice}
                aria-label="Match my device"
                aria-describedby="device-mode-description"
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
            <p>For headings and featured totals.</p>
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
          <div className="style-preview" ref={previewRef} tabIndex={-1} style={previewVars} aria-label="Style preview">
            <div className="sp-top">
              <img className="sp-logo" src={brandLogoUrl(choice.theme, pal.isDark)} alt="Stir Crazy" />
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

          <div className="style-actions" ref={actionsRef}>
            <Button variant="text style-tablet-edit" onClick={() => {
              controlsRef.current?.scrollIntoView({ block: "start" });
              controlsRef.current?.focus({ preventScroll: true });
            }}>Back to choices</Button>
            {saveStatus === "save-error" && <p className="style-save-inline" aria-hidden="true">Applied here. Account save failed—retry below.</p>}
            <Button variant="text style-preview-jump" onClick={() => {
              const target = previewVisible ? lastChoiceRef.current || controlsRef.current : previewRef.current;
              target?.scrollIntoView({ block: previewVisible ? "start" : "center" });
              target?.focus({ preventScroll: true });
            }}>{previewVisible ? "Back to choices" : "Preview"}</Button>
            <Button
              variant="text style-reset"
              disabled={!changed}
              onClick={() => setChoice(DEFAULTS)}
            >
              <RotateCcw size={14} /> Reset
            </Button>
            <Button ref={saveActionRef} disabled={!unapplied && saveStatus !== "save-error"} onClick={() => {
              restoreSaveFocus.current = document.activeElement === saveActionRef.current;
              if (unapplied) setStyle(choice);
              else retryStyleSync();
            }}>
              {unapplied ? "Apply to my site" : saveStatus === "save-error" ? "Retry save" : saveStatus === "saving" ? "Saving…" : "Applied"}
            </Button>
          </div>
          <p className="style-note" ref={feedbackRef} role={saveStatus === "save-error" || saveStatus === "load-error" ? "alert" : "status"}>
            {unapplied && saveStatus !== "save-error" && saveStatus !== "load-error" && saveStatus !== "loading"
              ? (saveStatus === "saving" ? "Your previous choice is saving. Apply this preview when you’re ready." : "Preview only. Apply to use these choices across the app.")
              : saveStatus === "device" ? "Your style applies to every page on this device."
              : saveStatus === "saving" ? "Your style is applied here. Saving to your account…"
              : saveStatus === "save-error" ? "Your style is applied here, but couldn’t be saved to your account. Try again."
              : saveStatus === "load-error" ? "We couldn’t load your saved style. Your current look is unchanged."
              : saveStatus === "loading" ? "Loading your saved style…"
              : saveStatus === "saved" ? "Style saved to your account."
              : "This is your current style. Change a choice to preview a new look."}
          </p>
          {saveStatus === "load-error" && <Button variant="text" onClick={retryStyleSync}>Try loading again</Button>}
        </aside>
      </div>
    </>
  );
}
