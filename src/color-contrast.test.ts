import test from "node:test";
import assert from "node:assert/strict";
import { contrastRatio, readableAccent, readableForeground } from "./color-contrast.ts";
import { THEMES, DEFAULT_STYLE, resolvePalette, applyStyleToSite, normalizeStyle, HEADING_FONTS, RADII } from "./theme.ts";

test("invalid saved style IDs fall back while every supported personal choice survives", () => {
  for (const invalid of [null, [], "legacy", { heading: "missing", corners: "missing", theme: "missing", matchDevice: "false", mode: "auto" }, { heading: "__proto__", corners: "constructor" }]) {
    assert.deepEqual(normalizeStyle(invalid), DEFAULT_STYLE);
  }
  for (const theme of THEMES) for (const heading of Object.keys(HEADING_FONTS)) for (const corners of Object.keys(RADII)) {
    const choice = { theme: theme.id, heading, corners, matchDevice: false, mode: "dark" };
    assert.deepEqual(normalizeStyle(choice), choice);
  }
  assert.equal(normalizeStyle({ heading: "caveat", corners: false }).heading, "caveat");
  assert.equal(normalizeStyle({ mode: "dark", matchDevice: false }).mode, "dark");
});

test("sRGB contrast uses known reference ratios and rejects ambiguous colors", () => {
  assert.equal(contrastRatio("#000000", "#ffffff"), 21);
  assert.equal(contrastRatio("#abcdef", "#abcdef"), 1);
  assert.ok(Math.abs(contrastRatio("#777777", "#ffffff") - 4.478089453577214) < 1e-12);
  // This near-threshold gray must not pass because its ratio rounds to 4.5.
  assert.equal(readableForeground("#777777", "#ffffff"), "#000000");
  assert.equal(readableForeground("#000000", "#111111"), "#ffffff");
  assert.equal(readableForeground("#ffffff", "#123456"), "#123456");
  assert.equal(readableAccent("#23426b", ["#fffef9", "#dbe9f6"], false), "#23426b");
  for (const invalid of ["#fff", "#ffffff80", "red", "#zzzzzz"]) {
    assert.throws(() => contrastRatio(invalid, "#000000"));
  }
});

test("all 14 primary pairs meet 4.5:1 while passing original foregrounds remain intact", () => {
  const changed: string[] = [];
  for (const theme of THEMES) {
    for (const mode of ["light", "dark"]) {
      const choice = { ...DEFAULT_STYLE, theme: theme.id, matchDevice: false, mode };
      const palette = resolvePalette(choice, false);
      const source = mode === "dark" ? theme.dark : theme;
      const original = mode === "dark" ? theme.dark.bg : "#fffef8";
      assert.equal(palette.primary, source.primary, `${theme.id}/${mode}: brand fill`);
      assert.equal(palette.bg, source.bg, `${theme.id}/${mode}: page fill`);
      assert.deepEqual(palette.chart, source.chart, `${theme.id}/${mode}: chart palette`);
      assert.ok(contrastRatio(palette.primary, palette.onPrimary) >= 4.5, `${theme.id}/${mode}`);
      for (const background of [palette.bg, palette.surface, palette.tint]) {
        assert.ok(contrastRatio(palette.controlBorder, background) >= 3, `${theme.id}/${mode}: control boundary on ${background}`);
        assert.ok(contrastRatio(palette.actionInk, background) >= 4.5, `${theme.id}/${mode}: action text on ${background}`);
      }
      if (contrastRatio(palette.primary, original) >= 4.5) {
        assert.equal(palette.onPrimary, original, `${theme.id}/${mode}: preserve passing foreground`);
      }
      if (palette.onPrimary !== original) changed.push(`${theme.id}/${mode}`);
    }
  }
  assert.deepEqual(changed, ["orange/light", "yellow/light", "creme/light"]);
});

test("Style preview and applied CSS use the same primary pair in every appearance", (t) => {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const properties = new Map<string, string>();
  const style = {
    colorScheme: "",
    setProperty: (name: string, value: string): void => { properties.set(name, value); },
  };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { documentElement: { style, dataset: {} } },
  });
  t.after(() => {
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
  });

  for (const theme of THEMES) {
    for (const systemDark of [false, true]) {
      for (const matchDevice of [false, true]) {
        // Device-following must override the opposite manual preference.
        const mode = systemDark ? "light" : "dark";
        const choice = { ...DEFAULT_STYLE, theme: theme.id, matchDevice, mode };
        const preview = resolvePalette(choice, systemDark);
        applyStyleToSite(choice, systemDark);
        assert.equal(properties.get("--green"), preview.primary);
        assert.equal(properties.get("--on-primary"), preview.onPrimary);
        assert.equal(properties.get("--action-ink"), preview.actionInk);
        assert.equal(properties.get("--page"), preview.bg);
        assert.equal(style.colorScheme, preview.isDark ? "dark" : "light");
        assert.equal(preview.isDark, matchDevice ? systemDark : mode === "dark");
      }
    }
  }
});
