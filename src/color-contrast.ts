/** Relative luminance for an opaque six-digit sRGB hex color, on a 0–1 scale.
 * W3C's G18 formula: https://www.w3.org/WAI/WCAG22/Techniques/general/G18
 */
function luminance(hex: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) {
    throw new Error("Contrast colors must be opaque six-digit hex values.");
  }
  const linear = [1, 3, 5].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

/** Compare unrounded luminance ratios; 4.499 does not meet a 4.5 target. */
export function contrastRatio(first: string, second: string): number {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Preserve the original foreground when readable, without changing the brand fill.
 * For any opaque sRGB fill, either black or white meets the 4.5:1 text target.
 */
export function readableForeground(background: string, preferred: string): string {
  if (contrastRatio(background, preferred) >= 4.5) return preferred;
  return contrastRatio(background, "#000000") >= contrastRatio(background, "#ffffff")
    ? "#000000"
    : "#ffffff";
}

/** Keep the brand hue for text, only moving its channels toward black/white
 * until the same text is readable on every supplied functional surface.
 */
export function readableAccent(foreground: string, backgrounds: string[], dark: boolean, target = 4.5): string {
  const channels = [1, 3, 5].map((offset) => parseInt(foreground.slice(offset, offset + 2), 16));
  for (let step = 0; step <= 100; step += 1) {
    const amount = step / 100;
    const candidate = `#${channels.map((channel) =>
      Math.round(channel + ((dark ? 255 : 0) - channel) * amount).toString(16).padStart(2, "0")
    ).join("")}`;
    if (backgrounds.every((background) => contrastRatio(candidate, background) >= target)) return candidate;
  }
  return dark ? "#ffffff" : "#000000";
}
