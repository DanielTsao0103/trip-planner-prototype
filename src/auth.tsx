import { PasswordRecovery } from "./password-recovery";
import { passwordRecoveryEntry } from "./password-recovery-state";
import { TEXT_LIMITS, textError, emailError } from "./limits.ts";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase, hasEmailLink, appleSignInEnabled, inviteProofClient, sendTripInvitationEmail } from "./supabase";
import {
  inviteEntry,
  leaveInvite,
  openInvite,
  storeInvite,
  verifiedInviteClient,
  type InviteClaim,
} from "./invite-entry";
import { HERO_IMAGE, HERO_ALT } from "./hero";
import { Field } from "./ui";
import { Eye, EyeOff } from "lucide-react";
import { BrandLogo } from "./brand-logo";
import googleLogo from "./assets/auth/google-g.svg";
import appleButton from "./assets/auth/apple-sign-in.png";

// Sign in with Apple needs a paid Apple Developer account, so the button stays hidden for now.
// To bring it back: set up Apple in Supabase, then flip this to true.
const SHOW_APPLE_SIGN_IN = false;
const ACCOUNT_UNAVAILABLE = "The account service is temporarily unavailable. Your entries are still here. Please try again.";
const ACCOUNT_DISCONNECTED = "Could not connect. Check your connection and try again. Your entries are still here.";

/** Supabase authenticates the account; account trip details are stored in PostgreSQL. */
export function AuthApp({
  children,
  renderDemo,
}: {
  children: (session: Session, signOut: () => Promise<void>) => ReactNode;
  renderDemo: (exitDemo: () => Promise<void>, enterAsMaya: boolean) => ReactNode;
}) {
  const [enterAsMaya, setEnterAsMaya] = useState(false);
  const [demo, setDemo] = useState(() => {
    try {
      if (inviteEntry || hasEmailLink() || passwordRecoveryEntry) {
        sessionStorage.removeItem("trip-planner-demo-session");
        return false;
      }
      return sessionStorage.getItem("trip-planner-demo-session") === "active";
    } catch {
      return false;
    }
  });
  const [recovery, setRecovery] = useState<"callback" | "request" | null>(passwordRecoveryEntry ? "callback" : null);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [problem, setProblem] = useState("");
  const [signup, setSignup] = useState(inviteEntry?.authMode === "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [emailFieldError, setEmailFieldError] = useState("");
  const [nameError, setNameError] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const passwordInput = useRef<HTMLInputElement>(null);
  const emailInput = useRef<HTMLInputElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const authAction = useRef<HTMLButtonElement>(null);
  const authError = useRef<HTMLParagraphElement>(null);
  const rejectedSubmitFocus = useRef(false);
  const existingAccount = signup && error === "An account already uses this email. Log in to continue.";
  const retryableError = error === ACCOUNT_UNAVAILABLE || error === ACCOUNT_DISCONNECTED;
  useEffect(() => {
    if (!error || busy) return;
    const restoreSubmitFocus = rejectedSubmitFocus.current;
    rejectedSubmitFocus.current = false;
    // Reveal the error and recovery action together after the form settles.
    let settledFrame = 0;
    const frame = requestAnimationFrame(() => {
      settledFrame = requestAnimationFrame(() => {
        const action = authAction.current;
        const target = existingAccount ? action : error.startsWith("Invalid login credentials.")
          ? passwordInput.current : authError.current;
        // A service outage needs retry guidance, not apparent password correction.
        // Preserve focus if the traveler deliberately moved elsewhere.
        if (restoreSubmitFocus && document.activeElement === document.body)
          target?.focus({ preventScroll: true });
        if (action && authError.current) {
          const top = Math.min(authError.current.getBoundingClientRect().top,
            target?.closest('.field')?.getBoundingClientRect().top ?? target?.getBoundingClientRect().top ?? Infinity);
          const bottom = action.getBoundingClientRect().bottom;
          if (top < 16 || bottom > window.innerHeight - 16)
            window.scrollBy({top: (top + bottom - window.innerHeight) / 2, behavior: "instant"});
        }
      });
    });
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(settledFrame); };
  }, [error, busy, existingAccount]);
  function recoverExistingAccount(): void {
    setAuthMode(false);
    setPassword("");
    setShowPassword(false);
    setError("");
    requestAnimationFrame(() => passwordInput.current?.focus());
  }
  const [setupRefresh, setSetupRefresh] = useState(false);

  const [claim, setClaim] = useState<InviteClaim | null>(null);
  const [joiningError, setJoiningError] = useState("");
  const invitationAccountMismatch = /unavailable for this account|different account|wrong account/i.test(joiningError);
  const invitationUnavailable = /(?:invitation|link).*(?:expired|cancelled|canceled|no longer active|incomplete)/i.test(joiningError);
  const [joinedTrip, setJoinedTrip] = useState<string>();
  const [chosen, setChosen] = useState(Boolean(inviteEntry?.choosing));
  const [attempt, setAttempt] = useState(0);
  const wrongInviteAccount = !!(claim?.accountId && session && claim.accountId !== session.user.id);
  function setAuthMode(signingUp: boolean): void {
    setSignup(signingUp);
    setPasswordError("");
    setEmailFieldError("");
    setNameError("");
    setSetupRefresh(false);
    if (inviteEntry) {
      inviteEntry.authMode = signingUp ? "signup" : "login";
      storeInvite();
    }
  }
  function switchAuthForm(signingUp: boolean): void {
    const modeTrigger = document.activeElement;
    setAuthMode(signingUp);
    setPassword("");
    setShowPassword(false);
    setError("");
    setNotice("");
    requestAnimationFrame(() => {
      // A traveler may reach another field before this frame; keep that deliberate focus.
      if (document.activeElement !== modeTrigger && document.activeElement !== document.body) return;
      window.scrollTo({top: 0, behavior: "instant"});
      (signingUp ? nameInput.current : email.trim() ? passwordInput.current : emailInput.current)?.focus({preventScroll:true});
    });
  }
  function chooseAccount(): void {
    if (inviteEntry) {
      inviteEntry.choosing = true;
      storeInvite();
      setChosen(true);
    }
  }
  useEffect(() => {
    if (!inviteEntry || recovery) return;
    let active = true;
    void openInvite()
      .then((value) => {
        if (active) {
          setClaim(value);
          setEmail(value.email);
          setSignup(inviteEntry?.authMode ? inviteEntry.authMode === "signup" : value.canSetup);
        }
      })
      .catch((e) => {
        if (active) setJoiningError(e.message);
      });
    return () => {
      active = false;
    };
  }, [attempt, recovery]);
  useEffect(() => {
    if (recovery || !claim || !session || !chosen || joinedTrip || wrongInviteAccount) return;
    let active = true;
    const client = getSupabase();
    const joining = claim.notice
      ? client.rpc("open_trip_notice", { p_trip: claim.trip, ...(claim.invitationId ? { p_invitation: claim.invitationId } : {}) })
      : client.rpc("accept_trip_invite", { p_trip: claim.trip, p_ticket: claim.ticket });
    void joining.then(({ error }) => {
        if (!active) return;
        if (error)
          setJoiningError(
            error.code === "42501"
              ? error.message
              : "Couldn’t join the trip. Please retry.",
          );
        else {
          // Keep the destination through a refresh until the planner has loaded it.
          sessionStorage.setItem(
            "trip-planner-invite-target:" + session.user.id,
            claim.trip,
          );
          leaveInvite();
          setJoinedTrip(claim.trip);
        }
      });
    return () => {
      active = false;
    };
  }, [claim, session?.user.id, chosen, joinedTrip, wrongInviteAccount, recovery]);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    try {
      const auth = getSupabase().auth;
      const { data } = auth.onAuthStateChange((_event, next) => {
        if (active) {
          setSession(next);
          setReady(true);
        }
      });
      unsubscribe = () => data.subscription.unsubscribe();
      void auth
        .getSession()
        .then(({ data, error }) => {
          if (!active) return;
          if (error)
            setProblem("Your session could not be loaded. Please try again.");
          else setSession(data.session);
          setReady(true);
        })
        .catch(() => {
          if (active) {
            setProblem("Could not connect. Please try again.");
            setReady(true);
          }
        });
    } catch {
      setProblem(
        "Supabase is not configured. Check .env.local and restart the app.",
      );
      setReady(true);
    }
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    // Google/Supabase send failures back as ?error_description=... on the return trip.
    const params = new URLSearchParams(location.search);
    const reason = params.get("error_description");
    if (reason && !passwordRecoveryEntry) {
      setError(`Sign-in didn’t finish: ${reason}`);
      for (const key of ["error", "error_code", "error_description"])
        params.delete(key);
      const rest = params.toString();
      history.replaceState(
        null,
        "",
        `${location.pathname}${rest ? `?${rest}` : ""}${location.hash}`,
      );
    }
    // Coming back with the browser's Back button should not leave the buttons stuck on "busy".
    const reset = (event: PageTransitionEvent) => {
      if (event.persisted) setBusy(false);
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  useEffect(() => {
    if (!recovery && !demo && (!session || inviteEntry))
      document.title = `${session && claim ? "Trip invitation" : signup ? "Create account" : "Log in"} · Stir Crazy`;
  }, [session, signup, demo, claim, recovery]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    if (existingAccount) { recoverExistingAccount(); return; }
    setError("");
    setNotice("");
    const invalidName = signup ? textError(name, "Your name", TEXT_LIMITS.name, true) : "";
    const invalidEmail = emailError(email);
    const invalidPassword = !password ? "Enter your password."
      : signup && password.length < 8 ? "Enter at least 8 characters." : "";
    setNameError(invalidName);
    setEmailFieldError(invalidEmail);
    setPasswordError(invalidPassword);
    if (invalidName || invalidEmail || invalidPassword) {
      // Reveal the first correction after its persistent, associated hint renders.
      const firstInvalid = invalidName ? nameInput : invalidEmail ? emailInput : passwordInput;
      requestAnimationFrame(() => firstInvalid.current?.focus());
      return;
    }
    setBusy(true);
    try {
      const auth = getSupabase().auth;
      if (
        signup &&
        claim?.canSetup &&
        email.trim().toLowerCase() === claim.email
      ) {
        // Supabase already reserved this email for the invite. Finish that passwordless
        // identity only after the traveler explicitly chooses it on the standard form.
        const current = await openInvite();
        setClaim(current);
        if (!current.canSetup) {
          setAuthMode(false);
          setPassword("");
          setNotice("This account is ready. Log in to open your trip.");
          return;
        }
        if (current.tokenInvite) {
          const signed = await auth.signUp({
            email: current.email,
            password,
            options: { data: { name: name.trim() } },
          });
          let completionAuth = auth;
          let completingId = signed.data.user?.id;
          if (signed.error) {
            if (signed.error.code !== "user_already_exists" || !current.setupAccountId || !inviteEntry?.token)
              throw signed.error;
            // A historical invitation may already have verified this otherwise
            // unfinished identity. Keep that account proof out of the main session.
            const proof = inviteProofClient();
            const verified = await proof.auth.verifyOtp({ token_hash: inviteEntry.token, type: "email" });
            if (verified.error || !verified.data.session) {
              setSetupRefresh(true);
              setPassword("");
              setNotice("This account was started earlier. Email yourself a fresh setup link to finish.");
              return;
            }
            completionAuth = proof.auth;
            completingId = verified.data.user?.id;
          } else if (!signed.data.session) {
            setAuthMode(false);
            setNotice("Check your email to confirm your account, then return here and log in.");
            setPassword("");
            return;
          }
          if (current.setupAccountId) {
            // Supabase signup returns a session for a reserved passwordless identity,
            // but does not save its submitted password/name. Check the server-owned
            // setup marker before completing that exact account with its new session.
            const fresh = await completionAuth.getUser();
            if (fresh.error) throw fresh.error;
            if (completingId !== current.setupAccountId ||
                fresh.data.user.id !== current.setupAccountId ||
                fresh.data.user.app_metadata.trip_planner_needs_setup !== true) {
              setAuthMode(false);
              setPassword("");
              setNotice(completionAuth === auth
                ? "Your account details changed. Continue with your signed-in account or use another account."
                : "This account is ready. Log in to open your trip.");
              return;
            }
            const updated = await completionAuth.updateUser({ password, data: { name: name.trim() } });
            if (updated.error) throw updated.error;
            if (completionAuth !== auth) {
              const loggedIn = await auth.signInWithPassword({ email: current.email, password });
              if (loggedIn.error) throw loggedIn.error;
            }
          }
        } else {
          // Previously delivered OTP links retain their existing verification path.
          const proof = await verifiedInviteClient();
          const updated = await proof.auth.updateUser({ password, data: { name: name.trim() } });
          if (updated.error) throw updated.error;
          const signed = await auth.signInWithPassword({ email: current.email, password });
          if (signed.error) throw signed.error;
        }
        chooseAccount();
        setPassword("");
      } else if (signup) {
        const { data, error } = await auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { name: name.trim() },
            emailRedirectTo: `${location.origin}${location.pathname}`,
          },
        });
        if (error) throw error;
        chooseAccount();
        setPassword("");
        if (!data.session) {
          setNotice(
            "Check your email to confirm your account, then return here and log in.",
          );
          setAuthMode(false);
        }
      } else {
        const { error } = await auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        chooseAccount();
        setPassword("");
      }
    } catch (issue) {
      rejectedSubmitFocus.current = true;
      const unavailable = issue instanceof Error && "status" in issue && typeof issue.status === "number" && issue.status >= 500;
      const disconnected = issue instanceof Error && /failed to fetch|fetch failed|network|load failed/i.test(issue.message);
      setError(
        unavailable ? ACCOUNT_UNAVAILABLE
          : disconnected ? ACCOUNT_DISCONNECTED
          : issue instanceof Error
          ? issue.message === "Invalid login credentials"
            ? "Invalid login credentials. Check your email and password, then try again."
            : /already registered|already exists/i.test(issue.message)
              ? "An account already uses this email. Log in to continue."
              : issue.message
          : "Could not connect. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function signInWithProvider(
    provider: "google" | "apple",
  ): Promise<void> {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (provider === "apple" && !(await appleSignInEnabled())) {
        setNotice("Apple sign-in isn’t available yet. Use Google or email.");
        setBusy(false);
        return;
      }
      chooseAccount();
      const { error } = await getSupabase().auth.signInWithOAuth({
        provider,
        // Come back to this exact page (with its base path); the PKCE code arrives as ?code=...
        options: { redirectTo: `${location.origin}${location.pathname}` },
      });
      if (error) throw error;
      // The browser is now leaving for Google, so the buttons stay disabled until we return.
    } catch (issue) {
      setBusy(false);
      setError(
        issue instanceof Error
          ? issue.message
          : "Could not start sign-in. Please try again.",
      );
    }
  }

  async function signOut(): Promise<void> {
    const { error } = await getSupabase().auth.signOut({ scope: "local" });
    if (error) throw error;
    setPassword("");
    setNotice("");
    setSignup(false);
    location.hash = "/1";
    window.scrollTo(0, 0);
    if (joinedTrip) location.reload();
  }

  async function emailFreshSetup(): Promise<void> {
    setBusy(true);
    setError("");
    try {
      const current = await openInvite();
      setClaim(current);
      if (!current.tokenInvite || !current.canSetup || !current.setupAccountId) {
        setAuthMode(false);
        setNotice("This account is ready. Log in to open your trip.");
        return;
      }
      await sendTripInvitationEmail(current.email, current.trip, current.invitationId);
      setSetupRefresh(false);
      setNotice("Check your email to finish setting up your account.");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not send the setup email. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  async function switchAccount(): Promise<void> {
    setBusy(true);
    setError("");
    setChosen(false);
    if (inviteEntry) {
      inviteEntry.choosing = false;
      storeInvite();
    }
    try {
      await signOut();
      setAuthMode(false);
      if (claim) setEmail(claim.email);
      setJoiningError("");
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not switch accounts. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function enterDemo(): void {
    // A local demo is not a Supabase session and receives no database credentials.
    try {
      sessionStorage.setItem("trip-planner-demo-session", "active");
    } catch {
      /* In-memory demo still works. */
    }
    setPassword("");
    setError("");
    setNotice("");
    location.hash = "/8";
    setEnterAsMaya(true);
    setDemo(true);
  }

  async function exitDemo(): Promise<void> {
    try {
      sessionStorage.removeItem("trip-planner-demo-session");
    } catch {
      /* Storage may be unavailable. */
    }
    setDemo(false);
    setEnterAsMaya(false);
    setSignup(false);
    setNotice("");
    location.hash = "/1";
    window.scrollTo(0, 0);
  }

  const recoveryRedirect = new URL(location.pathname, location.origin);
  recoveryRedirect.searchParams.set("password_recovery", "1");
  // Token invitations can travel to a new tab without carrying account credentials.
  if (inviteEntry?.trip && (inviteEntry.notice || inviteEntry.token)) {
    recoveryRedirect.searchParams.set(inviteEntry.notice ? "trip_notice" : "trip_invite", inviteEntry.trip);
    if (inviteEntry.token) recoveryRedirect.searchParams.set("trip_token", inviteEntry.token);
    if (inviteEntry.invitationId) recoveryRedirect.searchParams.set("invitation", inviteEntry.invitationId);
  }
  const legacyRecoveryInvitation = !!(inviteEntry && !inviteEntry.notice && !inviteEntry.token) ||
    new URLSearchParams(location.search).has("recovery_invitation");
  if (legacyRecoveryInvitation) recoveryRedirect.searchParams.set("recovery_invitation", "1");
  if (demo && !recovery) return renderDemo(exitDemo, enterAsMaya);
  if (!recovery && ready && session && !problem && (!inviteEntry || joinedTrip))
    return children(session, signOut);

  return (
    <main className="auth account-only">
      <div className="auth-visual">
        <img src={HERO_IMAGE} alt={HERO_ALT} />
        <div className="auth-visual-shade" />
        <div className="auth-story">
          <h1>The world is huge, go out and explore it.</h1>
          <p>All your plans, in one place.</p>
        </div>
      </div>
      <section className="auth-panel" aria-label="Your account">
        <div className="auth-form-wrap">
          {ready && signup && !session && !problem && !joiningError && !recovery && (!inviteEntry || claim) && !existingAccount ? (
            <div className="auth-brand-row">
              <BrandLogo className="brand-logo auth-logo" />
              <button className="auth-toggle" type="button" disabled={busy}
                aria-label="Already have an account? Log in" onClick={() => switchAuthForm(false)}>Log in</button>
            </div>
          ) : <BrandLogo className="brand-logo auth-logo" />}
          {recovery ? <PasswordRecovery callback={recovery === "callback"} initialEmail={email}
            redirectTo={recoveryRedirect.href} reopenInvitation={legacyRecoveryInvitation} returnLabel={session ? "Back to your account" : "Back to log in"}
            onExit={() => { setRecovery(null); setAuthMode(false); setPassword(""); setError(""); setNotice(""); }} /> : joiningError ? (
            <>
              <h2>Trip invitation</h2>
              <p role="alert">{joiningError}</p>
              {invitationUnavailable && !/fresh|ask the trip owner/i.test(joiningError) && <p>Ask the trip owner for a fresh invitation.</p>}
              <div className="auth-recovery-actions">
              {session && invitationAccountMismatch && <button className="btn" disabled={busy} onClick={() => void switchAccount()}>Use another account</button>}
              {!invitationUnavailable && !invitationAccountMismatch && <button
                className={invitationAccountMismatch ? "btn outline" : "btn"}
                onClick={() => {
                  setJoiningError("");
                  setClaim(null);
                  setAttempt((n) => n + 1);
                }}
              >
                Try again
              </button>}
              {session && !invitationUnavailable && !invitationAccountMismatch && (
                <button
                  className="btn outline"
                  disabled={busy}
                  onClick={() => void switchAccount()}
                >
                  Use another account
                </button>
              )}
              </div>
              {error && <p className="auth-error" role="alert">{error}</p>}
              <button
                className={invitationUnavailable ? "btn full" : "auth-toggle"}
                onClick={() => {
                  leaveInvite();
                  location.reload();
                }}
              >
                Leave invitation
              </button>
            </>
          ) : !ready ||
            (inviteEntry && !claim) ||
            (claim && session && chosen && !wrongInviteAccount) ? (
            <p role="status">Connecting…</p>
          ) : problem ? (
            <>
              <h2>Couldn’t connect</h2>
              <p role="alert">{problem}</p>
              <button className="btn" onClick={() => location.reload()}>
                Try again
              </button>
            </>
          ) : (
            <>
              <h2>
                {claim && session ? "Trip invitation" : signup ? "Create your account." : "Welcome to Stir Crazy"}
              </h2>
              <p>
                {wrongInviteAccount
                  ? `This invitation is for ${claim!.email}. Sign in with that account to open the trip.`
                  : claim && session
                    ? "Continue with your signed-in account to see the trip details."
                    : claim
                      ? signup
                        ? "Create an account to join and see the trip details."
                        : "Log in to join and see the trip details."
                  : signup
                    ? "A little planning. More time together."
                    : "Log in with your email and password."}
              </p>
              {notice && (
                <p className="auth-notice" role="status">
                  {notice}
                </p>
              )}
              {claim && session && (
                <div>
                  {!wrongInviteAccount && (
                    <button className="btn full" disabled={busy} onClick={chooseAccount}>
                      <span className="invite-account-label">Continue as {session.user.email}</span>
                    </button>
                  )}
                  {wrongInviteAccount && <p>Currently signed in as {session.user.email}.</p>}
                  {error && <p className="auth-error" role="alert">{error}</p>}
                  <button
                    className="auth-toggle"
                    disabled={busy}
                    onClick={() => void switchAccount()}
                  >
                    Use another account
                  </button>
                </div>
              )}
              {!(claim && session) && (
                <>
                  <div
                    className="provider-buttons branded-signin"
                    aria-label="Sign-in options"
                  >
                    <button
                      className="brand-signin google-signin"
                      type="button"
                      disabled={busy}
                      onClick={() => void signInWithProvider("google")}
                    >
                      <img
                        src={googleLogo}
                        width="20"
                        height="20"
                        alt=""
                        aria-hidden="true"
                      />
                      <span>Sign in with Google</span>
                    </button>
                    {SHOW_APPLE_SIGN_IN && (
                      <button
                        className="brand-signin apple-signin"
                        type="button"
                        disabled={busy}
                        aria-label="Sign in with Apple"
                        onClick={() => void signInWithProvider("apple")}
                      >
                        <img
                          src={appleButton}
                          width="200"
                          height="44"
                          alt=""
                          aria-hidden="true"
                        />
                      </button>
                    )}
                  </div>

                  <div className="divider">
                    <span>or with email</span>
                  </div>
                  <form onSubmit={submit} noValidate className="account-form">
                    {signup && (
                      <Field label="Your name" hint={nameError || undefined}>
                        <input
                          required
                          ref={nameInput}
                          aria-invalid={Boolean(nameError)}
                          autoComplete="name"
                          maxLength={TEXT_LIMITS.name}
                          value={name}
                          disabled={busy}
                          onChange={(e) => {
                            setName(e.target.value);
                            if (nameError) setNameError(textError(e.target.value, "Your name", TEXT_LIMITS.name, true));
                          }}
                        />
                      </Field>
                    )}
                    <Field label="Email" hint={emailFieldError || undefined}>
                      <input
                        required
                        ref={emailInput}
                        aria-invalid={Boolean(emailFieldError)}
                        type="email"
                        autoComplete="email"
                        maxLength={TEXT_LIMITS.email}
                        value={email}
                        disabled={busy}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (emailFieldError) setEmailFieldError(emailError(e.target.value));
                          if (existingAccount) setError("");
                        }}
                      />
                    </Field>
                    <Field label="Password" hint={passwordError || (signup ? "Use at least 8 characters." : undefined)}>
                      <span className="password-input">
                        <input
                          required
                          ref={passwordInput}
                          type={showPassword ? "text" : "password"}
                          minLength={signup ? 8 : undefined}
                          autoComplete={signup ? "new-password" : "current-password"}
                          value={password}
                          disabled={busy}
                          aria-invalid={Boolean(passwordError)}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            if (passwordError) setPasswordError(e.target.value.length >= (signup ? 8 : 1)
                              ? "" : signup ? "Enter at least 8 characters." : "Enter your password.");
                          }}
                        />
                        <button type="button" className="password-toggle" disabled={busy}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </span>
                    </Field>
                    {error && <p ref={authError} tabIndex={-1} className="auth-error" role="alert">{error}</p>}
                    <button ref={authAction} className="btn full" type={existingAccount ? "button" : "submit"} disabled={busy}
                      onClick={existingAccount ? recoverExistingAccount : undefined}>
                      {existingAccount ? "Log in instead" : busy
                        ? (signup ? "Creating account…" : "Signing in…")
                        : retryableError ? "Try again" : signup
                          ? "Create account"
                          : "Log in"}
                    </button>
                  </form>
                  {!signup && <button className="auth-toggle" type="button" disabled={busy} onClick={() => {
                    setPassword(""); setError(""); setNotice(""); setRecovery("request");
                  }}>Forgot password?</button>}
                  {setupRefresh && <button className="btn outline full" type="button" disabled={busy} onClick={() => void emailFreshSetup()}>
                    Email me a fresh setup link
                  </button>}
                  {!existingAccount && !signup && <button
                    className="auth-toggle"
                    type="button"
                    disabled={busy}
                    onClick={() => switchAuthForm(true)}
                  >
                    New here? Create an account
                  </button>}
                </>
              )}
              {claim && <button className="auth-toggle" type="button" disabled={busy} onClick={() => {
                leaveInvite();
                location.reload();
              }}>Leave invitation</button>}
            </>
          )}
          {!inviteEntry && !recovery && (
            <div className="demo-login-option">
              <button
                className="btn outline full"
                type="button"
                disabled={busy}
                onClick={enterDemo}
              >
                Try demo as Maya
              </button>
              <p className="fine-print">
                No account needed. Explore Maya’s sample trips.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
