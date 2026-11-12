import { useEffect, useRef, useState, type FormEvent } from "react";
import { useApp } from "./state";
import { Badge, Button, Empty, ErrorBox, Field, PageHead } from "./ui";
import { adminEmailError, normalizeAdminEmail, type AdminEntry } from "./admin";
import { addAdminEmail, checkIsAdmin, listAdminEntries, rememberAdmin, removeAdminEmail } from "./admin-access";
import { TEXT_LIMITS } from "./limits";
import "./admin-page.css";

const dateText = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** Admin hub. Only Google-verified accounts on the admin list get past the database check. */
export function AdminPage() {
  const { user, accountInfo, go } = useApp();
  const { cloud, email: accountEmail } = accountInfo;
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking");

  useEffect(() => {
    if (!cloud || !user?.id) {
      setAccess("denied");
      return;
    }
    let active = true;
    setAccess("checking");
    // Ask the database every time the page opens, so removed admins lose access without signing out.
    void checkIsAdmin()
      .catch(() => false)
      .then((allowed) => {
        rememberAdmin(user.id, allowed);
        if (active) setAccess(allowed ? "allowed" : "denied");
      });
    return () => {
      active = false;
    };
  }, [cloud, user?.id]);

  if (access === "denied")
    return (
      <Empty
        title="You do not have access to this page."
        body="Admin access is limited to approved Google accounts."
        action={<Button onClick={() => go(19)}>Back to account</Button>}
      />
    );

  return (
    <div className="account-page admin-page">
      <PageHead title="Admin" description="Manage who can open this page." />
      {access === "checking" ? (
        <p className="account-note" role="status">
          Checking your access…
        </p>
      ) : (
        <AccessList ownEmail={normalizeAdminEmail(accountEmail || "")} />
      )}
    </div>
  );
}

function AccessList({ ownEmail }: { ownEmail: string }) {
  const [entries, setEntries] = useState<AdminEntry[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [confirming, setConfirming] = useState("");
  const statusRef = useRef<HTMLParagraphElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);

  async function load() {
    setLoadError("");
    try {
      setEntries(await listAdminEntries());
    } catch (failure) {
      setLoadError(failure instanceof Error ? failure.message : "Could not load the admin list.");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  // Move focus to the two-step confirmation so keyboard users land on a safe choice.
  useEffect(() => {
    if (confirming) keepRef.current?.focus();
  }, [confirming]);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const problem = adminEmailError(draft, (entries ?? []).map((entry) => entry.email));
    if (problem) {
      setError(problem);
      setStatus("");
      return;
    }
    const email = normalizeAdminEmail(draft);
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await addAdminEmail(email);
      setDraft("");
      setStatus(`${email} can now open the Admin page.`);
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not add that email.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(email: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await removeAdminEmail(email);
      setConfirming("");
      setStatus(`${email} was removed.`);
      await load();
      // The removed row held focus, so hand it to the confirmation message.
      requestAnimationFrame(() => statusRef.current?.focus());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not remove that email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card account-section" aria-labelledby="admin-access">
      <h2 id="admin-access">Admin access</h2>
      <p className="account-note">
        These emails can open this page. Each person must sign in with Google using the same email.
      </p>

      {loadError ? (
        <div className="admin-load-error">
          <ErrorBox text={loadError} />
          <Button variant="outline small" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : entries === null ? (
        <p className="account-note" role="status">
          Loading the admin list…
        </p>
      ) : (
        <ul className="admin-list" aria-label="Emails with admin access">
          {entries.map((entry) => {
            const own = entry.email === ownEmail;
            const asking = confirming === entry.email;
            return (
              <li
                key={entry.email}
                className="admin-row"
                onKeyDown={(event) => {
                  if (event.key === "Escape" && asking) setConfirming("");
                }}
              >
                <div className="admin-row-info">
                  <span className="admin-email">{entry.email}</span>
                  <small>Added {dateText(entry.addedAt)}</small>
                </div>
                {own ? (
                  <Badge>You</Badge>
                ) : asking ? (
                  <div className="admin-row-actions" role="group" aria-label={`Remove ${entry.email}?`}>
                    <Button variant="text danger small" disabled={busy} onClick={() => void remove(entry.email)}>
                      {busy ? "Removing…" : "Yes, remove"}
                    </Button>
                    <Button variant="outline small" disabled={busy} onClick={() => setConfirming("")} ref={keepRef}>
                      Keep
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="text danger small"
                    aria-label={`Remove ${entry.email}`}
                    disabled={busy}
                    onClick={() => {
                      setError("");
                      setStatus("");
                      setConfirming(entry.email);
                    }}
                  >
                    Remove
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <form className="account-form admin-add-form" onSubmit={add} noValidate>
        <Field label="Add an email" hint="Use the Google account email they sign in with.">
          <input
            type="email"
            autoComplete="off"
            maxLength={TEXT_LIMITS.email}
            value={draft}
            disabled={busy}
            onChange={(event) => {
              setDraft(event.target.value);
              setError("");
              setStatus("");
            }}
          />
        </Field>
        <ErrorBox text={error} />
        <p className="account-status" role="status" tabIndex={-1} ref={statusRef}>
          {status}
        </p>
        <Button type="submit" variant="outline small" disabled={busy || entries === null}>
          {busy && !confirming ? "Adding…" : "Add email"}
        </Button>
      </form>
    </section>
  );
}
