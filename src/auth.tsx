import { TEXT_LIMITS, textError, emailError } from "./limits.ts";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase, hasEmailLink, appleSignInEnabled } from "./supabase";
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
import googleLogo from "./assets/auth/google-g.svg";
import appleButton from "./assets/auth/apple-sign-in.png";

/** Supabase authenticates the account; account trip details are stored in PostgreSQL. */
export function AuthApp({
  children,
  renderDemo,
}: {
  children: (session: Session, signOut: () => Promise<void>) => ReactNode;
  renderDemo: (exitDemo: () => Promise<void>) => ReactNode;
}) {
  const [demo, setDemo] = useState(() => {
    try {
      if (inviteEntry || hasEmailLink()) {
        sessionStorage.removeItem("trip-planner-demo-session");
        return false;
      }
      return sessionStorage.getItem("trip-planner-demo-session") === "active";
    } catch {
      return false;
    }
  });
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [problem, setProblem] = useState("");
  const [signup, setSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [claim, setClaim] = useState<InviteClaim | null>(null);
  const [joiningError, setJoiningError] = useState("");
  const [joinedTrip, setJoinedTrip] = useState<string>();
  const [chosen, setChosen] = useState(Boolean(inviteEntry?.choosing));
  const [attempt, setAttempt] = useState(0);
  function chooseAccount(): void {
    if (inviteEntry) {
      inviteEntry.choosing = true;
      storeInvite();
      setChosen(true);
    }
  }
  useEffect(() => {
    if (!inviteEntry) return;
    let active = true;
    void openInvite()
      .then((value) => {
        if (active) {
          setClaim(value);
          setEmail(value.email);
        }
      })
      .catch((e) => {
        if (active) setJoiningError(e.message);
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  useEffect(() => {
    if (!claim || !session || !chosen || joinedTrip) return;
    let active = true;
    void getSupabase()
      .rpc("accept_trip_invite", { p_trip: claim.trip, p_ticket: claim.ticket })
      .then(({ error }) => {
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
  }, [claim, session?.user.id, chosen, attempt, joinedTrip]);

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
    if (reason) {
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
    if (!session && !demo)
      document.title = `${signup ? "Create account" : "Log in"} · Trip Planner`;
  }, [session, signup, demo]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError("");
    setNotice("");
    const problem =
      (signup ? textError(name, "Your name", TEXT_LIMITS.name, true) : "") ||
      emailError(email);
    if (problem) {
      setError(problem);
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
        const proof = await verifiedInviteClient();
        const updated = await proof.auth.updateUser({
          password,
          data: { name: name.trim() },
        });
        if (updated.error) throw updated.error;
        const signed = await auth.signInWithPassword({
          email: claim.email,
          password,
        });
        if (signed.error) throw signed.error;
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
          setSignup(false);
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
      setError(
        issue instanceof Error
          ? issue.message
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
    if (joinedTrip) location.reload();
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
    setDemo(true);
  }

  async function exitDemo(): Promise<void> {
    try {
      sessionStorage.removeItem("trip-planner-demo-session");
    } catch {
      /* Storage may be unavailable. */
    }
    setDemo(false);
    setSignup(false);
    setNotice("");
    location.hash = "/1";
  }

  if (demo) return renderDemo(exitDemo);
  if (ready && session && !problem && (!inviteEntry || joinedTrip))
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
          <span className="eyebrow">TRIP PLANNER</span>
          {joiningError ? (
            <>
              <h2>Trip invitation</h2>
              <p role="alert">{joiningError}</p>
              <button
                className="btn"
                onClick={() => {
                  setJoiningError("");
                  setAttempt((n) => n + 1);
                }}
              >
                Try again
              </button>
              {session && (
                <button
                  className="btn outline"
                  onClick={async () => {
                    await signOut();
                    setChosen(false);
                    if (inviteEntry) {
                      inviteEntry.choosing = false;
                      storeInvite();
                    }
                    setJoiningError("");
                  }}
                >
                  Use another account
                </button>
              )}
              <button
                className="auth-toggle"
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
            (claim && session && chosen) ? (
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
                {signup ? "Create your account." : "Welcome to Trip Planner"}
              </h2>
              <p>
                {claim
                  ? "Sign in or create an account to join your trip and answer the travel questions."
                  : signup
                    ? "A little planning. More time together."
                    : "Log in with your email and password."}
              </p>
              {claim && session && (
                <div>
                  <button className="btn full" onClick={chooseAccount}>
                    Continue as {session.user.email}
                  </button>
                  <button
                    className="auth-toggle"
                    onClick={() => void signOut()}
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
                  </div>
                  {notice && (
                    <p className="auth-notice" role="status">
                      {notice}
                    </p>
                  )}
                  <div className="divider">
                    <span>or with email</span>
                  </div>
                  <form onSubmit={submit} className="account-form">
                    {signup && (
                      <Field label="Your name">
                        <input
                          required
                          autoComplete="name"
                          maxLength={TEXT_LIMITS.name}
                          value={name}
                          disabled={busy}
                          onChange={(e) => setName(e.target.value)}
                        />
                      </Field>
                    )}
                    <Field label="Email">
                      <input
                        required
                        type="email"
                        autoComplete="email"
                        maxLength={TEXT_LIMITS.email}
                        value={email}
                        disabled={busy}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </Field>
                    <label>
                      Password
                      <input
                        required
                        type="password"
                        minLength={signup ? 8 : undefined}
                        autoComplete={
                          signup ? "new-password" : "current-password"
                        }
                        value={password}
                        disabled={busy}
                        onChange={(e) => setPassword(e.target.value)}
                        aria-describedby={signup ? "password-hint" : undefined}
                      />
                    </label>
                    {signup && (
                      <small id="password-hint">
                        Use at least 8 characters.
                      </small>
                    )}
                    {error && <p role="alert">{error}</p>}
                    <button className="btn full" type="submit" disabled={busy}>
                      {busy
                        ? "Please wait…"
                        : signup
                          ? "Create account"
                          : "Log in"}
                    </button>
                  </form>
                  <button
                    className="auth-toggle"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setSignup(!signup);
                      setPassword("");
                      setError("");
                      setNotice("");
                    }}
                  >
                    {signup
                      ? "Already have an account? Log in"
                      : "New here? Create an account"}
                  </button>
                  <p className="fine-print">
                    Create and save trips to your account. Sample trips are a
                    local preview.
                  </p>
                </>
              )}
            </>
          )}
          {!inviteEntry && (
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
