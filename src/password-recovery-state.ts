/** The URL chooses a screen only. A verified SDK event is required to edit a password. */
export function isPasswordRecoveryUrl(url: URL = new URL(location.href)): boolean {
  return url.searchParams.has("password_recovery") ||
    new URLSearchParams(url.hash.slice(1)).get("type") === "recovery";
}

// Capture before Supabase removes callback parameters from the address bar.
export const passwordRecoveryEntry = typeof location !== "undefined" && isPasswordRecoveryUrl();
export const recoveryProofKey = "trip-password-recovery-proof-v1";
export type RecoveryProof = { userId: string; sessionId: string; expiresAt: number };

/** Bind a verified recovery to one Auth session, not just the same email address. */
export function recoverySessionId(accessToken: string): string {
  try {
    const body = JSON.parse(atob(accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof body.session_id === "string" ? body.session_id : "";
  } catch { return ""; }
}

export function matchingRecovery(proof: RecoveryProof | null, userId: string, sessionId: string): boolean {
  return !!proof && !!sessionId && proof.userId === userId && proof.sessionId === sessionId &&
    Number.isFinite(proof.expiresAt) && proof.expiresAt > Date.now();
}
