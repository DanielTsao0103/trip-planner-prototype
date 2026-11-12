import { useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, LogOut, Palette, Users } from "lucide-react";
import { useApp } from "./state";
import { Avatar, Button, ErrorBox, Field, PageHead } from "./ui";
import { ProfilePictureEditor } from "./profile-picture-editor";
import { PASSWORD_MAX, nameError, passwordChangeError } from "./account";
import { changeAccountPassword, saveAccountName } from "./account-actions";
import { TEXT_LIMITS } from "./limits";
import "./account-style-refinement.css";

/** Account hub, opened from the profile picture. Real accounts store everything in Supabase. */
export function AccountPage() {
  const { user, accountInfo, go, tripGo, open, signOut } = useApp();
  const { cloud, email, method } = accountInfo;
  return (
    <div className="account-page">
      <PageHead title="Account" description="Your photo, name, and sign-in details." />
      <section className="card account-section" aria-labelledby="account-profile">
        <h2 id="account-profile">Profile</h2>
        <div className="person">
          <Avatar name={user?.name || "Guest"} id={user?.id} large />
          <div>
            <strong>{user?.name}</strong>
            <small>{email || user?.email}</small>
          </div>
        </div>
        <ProfilePictureEditor />
        {cloud ? (
          <NameForm current={user?.name ?? ""} />
        ) : (
          <p className="account-note">
            This is a local demo account, so its name and photo are fixed. Sign up to edit them.
          </p>
        )}
      </section>

      {cloud && (
        <section className="card account-section" aria-labelledby="account-signin">
          <h2 id="account-signin">Sign-in</h2>
          <dl className="account-facts">
            <div>
              <dt>Email</dt>
              <dd>{email}</dd>
            </div>
            <div>
              <dt>Sign-in method</dt>
              <dd>{method === "email" ? "Email and password" : method === "google" ? "Google" : "Another provider"}</dd>
            </div>
          </dl>
          {method === "email" ? (
            <details className="account-password-disclosure"><summary>Change password</summary><PasswordForm email={email} /></details>
          ) : (
            // Passwords for Google (or other provider) accounts belong to that provider, so no form here.
            <p className="account-note">
              {method === "google"
                ? "You sign in with Google. Your Google password is managed by Google, not Stir Crazy."
                : "You sign in with an outside provider, which manages your password."}
            </p>
          )}
        </section>
      )}

      <section className="card account-section" aria-labelledby="account-more">
        <h2 id="account-more">More</h2>
        <div className="menu-links">
          <button onClick={() => tripGo(15)}>
            My travel preferences
            <ArrowRight size={16} />
          </button>
          <button onClick={() => go(5)}>
            My trips
            <ArrowRight size={16} />
          </button>
          <button onClick={() => go(18)}>
            Style
            <Palette size={16} />
          </button>
          <button onClick={() => open("demo")}>
            Prototype controls
            <Users size={16} />
          </button>
          <button onClick={() => void signOut()}>
            {cloud ? "Log out" : "Exit demo"}
            <LogOut size={16} />
          </button>
        </div>
      </section>
    </div>
  );
}

function NameForm({ current }: { current: string }) {
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const problem = nameError(name);
  const unchanged = name.trim() === current;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || unchanged) return;
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await saveAccountName(name);
      setName(name.trim());
      setSaved(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save your name.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="account-form account-name-form" onSubmit={submit} noValidate>
      <Field label="Name">
        <input
          type="text"
          autoComplete="name"
          maxLength={TEXT_LIMITS.name}
          value={name}
          disabled={busy}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
            setError("");
          }}
        />
      </Field>
      <ErrorBox text={error} />
      {saved && (
        <p className="account-status" role="status">
          Name saved.
        </p>
      )}
      <Button type="submit" variant="outline small" disabled={busy || unchanged}>
        {busy ? "Saving…" : "Save name"}
      </Button>
    </form>
  );
}

function PasswordForm({ email }: { email: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [revealed, setRevealed] = useState({ current: false, next: false, confirm: false });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const problem = passwordChangeError(current, next, confirm);
    if (problem) {
      setError(problem);
      setDone(false);
      return;
    }
    setBusy(true);
    setError("");
    setDone(false);
    try {
      await changeAccountPassword(email, current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not change your password.");
    } finally {
      setBusy(false);
    }
  }

  const edit = (set: (value: string) => void) => (e: { target: { value: string } }) => {
    set(e.target.value);
    setDone(false);
    setError("");
  };

  return (
    <form className="account-form account-password-form" onSubmit={submit} noValidate aria-label="Change password">
      <Field label="Current password">
        <span className="password-input"><input
          type={revealed.current ? "text" : "password"}
          autoComplete="current-password"
          value={current}
          disabled={busy}
          onChange={edit(setCurrent)}
        />
        <button type="button" className="password-toggle" disabled={busy} aria-label={`${revealed.current ? "Hide" : "Show"} current password`} aria-pressed={revealed.current} onClick={() => setRevealed(value => ({...value, current: !value.current}))}>{revealed.current ? <EyeOff size={18}/> : <Eye size={18}/>}</button></span>
      </Field>
      <Field label="New password" hint="Use at least 8 characters.">
        <span className="password-input"><input
          type={revealed.next ? "text" : "password"}
          autoComplete="new-password"
          maxLength={PASSWORD_MAX}
          value={next}
          disabled={busy}
          onChange={edit(setNext)}
        />
        <button type="button" className="password-toggle" disabled={busy} aria-label={`${revealed.next ? "Hide" : "Show"} new password`} aria-pressed={revealed.next} onClick={() => setRevealed(value => ({...value, next: !value.next}))}>{revealed.next ? <EyeOff size={18}/> : <Eye size={18}/>}</button></span>
      </Field>
      <Field label="Confirm new password">
        <span className="password-input"><input
          type={revealed.confirm ? "text" : "password"}
          autoComplete="new-password"
          maxLength={PASSWORD_MAX}
          value={confirm}
          disabled={busy}
          onChange={edit(setConfirm)}
        />
        <button type="button" className="password-toggle" disabled={busy} aria-label={`${revealed.confirm ? "Hide" : "Show"} confirm new password`} aria-pressed={revealed.confirm} onClick={() => setRevealed(value => ({...value, confirm: !value.confirm}))}>{revealed.confirm ? <EyeOff size={18}/> : <Eye size={18}/>}</button></span>
      </Field>
      <ErrorBox text={error} />
      {done && (
        <p className="account-status" role="status">
          Password updated.
        </p>
      )}
      <Button type="submit" variant="outline small" disabled={busy}>
        {busy ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
