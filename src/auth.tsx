import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import { IMAGES } from "./data";
import googleLogo from "./assets/auth/google-g.svg";
import appleButton from "./assets/auth/apple-sign-in.png";

/** Supabase authenticates the account; everything rendered afterward is a local demo. */
export function AuthApp({ children, renderDemo }: {
  children: (session: Session, signOut: () => Promise<void>) => ReactNode;
  renderDemo: (exitDemo: () => Promise<void>) => ReactNode;
}) {
  const [demo, setDemo] = useState(() => {
    try { return sessionStorage.getItem("trip-planner-demo-session") === "active"; }
    catch { return false; }
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

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    try {
      const auth = getSupabase().auth;
      const { data } = auth.onAuthStateChange((_event, next) => {
        if (active) { setSession(next); setReady(true); }
      });
      unsubscribe = () => data.subscription.unsubscribe();
      void auth.getSession().then(({ data, error }) => {
        if (!active) return;
        if (error) setProblem("Your session could not be loaded. Please try again.");
        else setSession(data.session);
        setReady(true);
      }).catch(() => {
        if (active) { setProblem("Could not connect. Please try again."); setReady(true); }
      });
    } catch {
      setProblem("Supabase is not configured. Check .env.local and restart the app.");
      setReady(true);
    }
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!session && !demo) document.title = `${signup ? "Create account" : "Log in"} · Trip Planner`;
  }, [session, signup, demo]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(""); setNotice("");
    if (signup && !name.trim()) { setError("Enter your name."); return; }
    setBusy(true);
    try {
      const auth = getSupabase().auth;
      if (signup) {
        const { data, error } = await auth.signUp({
          email: email.trim(), password,
          options: { data: { name: name.trim() }, emailRedirectTo: `${location.origin}${location.pathname}` },
        });
        if (error) throw error;
        setPassword("");
        if (!data.session) {
          setNotice("Check your email to confirm your account, then return here and log in.");
          setSignup(false);
        }
      } else {
        const { error } = await auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        setPassword("");
      }
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "Could not connect. Please try again.");
    } finally { setBusy(false); }
  }

  async function signOut(): Promise<void> {
    const { error } = await getSupabase().auth.signOut({ scope: "local" });
    if (error) throw error;
    setPassword(""); setNotice(""); setSignup(false);
    location.hash = "/1";
  }

  function enterDemo(): void {
    // A local demo is not a Supabase session and receives no database credentials.
    try { sessionStorage.setItem("trip-planner-demo-session", "active"); } catch { /* In-memory demo still works. */ }
    setPassword(""); setError(""); setNotice("");
    location.hash = "/8";
    setDemo(true);
  }

  async function exitDemo(): Promise<void> {
    try { sessionStorage.removeItem("trip-planner-demo-session"); } catch { /* Storage may be unavailable. */ }
    setDemo(false); setSignup(false); setNotice("");
    location.hash = "/1";
  }

  if (demo) return renderDemo(exitDemo);
  if (ready && session && !problem) return children(session, signOut);

  return <main className="auth account-only">
    <div className="auth-visual">
      <img src={IMAGES.seattle} alt="Seattle skyline and Mount Rainier" />
      <div className="auth-visual-shade" />
      <div className="auth-story"><span className="eyebrow light">THE GOOD PART STARTS TOGETHER</span>
        <h1>Less back and forth.<br /><em>More out there.</em></h1>
        <p>Make a plan everyone can be part of.<br />Then make some memories.</p>
      </div>
    </div>
    <section className="auth-panel" aria-label="Your account">
      <div className="auth-form-wrap">
        <span className="eyebrow">TRIP PLANNER</span>
        {!ready ? <p role="status">Connecting…</p> : problem ? <>
          <h2>Couldn’t connect</h2><p role="alert">{problem}</p>
          <button className="btn" onClick={() => location.reload()}>Try again</button>
        </> : <>
          <h2>{signup ? "Create your account." : "Welcome back."}</h2>
          <p>{signup ? "A little planning. More time together." : "Log in with your email and password."}</p>
          <div className="provider-buttons branded-signin" aria-label="Prototype sign-in options">
            <button className="brand-signin google-signin" type="button" disabled={busy} aria-describedby="provider-preview-note"
              onClick={() => { setError(""); setNotice("Google sign-in is a prototype preview. No Google account is connected. Use the demo below to explore."); }}>
              <img src={googleLogo} width="20" height="20" alt="" aria-hidden="true" />
              <span>Sign in with Google</span>
            </button>
            <button className="brand-signin apple-signin" type="button" disabled={busy} aria-label="Sign in with Apple" aria-describedby="provider-preview-note"
              onClick={() => { setError(""); setNotice("Apple sign-in is a prototype preview. No Apple account is connected. Use the demo below to explore."); }}>
              <img src={appleButton} width="200" height="44" alt="" aria-hidden="true" />
            </button>
          </div>
          <p id="provider-preview-note" className="provider-preview-note">Google and Apple sign-in are prototype previews.</p>
          {notice && <p className="auth-notice" role="status">{notice}</p>}
          <div className="divider"><span>or with email</span></div>
          <form onSubmit={submit} className="account-form">
            {signup && <label>Your name<input required autoComplete="name" value={name} disabled={busy} onChange={e => setName(e.target.value)} /></label>}
            <label>Email<input required type="email" autoComplete="email" value={email} disabled={busy} onChange={e => setEmail(e.target.value)} /></label>
            <label>Password<input required type="password" minLength={signup ? 8 : undefined} autoComplete={signup ? "new-password" : "current-password"} value={password} disabled={busy} onChange={e => setPassword(e.target.value)} aria-describedby={signup ? "password-hint" : undefined} /></label>
            {signup && <small id="password-hint">Use at least 8 characters.</small>}
            {error && <p role="alert">{error}</p>}
            <button className="btn full" type="submit" disabled={busy}>{busy ? "Please wait…" : signup ? "Create account" : "Log in"}</button>
          </form>
          <button className="auth-toggle" type="button" disabled={busy} onClick={() => { setSignup(!signup); setPassword(""); setError(""); setNotice(""); }}>{signup ? "Already have an account? Log in" : "New here? Create an account"}</button>
          <p className="fine-print">Email login uses your real account. Trip changes stay in this browser.</p>
        </>}
        <div className="demo-login-option">
          <button className="btn outline full" type="button" disabled={busy} onClick={enterDemo}>Try demo as Maya</button>
          <p className="fine-print">No account needed. Explore Maya’s sample trips.</p>
        </div>
      </div>
    </section>
  </main>;
}
