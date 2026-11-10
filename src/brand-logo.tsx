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

/** The sidebar logo. It follows the chosen color and light/dark mode, including "match my device". */
export function BrandLogo({ className = "brand-logo" }: { className?: string }) {
  const { theme } = useStyle();
  const { isDark } = usePalette();
  return <img className={className} src={brandLogoUrl(theme, isDark)} alt="Stir Crazy" width={720} height={335} />;
}
