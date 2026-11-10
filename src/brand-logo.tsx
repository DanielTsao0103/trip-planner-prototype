import { THEMES, usePalette, useStyle } from "./theme";

// One Stir Crazy logo per color theme and per light/dark mode, in src/assets/logo.
const found = import.meta.glob("./assets/logo/stir-crazy-*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

export function brandLogoUrl(theme: string, dark: boolean): string {
  const id = THEMES.some((t) => t.id === theme) ? theme : "blue";
  const mode = dark ? "dark" : "light";
  return found[`./assets/logo/stir-crazy-${id}-${mode}.png`] ?? found["./assets/logo/stir-crazy-blue-light.png"];
}

/** The Stir Crazy logo (sidebar, login). It follows the chosen color and light/dark mode, including "match my device". */
export function BrandLogo({ className = "brand-logo", onPhoto = false }: { className?: string; onPhoto?: boolean }) {
  const { theme } = useStyle();
  const { isDark } = usePalette();
  // On a photo the light-on-dark version reads best, whatever the page mode is.
  return <img className={className} src={brandLogoUrl(theme, onPhoto || isDark)} alt="Stir Crazy" width={720} height={335} />;
}
