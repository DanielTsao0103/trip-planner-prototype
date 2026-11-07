/** Pure account rules. No React or Supabase imports, so node can unit test them. */
import { TEXT_LIMITS, textError } from "./limits.ts";

export type SignInMethod = "email" | "google" | "other";

type AuthLike = {
  identities?: { provider?: string }[] | null;
  app_metadata?: Record<string, unknown> | null;
};

/**
 * How this account signs in. Anyone connected to Google counts as a Google account, even if they
 * also have an email identity, so we never offer a password form that could be mistaken for
 * their Google password. Only accounts created directly with email and password are "email".
 */
export function signInMethodOf(user: AuthLike | null | undefined): SignInMethod {
  const providers = new Set<string>();
  for (const identity of user?.identities ?? [])
    if (typeof identity?.provider === "string") providers.add(identity.provider);
  const meta = user?.app_metadata;
  if (typeof meta?.provider === "string") providers.add(meta.provider);
  if (Array.isArray(meta?.providers))
    for (const provider of meta.providers) if (typeof provider === "string") providers.add(provider);
  if (providers.has("google")) return "google";
  if (providers.has("email") && providers.size === 1) return "email";
  return "other";
}

export const PASSWORD_MIN = 8;
// Supabase hashes with bcrypt, which only reads the first 72 characters.
export const PASSWORD_MAX = 72;

/** Why a display name cannot be saved, or an empty string when it is fine. */
export function nameError(name: string): string {
  return textError(name.trim(), "Name", TEXT_LIMITS.name, true);
}

/** Why a password change cannot be sent, or an empty string when it is fine. */
export function passwordChangeError(current: string, next: string, confirm: string): string {
  if (!current) return "Enter your current password.";
  if (next.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters for your new password.`;
  if (next.length > PASSWORD_MAX) return `Use ${PASSWORD_MAX} characters or fewer for your new password.`;
  if (next === current) return "Choose a password that is different from your current one.";
  if (next !== confirm) return "The new passwords do not match.";
  return "";
}
