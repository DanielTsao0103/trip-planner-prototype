/** Shared form and save limits. Text lengths match the browser's maxLength units. */
export const TEXT_LIMITS = {
  title: 100,
  destination: 220,
  eventName: 100,
  location: 220,
  notes: 2200,
  expense: 130,
  todo: 220,
  preferencePlaces: 1100,
  name: 90,
  email: 280,
  invitations: 5600,
} as const;
export const MAX_DESTINATIONS = 20;
export const MAX_INVITATIONS = 20;
export const MONEY_LIMITS = { budget: 99999999, expense: 9999999 } as const;

/** Validate without silently shortening someone's existing saved text. */
export function textError(
  value: string,
  label: string,
  max: number,
  required = false,
): string {
  if (required && !value.trim()) return `Enter ${label.toLowerCase()}.`;
  return value.length > max
    ? `${label} must be ${max.toLocaleString("en-US")} characters or fewer.`
    : "";
}

export function emailError(value: string): string {
  return (
    textError(value, "Email", TEXT_LIMITS.email, true) ||
    (/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(value.trim())
      ? ""
      : "Enter a valid email address.")
  );
}

export function invitationsError(value: string): string {
  const problem = textError(value, "Invitations", TEXT_LIMITS.invitations);
  if (problem) return problem;
  const emails = value
    .split(/[,\n]+/)
    .map((email) => email.trim())
    .filter(Boolean);
  if (emails.length > MAX_INVITATIONS)
    return `Invite up to ${MAX_INVITATIONS} people at a time.`;
  return emails.some((email) => emailError(email))
    ? "Use valid email addresses of 280 characters or fewer, separated by commas."
    : "";
}

/** Check the original decimal string before conversion, so fractions aren't rounded away. */
export function moneyError(
  value: string,
  maxCents: number,
  allowZero = false,
): string {
  if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(value.trim()))
    return "Enter an amount with no more than 2 decimal places (no letters or exponents).";
  const cents = Math.round(Number(value) * 100);
  if (
    !Number.isSafeInteger(cents) ||
    cents < (allowZero ? 0 : 1) ||
    cents > maxCents
  )
    return `Enter an amount from $${allowZero ? "0.00" : "0.01"} to $${(maxCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}.`;
  return "";
}
