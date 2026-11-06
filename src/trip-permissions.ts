import { canEdit, EVENT_PERMISSION_MESSAGE, isOwner, member, type Trip } from "./domain.ts";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const except = (values: object, key: string) =>
  Object.fromEntries(Object.entries(values).filter(([id]) => id !== key));

/** Check the previous and proposed versions: deleting or moving a row needs
 * permission on its original day/payer as well as on its destination. */
function changedRowsAllowed<T extends { id: string }>(
  before: T[], after: T[], allowed: (row: T) => boolean,
): boolean {
  const old = new Map(before.map(row => [row.id, row]));
  const next = new Map(after.map(row => [row.id, row]));
  return [...new Set([...old.keys(), ...next.keys()])].every(id => {
    const a = old.get(id), b = next.get(id);
    return same(a, b) || ((!a || allowed(a)) && (!b || allowed(b)));
  });
}

/** Screen optimistic writes and recovered drafts against the current membership.
 * The database independently verifies the same restrictions for every RPC. */
export function sharedChangeError(before: Trip, after: Trip, actor: string | null): string {
  if (isOwner(before, actor)) return "";
  const traveler = member(before, actor);
  if (!traveler) {
    // A fictional invitee can accept or decline their own local invitation.
    const invite = before.persistence !== "account" && before.members.find(m => m.id === actor && m.status === "pending");
    if (invite) {
      const accepted = before.members.map(m => m === invite ? { ...m, status: "accepted" } : m);
      const declined = before.members.filter(m => m !== invite);
      if ([accepted, declined].some(members => same({ ...before, members }, after))) return "";
    }
    return "You no longer have access to this trip.";
  }
  const dayAllowed = (row: { date: string }) => canEdit(before, actor, row.date);
  if (!changedRowsAllowed(before.events, after.events, dayAllowed)) return EVENT_PERMISSION_MESSAGE;
  if (!changedRowsAllowed(before.todos, after.todos, dayAllowed))
    return "You do not have permission to change this reminder.";
  if (!changedRowsAllowed(before.expenses, after.expenses, row => row.payer === traveler.id))
    return "Only the payer can change this expense.";
  if (!same(except(before.prefs, traveler.id), except(after.prefs, traveler.id)) ||
      !same(except(before.individual, traveler.id), except(after.individual, traveler.id)) ||
      (before.budgetMode !== "individual" && !same(before.individual, after.individual)) ||
      (traveler.role !== "Editor" && !same(before.dismissed, after.dismissed)))
    return "You do not have permission to make this change.";
  const protectedFields = (trip: Trip) => {
    const { events, todos, expenses, prefs, individual, dismissed, revision, ...protectedValues } = trip;
    return protectedValues;
  };
  return same(protectedFields(before), protectedFields(after)) ? "" : "Only the trip owner can change trip settings or permissions.";
}
