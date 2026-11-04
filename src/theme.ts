import { useSyncExternalStore } from "react";

/** Style choices shared between the Style page and the parts of the app that react to them (so far: the budget pie chart). */

export const THEMES = [
  { id: "pink", name: "Pink", primary: "#b03a6b", tint: "#fbe3ec", soft: "#ee9ab8", bg: "#fff7fa", chart: ["#b03a6b", "#d5668f", "#ee9ab8", "#9a4f8f", "#d8bcc8", "#f5e8ee"], dark: { primary: "#f08cb0", tint: "#3a2230", soft: "#b03a6b", bg: "#1c1217", surface: "#281a21", chart: ["#f08cb0", "#d5668f", "#b03a6b", "#c58ac0", "#5a4450", "#33232b"] } },
  { id: "blue", name: "Blue", primary: "#23426b", tint: "#dbe9f6", soft: "#8cc3e8", bg: "#f9fafb", chart: ["#23426b", "#4a8ac4", "#8cc3e8", "#2e9c9a", "#b4c2d3", "#e9eef3"], dark: { primary: "#8cc3e8", tint: "#1f3248", soft: "#4a8ac4", bg: "#0f1620", surface: "#172230", chart: ["#8cc3e8", "#4a8ac4", "#2d5a8c", "#4cc0bd", "#4a5a6c", "#243242"] } },
  { id: "purple", name: "Purple", primary: "#5a3a8f", tint: "#ebe3f7", soft: "#b59ae0", bg: "#fbf8ff", chart: ["#5a3a8f", "#8564bf", "#b59ae0", "#4a6fb0", "#c9c0d8", "#eee8f6"], dark: { primary: "#b59ae0", tint: "#2e2442", soft: "#8564bf", bg: "#15111d", surface: "#1e1829", chart: ["#b59ae0", "#8564bf", "#5a3a8f", "#7a9be0", "#4f4660", "#2a2238"] } },
  { id: "green", name: "Green", primary: "#2f6b4a", tint: "#e0efe5", soft: "#8cc3a0", bg: "#f7fbf8", chart: ["#2f6b4a", "#5a9a73", "#8cc3a0", "#2e8c9c", "#bccfc3", "#e8f1ec"], dark: { primary: "#8cc3a0", tint: "#1f3329", soft: "#5a9a73", bg: "#0f1813", surface: "#172420", chart: ["#8cc3a0", "#5a9a73", "#2f6b4a", "#4cbccc", "#46574d", "#233229"] } },
  { id: "orange", name: "Orange", primary: "#c4581a", tint: "#fde8d6", soft: "#f2a56b", bg: "#fffaf5", chart: ["#c4581a", "#e08040", "#f2a56b", "#c9a227", "#dcc7b4", "#f8ece2"], dark: { primary: "#f2a56b", tint: "#3a2616", soft: "#e08040", bg: "#1a120c", surface: "#261a11", chart: ["#f2a56b", "#e08040", "#c4581a", "#e6c24a", "#5e4b3a", "#33241a"] } },
  { id: "yellow", name: "Yellow", primary: "#c28f00", tint: "#fff1b8", soft: "#f7d44c", bg: "#fffdf0", chart: ["#c28f00", "#e0b020", "#f7d44c", "#d9822b", "#e6dcb0", "#fbf6dc"], dark: { primary: "#f7d44c", tint: "#36300f", soft: "#e0b020", bg: "#17140a", surface: "#221d0f", chart: ["#f7d44c", "#e0b020", "#c28f00", "#ee9a4a", "#5a5232", "#2e2a14"] } },
  { id: "creme", name: "Creme", primary: "#ad7d57", tint: "#f6e9dc", soft: "#e0bf9f", bg: "#fcf7f1", chart: ["#ad7d57", "#cfa07a", "#e0bf9f", "#a26a52", "#e0d3c4", "#f6eee5"], dark: { primary: "#e0bf9f", tint: "#35291f", soft: "#cfa07a", bg: "#1a1612", surface: "#251f19", chart: ["#e0bf9f", "#cfa07a", "#ad7d57", "#c48a72", "#5a4d40", "#30271f"] } },
];

export const DEFAULT_STYLE = { theme: "blue", matchDevice: true, mode: "light", heading: "serif", corners: "soft" };
export type StyleChoice = typeof DEFAULT_STYLE;

const KEY = "trip-planner-style";
const listeners = new Set<() => void>();

function load(): StyleChoice {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved && typeof saved === "object") {
      const merged = { ...DEFAULT_STYLE, ...saved };
      if (merged.mode === "auto") merged.mode = "light"; // older saved value
      return merged;
    }
  } catch {
    /* storage unavailable, use defaults */
  }
  return DEFAULT_STYLE;
}

let current = load();

let saver: ((choice: StyleChoice) => void) | null = null;

/** Signed-in accounts register a function here that stores each choice in Supabase (see style-sync.ts). */
export function setStyleSaver(fn: ((choice: StyleChoice) => void) | null) {
  saver = fn;
}

/** Use a choice that was just loaded from the account. It is not saved back again. */
export function applyRemoteStyle(next: StyleChoice) {
  setStyle(next, true);
}

export function setStyle(next: StyleChoice, fromAccount = false) {
  current = next;
  if (!fromAccount) saver?.(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* still works for this visit */
  }
  listeners.forEach((l) => l());
}

export function useStyle(): StyleChoice {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** True while the phone or laptop itself is set to dark mode. Updates live when the device switches. */
export function useSystemDark(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(DARK_QUERY);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(DARK_QUERY).matches,
    () => false,
  );
}

/** The colors for the chosen theme. With matchDevice on, dark mode follows the device; otherwise mode decides. */
export function resolvePalette(choice: StyleChoice, systemDark: boolean) {
  const theme = THEMES.find((x) => x.id === choice.theme) ?? THEMES[1];
  const isDark = choice.matchDevice ? systemDark : choice.mode === "dark";
  if (isDark)
    return { ...theme.dark, ink: "#eef1f5", muted: "#9aa3ae", line: theme.dark.tint, track: "#ffffff22", onPrimary: theme.dark.bg, isDark };
  return { primary: theme.primary, tint: theme.tint, soft: theme.soft, bg: theme.bg, surface: "#fffef9", chart: theme.chart, ink: "#2b3b50", muted: "#566476", line: theme.tint, track: "#ffffff99", onPrimary: "#fffef8", isDark };
}

export function usePalette() {
  return resolvePalette(useStyle(), useSystemDark());
}

export function useChartColors(): string[] {
  return usePalette().chart;
}

/* ---------- Applying the style to the whole site ---------- */

export const RADII: Record<string, number> = { square: 0.3, soft: 1, round: 2 };
export const HEADING_FONTS: Record<string, string> = {
  serif: '"Fraunces", serif',
  sans: '"DM Sans", sans-serif',
  playfair: '"Playfair Display", serif',
  lora: '"Lora", serif',
  poppins: '"Poppins", sans-serif',
  grotesk: '"Space Grotesk", sans-serif',
  caveat: '"Caveat", cursive',
};

function hslOf(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l * 100];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s * 100, l * 100];
}
const REF_TINT_SAT = hslOf("#dbe9f6")[1];

/** Same recipe styles.css uses for every blue-family color, so tokens match the rest of the site. */
function tone(hue: number, sat: number, light: number, sm: number, dark: boolean) {
  const l = dark ? 95 - 0.85 * light : light;
  return `hsl(${hue} ${Math.min(100, sat * sm)}% ${l}%)`;
}

/** Sets the CSS variables in styles.css so every page follows the chosen style. */
export function applyStyleToSite(choice: StyleChoice, systemDark: boolean) {
  const theme = THEMES.find((x) => x.id === choice.theme) ?? THEMES[1];
  const pal = resolvePalette(choice, systemDark);
  const dark = pal.isDark;
  const hue = Math.round(hslOf(theme.primary)[0]);
  const sm = Math.max(0.5, Math.min(1.5, hslOf(theme.tint)[1] / REF_TINT_SAT)) * (dark ? 0.9 : 1);
  const vars: Record<string, string> = {
    "--hue": String(hue),
    "--sm": String(sm),
    "--wh": dark ? String(hue) : "50",
    "--wsm": dark ? "0.3" : "1",
    "--la": dark ? "95%" : "0%",
    "--lb": dark ? "-0.85" : "1",
    "--green": pal.primary,
    "--on-primary": dark ? pal.bg : "#fffef8",
    "--page": pal.bg,
    "--paper": pal.surface,
    "--ink": tone(hue, 30.1, 24.1, sm, dark),
    "--text": tone(hue, 24.2, 24.3, sm, dark),
    "--muted": tone(hue, 15.7, 40, sm, dark),
    "--sage": tone(hue, 26.9, 89.8, sm, dark),
    "--line": tone(hue - 4, 57.1, 89, sm, dark),
    "--accent": dark ? "#d9a074" : "#94582f",
    "--rs": String(RADII[choice.corners] ?? 1),
    "--font-heading": HEADING_FONTS[choice.heading] ?? HEADING_FONTS.serif,
  };
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.style.colorScheme = dark ? "dark" : "light";
}

/** Call once at startup: applies the saved style and keeps it in sync with changes and the device's light/dark setting. */
export function startSiteStyle() {
  const run = () => applyStyleToSite(current, window.matchMedia(DARK_QUERY).matches);
  run();
  listeners.add(run);
  window.matchMedia(DARK_QUERY).addEventListener("change", run);
}
