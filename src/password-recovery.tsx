import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { Eye, EyeOff } from "lucide-react";
import { passwordRecoveryClient } from "./supabase";
import { emailError, TEXT_LIMITS } from "./limits";
import { Field } from "./ui";
import { matchingRecovery, recoveryProofKey, recoverySessionId, type RecoveryProof } from "./password-recovery-state";

const expiredMessage = "This reset link is expired, already used, or was opened in a different browser. Request a new link and open it in this browser.";

/** Account recovery is isolated from both the planner login and invitation proof. */
export function PasswordRecovery({ callback, initialEmail, redirectTo, reopenInvitation, returnLabel, onExit }: {
  callback: boolean;
  initialEmail: string;
  redirectTo: string;
  reopenInvitation: boolean;
  returnLabel: string;
  onExit: () => void;
}) {
  const [step, setStep] = useState<"checking" | "request" | "sent" | "password" | "success" | "invalid">(callback ? "checking" : "request");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [invalidReason, setInvalidReason] = useState(expiredMessage);
  const proof = useRef<RecoveryProof | null>(null);
  const recovered = useRef<Session | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const completed = useRef(false);

  useEffect(() => {
    document.title = "Reset password · Stir Crazy";
    heading.current?.focus();
  }, [step]);

  useEffect(() => {
    if (!callback) return;
    let active = true;
    let cancel = () => {};
    try {
      const auth = passwordRecoveryClient().auth;
      // This record only resumes a recovery already verified by this SDK in this tab.
      try { proof.current = JSON.parse(sessionStorage.getItem(recoveryProofKey) || "null"); } catch { /* No resumable proof. */ }
      const acceptSession = (session: Session | null): boolean => {
        if (!session || !matchingRecovery(proof.current, session.user.id, recoverySessionId(session.access_token))) return false;
        recovered.current = session;
        setEmail(session.user.email || "");
        setStep("password");
        return true;
      };
      const { data } = auth.onAuthStateChange((event, session) => {
        if (!active || completed.current) return;
        if (event === "PASSWORD_RECOVERY" && session) {
          const sessionId = recoverySessionId(session.access_token);
          proof.current = { userId: session.user.id, sessionId, expiresAt: Date.now() + 60 * 60 * 1000 };
          try { sessionStorage.setItem(recoveryProofKey, JSON.stringify(proof.current)); } catch { /* Current tab can continue; reload needs a new link. */ }
          if (!acceptSession(session)) setStep("invalid");
        } else if (recovered.current && (!session || !matchingRecovery(proof.current, session.user.id, recoverySessionId(session.access_token)))) {
          proof.current = null;
          recovered.current = null;
          setPassword("");
          setConfirm("");
          setInvalidReason("Your reset session changed. Request a new link for the account you want to update.");
          setStep("invalid");
        }
      });
      cancel = () => data.subscription.unsubscribe();
      void auth.initialize().then(async ({ error: initError }) => {
        const { data, error: sessionError } = await auth.getSession();
        // Initialization emits recovery after processing the callback. Let that SDK event run first.
        setTimeout(() => {
          if (!active || completed.current) return;
          if (initError || sessionError || !acceptSession(data.session)) setStep("invalid");
        }, 0);
      }).catch(() => { if (active) setStep("invalid"); });
    } catch { setStep("invalid"); }
    return () => { active = false; cancel(); };
  }, [callback]);

  async function sendLink(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (busy) return;
    const validation = emailError(email);
    if (validation) { setError(validation); return; }
    setBusy(true);
    setError("");
    try {
      const auth = passwordRecoveryClient().auth;
      const { data: current, error: sessionError } = await auth.getSession();
      if (sessionError) throw sessionError;
      // Clear an abandoned recovery before issuing a new verifier, never afterwards.
      if (current.session) {
        proof.current = null;
        recovered.current = null;
        const signedOut = await auth.signOut({ scope: "local" });
        if (signedOut.error) throw signedOut.error;
      }
      try { sessionStorage.removeItem(recoveryProofKey); } catch { /* No resumable proof. */ }
      const { error: issue } = await auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (issue) throw issue;
      setStep("sent");
    } catch (issue) {
      setError((issue as { status?: number })?.status === 429
        ? "Too many requests. Please wait a few minutes, then try again."
        : "Couldn’t send the reset link. Check your connection and try again.");
    } finally { setBusy(false); }
  }

  async function updatePassword(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (password.length < 8) { setError("Use at least 8 characters for your new password."); return; }
    if (password !== confirm) { setError("The passwords don’t match. Enter the same password in both fields."); return; }
    setBusy(true);
    try {
      const auth = passwordRecoveryClient().auth;
      const { data: current, error: sessionError } = await auth.getSession();
      if (sessionError) throw sessionError;
      if (!current.session || !matchingRecovery(proof.current, current.session.user.id, recoverySessionId(current.session.access_token))) {
        setInvalidReason("Your reset session changed or expired. Request a new link for the account you want to update.");
        setStep("invalid"); return;
      }
      // Ask Auth to verify the account before changing it; URL flags and cached user data are not proof.
      const verified = await auth.getUser();
      if (verified.error) throw verified.error;
      if (verified.data.user?.id !== proof.current?.userId) {
        setInvalidReason("Your reset session no longer matches this account. Request a new link for the account you want to update.");
        setStep("invalid"); return;
      }
      const { data, error: issue } = await auth.updateUser({ password });
      if (issue) throw issue;
      if (!data.user || data.user.id !== proof.current?.userId) throw new Error("The account changed. Request a new reset link.");
      completed.current = true;
      proof.current = null;
      try { sessionStorage.removeItem(recoveryProofKey); } catch { /* In-memory proof is already cleared. */ }
      setPassword("");
      setConfirm("");
      setStep("success");
    } catch (issue) {
      const code = (issue as { code?: string })?.code;
      if (["session_not_found", "refresh_token_not_found", "bad_jwt", "otp_expired"].includes(code || "")) setStep("invalid");
      else setError(code === "same_password" ? "Choose a password different from your current password."
        : code === "weak_password" ? "Choose a stronger password with a mix of letters, numbers, and symbols."
          : "Couldn’t update your password. Please try again.");
    } finally { setBusy(false); }
  }

  async function exit(): Promise<void> {
    setBusy(true);
    setError("");
    try {
      const auth = passwordRecoveryClient().auth;
      const { data, error: sessionError } = await auth.getSession();
      if (sessionError) throw sessionError;
      // Signing out even without a session deletes pending PKCE verifiers. Keep a sent link usable.
      if (data.session) {
        const { error: issue } = await auth.signOut({ scope: "local" });
        if (issue) throw issue;
      }
      try { sessionStorage.removeItem(recoveryProofKey); } catch { /* No usable proof remains in memory. */ }
      const url = new URL(location.href);
      for (const key of ["password_recovery", "recovery_invitation", "code", "error", "error_code", "error_description"]) url.searchParams.delete(key);
      if (!url.hash.startsWith("#/")) url.hash = "";
      history.replaceState(history.state, "", url);
      onExit();
    } catch { setError("Couldn’t finish closing password reset. Please try again."); }
    finally { setBusy(false); }
  }

  return <>
    <h2 ref={heading} tabIndex={-1}>{step === "checking" ? "Checking your reset link" : step === "sent" ? "Check your email" : step === "invalid" ? "Request a new reset link" : step === "success" ? "Password updated" : step === "password" ? "Choose a new password" : "Forgot your password?"}</h2>
    {step === "checking" && <p role="status">Verifying your reset link…</p>}
    {step === "invalid" && <><p role="alert">{invalidReason}</p><button className="btn full" disabled={busy} onClick={() => { setStep("request"); setError(""); }}>Request new link</button></>}
    {step === "success" && <p role="status">Your password has been updated. Use your new password the next time you log in.</p>}
    {reopenInvitation && (step === "sent" || step === "success") && <p>If you opened password reset in a new tab, reopen your original trip invitation after updating your password.</p>}
    {step === "sent" && <>
      <p role="status">If an account exists for <strong>{email.trim()}</strong>, you’ll receive a password reset link.</p>
      <p>Check your spam folder too. Open the link in this browser; the link can only be used once.</p>
      <button className="btn outline full" disabled={busy} onClick={() => { setStep("request"); setError(""); }}>Change email or resend</button>
    </>}
    {step === "request" && <>
      <p>Enter your account email and we’ll send you a link to choose a new password.</p>
      <form className="account-form" onSubmit={sendLink} noValidate>
        <Field label="Email"><input type="email" autoComplete="email" autoFocus value={email} maxLength={TEXT_LIMITS.email} disabled={busy} onChange={e => setEmail(e.target.value)} /></Field>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="btn full" disabled={busy}>{busy ? "Sending reset link…" : "Send reset link"}</button>
      </form>
    </>}
    {step === "password" && <>
      <p>Set a new password for <strong>{email}</strong>.</p>
      <form className="account-form" onSubmit={updatePassword} noValidate>
        <Field label="New password" hint="Use at least 8 characters."><span className="password-input"><input type={reveal ? "text" : "password"} autoComplete="new-password" value={password} disabled={busy} onChange={e => setPassword(e.target.value)} /><button className="password-toggle" type="button" aria-label={reveal ? "Hide passwords" : "Show passwords"} aria-pressed={reveal} disabled={busy} onClick={() => setReveal(!reveal)}>{reveal ? <EyeOff size={18} /> : <Eye size={18} />}</button></span></Field>
        <Field label="Confirm new password"><input type={reveal ? "text" : "password"} autoComplete="new-password" value={confirm} disabled={busy} onChange={e => setConfirm(e.target.value)} /></Field>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="btn full" disabled={busy}>{busy ? "Updating password…" : "Update password"}</button>
      </form>
    </>}
    {error && step !== "request" && step !== "password" && <p className="auth-error" role="alert">{error}</p>}
    <button className={step === "success" ? "btn full" : "auth-toggle"} type="button" disabled={busy || step === "checking"} onClick={() => void exit()}>{returnLabel}</button>
  </>;
}
