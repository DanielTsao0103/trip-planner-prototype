import type { Expense, RepaymentEntry } from "./domain.ts";

/** Corrections change the current repayment state without erasing the original marker. */
export function repaymentPaid(expense: Expense, debtor: string): boolean {
  const history = expense.repaymentHistory ?? [];
  for (let index = history.length - 1; index >= 0; index--)
    if (history[index].debtor === debtor) return history[index].status === "paid";
  return expense.settled.includes(debtor);
}

/** Append one transition; the database repeats authorization and append-only checks. */
export function recordRepayment(
  expense: Expense, debtor: string, actor: string, status: RepaymentEntry["status"], reason = "", recordedAt?: string,
): void {
  if (expense.payer !== actor || debtor === actor || !(expense.shares[debtor] > 0))
    throw new Error("Only the payer can update this repayment.");
  if (repaymentPaid(expense, debtor) === (status === "paid"))
    throw new Error("This repayment changed. Close this dialog and check its current status.");
  if (status === "unpaid" && (!reason.trim() || reason.trim().length > 220))
    throw new Error("Enter a reason for this correction (up to 220 characters).");
  if ((expense.repaymentHistory?.length ?? 0) >= 1000)
    throw new Error("This expense has reached its history limit. Contact the trip owner.");
  expense.repaymentHistory ??= [];
  expense.repaymentHistory.push({id:crypto.randomUUID(),debtor,status,reason:reason.trim(),actor,...(recordedAt ? {recordedAt} : {})});
  if (!expense.settled.includes(debtor)) expense.settled.push(debtor);
}
