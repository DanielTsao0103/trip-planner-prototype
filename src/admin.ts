/** Rules for the Admin page access list. The database enforces the same rules, so these only give early feedback. */
import { emailError } from "./limits.ts";

export type AdminEntry = { email: string; addedAt: string };

export function normalizeAdminEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Message for an email that cannot be added, or an empty string when it can. */
export function adminEmailError(raw: string, existing: readonly string[]): string {
  const problem = emailError(raw);
  if (problem) return problem;
  return existing.includes(normalizeAdminEmail(raw)) ? "That email already has admin access." : "";
}

/** Oldest entries first, so the starting team stays on top and new additions land at the bottom. */
export function sortAdminEntries(entries: readonly AdminEntry[]): AdminEntry[] {
  return [...entries].sort((a, b) => a.addedAt.localeCompare(b.addedAt) || a.email.localeCompare(b.email));
}
