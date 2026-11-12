import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { emailError, invitationsError, TEXT_LIMITS } from "./limits";
import { getSupabase } from "./supabase";
import type { User } from "./domain";

export const splitEmails = (text: string) => [
  ...new Set(
    text
      .toLowerCase()
      .split(/[,;\s]+/)
      .filter(Boolean),
  ),
];

export function useRecipients() {
  const [emails, setEmails] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [validationAttempt, setValidationAttempt] = useState(0);
  function commit(value = draft): string[] | null {
    const next = [...new Set([...emails, ...splitEmails(value)])];
    const problem = invitationsError(next.join(","));
    setError(problem);
    setValidationAttempt((attempt) => attempt + 1);
    if (problem) return null;
    setEmails(next);
    setDraft("");
    return next;
  }
  return { emails, setEmails, draft, setDraft, error, setError, validationAttempt, commit };
}

export function RecipientField({
  recipients: r,
  live,
  users,
  label = "Email addresses",
  disabled = false,
}: {
  recipients: ReturnType<typeof useRecipients>;
  live: boolean;
  users: User[];
  label?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const errorElement = useRef<HTMLParagraphElement>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [lookupError, setLookupError] = useState(false);
  useEffect(() => {
    if (!r.error) return;
    const error = errorElement.current;
    const actions = error?.closest("form")?.querySelector<HTMLElement>("[data-fixed-actions]");
    if (!error || !actions || !["fixed", "sticky"].includes(getComputedStyle(actions).position)) return;
    // Enter can validate without changing focus, so the form's focus handler will not run.
    if (error.getBoundingClientRect().bottom > actions.getBoundingClientRect().top - 12)
      error.scrollIntoView({ block: "center", inline: "nearest" });
  }, [r.error, r.validationAttempt]);
  const missing = r.emails.filter((email) => !(email in names)).join(",");
  useEffect(() => {
    if (!live || !missing) return;
    let active = true;
    const emails = missing.split(",");
    void (async () => {
      const { data, error } = await getSupabase().rpc("resolve_trip_emails", {
        p_emails: emails,
      });
      if (!active) return;
      setLookupError(!!error);
      if (!error)
        setNames((previous) => ({
          ...previous,
          ...Object.fromEntries(
            emails.map((email) => [email, data?.[email] || ""]),
          ),
        }));
    })().catch(() => {
      if (active) setLookupError(true);
    });
    return () => {
      active = false;
    };
  }, [missing, live]);
  return (
    <div className="invite-field">
      <label htmlFor={id}>{label}</label>
      <div
        className="recipient-box"
        onClick={(e) => {
          if (e.target === e.currentTarget)
            document.getElementById(id)?.focus();
        }}
      >
        {r.emails.map((email) => {
          const name = live
            ? names[email]
            : users.find((u) => u.email.toLowerCase() === email)?.name;
          return (
            <span className="recipient-chip" key={email} title={email}>
              <span>{name || email}</span>
              <button
                type="button"
                aria-label={`Remove ${email}`}
                disabled={disabled}
                onClick={() => {
                  r.setEmails(r.emails.filter((e) => e !== email));
                  r.setError("");
                }}
              >
                <X size={14} />
              </button>
            </span>
          );
        })}
        <input
          id={id}
          type="text"
          inputMode="email"
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          value={r.draft}
          maxLength={TEXT_LIMITS.invitations}
          aria-describedby={[id + "-hint", r.error ? id + "-error" : ""].filter(Boolean).join(" ")}
          aria-invalid={!!r.error}
          placeholder={
            r.emails.length ? "Add email" : "Add email addresses"
          }
          onChange={(e) => {
            r.setDraft(e.target.value);
            r.setError("");
          }}
          onBlur={(e) => {
            if (
              r.draft.trim() &&
              !(e.relatedTarget instanceof HTMLButtonElement)
            )
              r.commit();
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (
              ["Enter", ",", ";", "Tab", " "].includes(e.key) &&
              r.draft.trim()
            ) {
              if (e.key !== "Tab") e.preventDefault();
              r.commit();
            } else if (e.key === "Backspace" && !r.draft)
              r.setEmails(r.emails.slice(0, -1));
          }}
          onPaste={(e) => {
            const input = e.currentTarget;
            const value =
              r.draft.slice(0, input.selectionStart ?? 0) +
              e.clipboardData.getData("text") +
              r.draft.slice(input.selectionEnd ?? r.draft.length);
            if (/[,;\s]/.test(value.trim()) || !emailError(value)) {
              e.preventDefault();
              if (!r.commit(value)) r.setDraft(value);
            }
          }}
        />
      </div>
      <small id={id + "-hint"}>
        {live
          ? "Press Enter after each address, or paste a list of up to 20."
          : "Press Enter or paste a list. Demo invitations stay in this browser."}
      </small>
      {r.error && (
        <p ref={errorElement} id={id + "-error"} className="form-error" role="alert">
          {r.error}
        </p>
      )}
      {lookupError && (
        <small role="status">
          Names are unavailable. You can still invite by email.
        </small>
      )}
    </div>
  );
}
