import { IMAGES } from "./data";

// Every photo dropped into src/assets/hero is picked up automatically.
const found = import.meta.glob("./assets/hero/*.{jpg,jpeg,png,webp,avif}", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const entries = Object.entries(found);

// For previewing: add ?hero=eiffel to the address to force a photo whose file name contains "eiffel".
function forced(): string | undefined {
  try {
    const want = new URLSearchParams(location.search).get("hero")?.toLowerCase();
    if (!want) return undefined;
    return entries.find(([path]) => path.toLowerCase().includes(want))?.[1];
  } catch {
    return undefined;
  }
}

// One random photo per page load, shared by the login and onboarding screens.
export const HERO_IMAGE: string =
  forced() ??
  (entries.length
    ? entries[Math.floor(Math.random() * entries.length)][1]
    : IMAGES.seattle);

export const HERO_ALT = "A photo from a past trip";
