/** Implementation status: Account budgets, expenses, splits, and repayment markers save through updateTrip to Supabase. Sample trips stay local. Receipt scans/Gmail/bank actions remain fixtures; no messages or money are sent. See ../IMPLEMENTATION_STATUS.md. */
import { TEXT_LIMITS, MONEY_LIMITS, textError, moneyError } from "./limits.ts";
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  SlidersHorizontal,
  ArrowUpRight,
  Camera,
  Check,
  ChevronRight,
  ChevronDown,
  X,
  Mail,
  Plus,
  Receipt,
  Wallet,
  Info,
  Send,
  ScanLine,
} from "lucide-react";
import { useApp } from "./state";
import { dateText } from "./domain";
import { Badge, Button, Empty, ErrorBox, Field, Modal, PageHead } from "./ui";
import { repaymentPaid, recordRepayment } from "./repayments";
import { CurrencyConverter } from "./currency-converter";
import { useChartColors } from "./theme";
import {
  money,
  spent,
  isOwner,
  member,
  uid,
  splitCents,
  type Expense,
} from "./domain";
export const CATEGORIES = ["Stay", "Food", "Transport", "Activities", "Other"];

/** Keep transient feedback beside the relevant Budget section without covering rows. */
function BudgetFeedback({
  message,
  dismiss,
}: {
  message: string;
  dismiss: () => void;
}) {
  return (
    <div className="budget-feedback" role="status" tabIndex={-1}>
      <Info size={18} aria-hidden="true" />
      <span>{message}</span>
      <button aria-label="Dismiss message" onClick={dismiss}>
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

export function Budget() {
  const {
    trip: t,
    s,
    user,
    open,
    updateTrip,
    toast,
    message,
    messageScope,
    dismissMessage,
    overlay,
  } = useApp();
  const [tab, setTab] = useState("Expenses"),
    [filter, setFilter] = useState("All");
  const [showBreakdown, setShowBreakdown] = useState(
    () => window.innerWidth > 1100,
  );
  const [showRepaymentBreakdown, setShowRepaymentBreakdown] = useState(false);
  const breakdownOpen =
    tab === "Expenses" ? showBreakdown : showRepaymentBreakdown;
  const [converterExpanded, setConverterExpanded] = useState(false);
  const [converterJump, setConverterJump] = useState(0);
  const [repaymentView, setRepaymentView] = useState("Owed to me");
  const [savedExpense, setSavedExpense] = useState("");
  useEffect(() => {
    if (!savedExpense) return;
    if (overlay) { setSavedExpense(""); return; }
    const frame = requestAnimationFrame(() => {
      // Sample tools can be far below the new row. Reveal the result after the
      // modal restores its opener, without changing account-save feedback timing.
      const result = document.getElementById(`expense-${savedExpense}`)
        || document.querySelector<HTMLElement>(".ledger-card .budget-feedback");
      result?.focus({ preventScroll: true });
      result?.scrollIntoView({ block: "center", inline: "nearest" });
      setSavedExpense("");
    });
    return () => cancelAnimationFrame(frame);
  }, [savedExpense, overlay]);
  const openExpense = (data: { id?: string; scan?: boolean } = {}) => open("expense", {
    ...data,
    onSaved: (expense: Expense) => {
      setTab("Expenses");
      setFilter(current => current === "All" || current === expense.category ? current : "All");
      setSavedExpense(expense.id);
    },
  });
  const COLORS = useChartColors();
  if (!t) return null;
  const travelerId = member(t, s.userId)!.id;
  const individual = t.budgetMode === "individual",
    total = spent(t, individual ? travelerId : undefined),
    budget = individual ? (t.individual[travelerId] ?? null) : t.budget,
    remaining = budget !== null ? budget - total : null;
  const amounts = CATEGORIES.map((cat) =>
    t.expenses
      .filter((e) => e.category === cat)
      .reduce(
        (sum, e) => sum + (individual ? e.shares[travelerId] || 0 : e.amount),
        0,
      ),
  );
  const chartValues = [...amounts, Math.max(0, remaining || 0)],
    denominator = chartValues.reduce((a, b) => a + b, 0) || 1;
  let angle = 0;
  const gradient = chartValues
    .map((value, i) => {
      const from = angle;
      angle += (value / denominator) * 360;
      return `${COLORS[i]} ${from}deg ${angle}deg`;
    })
    .join(",");
  const debts = t.expenses
    .flatMap((e) =>
      Object.entries(e.shares)
        .filter(([id, amount]) => id !== e.payer && amount > 0)
        .map(([debtor, amount]) => ({ expense: e, debtor, amount })),
    )
    .filter(
      (d) =>
        isOwner(t, s.userId) ||
        d.debtor === travelerId ||
        d.expense.payer === travelerId,
    );
  const repaymentGroups = new Map<
    string,
    { debtor: string; payer: string; items: typeof debts; unpaid: number }
  >();
  for (const debt of debts) {
    if (repaymentView === "Owed to me" && debt.expense.payer !== travelerId)
      continue;
    if (repaymentView === "I owe" && debt.debtor !== travelerId) continue;
    const key = `${debt.debtor}:${debt.expense.payer}`;
    const group = repaymentGroups.get(key) || {
      debtor: debt.debtor,
      payer: debt.expense.payer,
      items: [],
      unpaid: 0,
    };
    group.items.push(debt);
    if (!repaymentPaid(debt.expense, debt.debtor))
      group.unpaid += debt.amount;
    repaymentGroups.set(key, group);
  }
  const scopedExpenses = t.expenses.filter(
    (e) => !individual || e.shares[travelerId] || e.payer === travelerId,
  );
  const visibleExpenses = scopedExpenses.filter(
    (e) => filter === "All" || e.category === filter,
  );
  const name = (id: string) =>
    t.members.find((m) => m.id === id)?.name ||
    s.users.find((u) => u.id === id)?.name ||
    "Former traveler";
  const gmail = () => {
    if (!user?.connections.Gmail?.length) {
      open("message", {
        title: "Gmail isn’t connected",
        body: "Automatic sample receipt matching needs separate Gmail consent during account setup. Manual expenses and sample receipt scans still work.",
      });
      return;
    }
    open("gmail");
  };
  const transaction = () => {
    if (t.expenses.some((e) => e.id === "demo-transaction")) {
      toast("This sample transaction is already logged.", "budget");
      requestAnimationFrame(() => document.querySelector(".budget-feedback")?.scrollIntoView({block:"center"}));
      return;
    }
    updateTrip((t) =>
      t.expenses.push({
        id: "demo-transaction",
        purpose: "Sample coffee transaction",
        amount: 650,
        category: "Food",
        payer: travelerId,
        shares: { [travelerId]: 650 },
        date: s.date,
        source: "Demo transaction",
        settled: [],
      }),
    );
    toast("Sample transaction added.", "budget");
    open("transaction", { onResolved: () => {
      // A kept sample has a row; Undo falls back to its visible confirmation.
      setSavedExpense("demo-transaction");
    } });
  };
  return (
    <div className="budget-page">
      <div className="budget-intro">
        <PageHead
          title="Budget"
          description={
            individual
              ? "Your share of the trip, in one place."
              : "Your shared trip budget, without the guesswork."
          }
        />
        <div className="budget-toolbar">
          <Badge tone="green">
            {individual ? "Individual budgets" : "Combined group budget"}
          </Badge>
          <button
            className="text-link currency-shortcut"
            type="button"
            onClick={() => {
              setConverterExpanded(true);
              setConverterJump((value) => value + 1);
            }}
          >
            <ArrowLeftRight size={15} aria-hidden="true" />
            USD · Convert
          </button>
          {budget !== null && (isOwner(t, s.userId) || individual) && (
            <button id="budget-settings" className="text-link" onClick={() => open("budgetSetup")}>
              Budget settings
              <SlidersHorizontal size={15} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      {budget === null && (
        <div className="info-banner">
          <Wallet size={19} />
          <span>
            {individual
              ? "Set your personal budget to track what’s left."
              : "Your trip doesn’t have a spending limit yet."}
          </span>
          {(isOwner(t, s.userId) || individual) && (
            <Button variant="small" onClick={() => open("budgetSetup")}>
              Set budget
            </Button>
          )}
        </div>
      )}
      {messageScope === "budget" && message.startsWith("Budget updated.") && !overlay && (
        <BudgetFeedback message={message} dismiss={dismissMessage} />
      )}
      <p className="budget-phone-scope">{individual ? "Your share" : "Whole group"} · USD</p>
      <div className={`budget-stats${Math.max(total, budget || 0, Math.abs(remaining || 0)) >= 1000000 ? " budget-stats-wide" : ""}`}>
        <div>
          <span>{individual ? "YOUR SHARE SPENT" : "TOTAL SPENT"}</span>
          <strong>{money(total)}</strong>
          <small>Across {scopedExpenses.length} {individual ? (scopedExpenses.length === 1 ? "expense share" : "expense shares") : (scopedExpenses.length === 1 ? "logged expense" : "logged expenses")}</small>
        </div>
        <div>
          <span>{individual ? "YOUR BUDGET" : "TRIP BUDGET"}</span>
          <strong>{budget === null ? "Not set" : money(budget)}</strong>
          <small>
            {individual ? "Personal spending limit" : "For the whole group"}
          </small>
        </div>
        <div
          className={remaining !== null && remaining < 0 ? "over-budget" : ""}
        >
          <span>
            {remaining !== null && remaining < 0 ? "OVER BUDGET" : "REMAINING"}
          </span>
          <strong>
            {remaining === null ? "—" : money(Math.abs(remaining))}
          </strong>
          <small>
            {remaining === null
              ? (isOwner(t, s.userId) || individual ? "Set a budget to see what remains." : "Ask the trip owner to set a budget.")
              : remaining < 0
                ? "Time to revisit the plan."
                : "A little room for possibility."}
          </small>
        </div>
      </div>
      <div
        className={`finance-layout ${tab === "Reimbursements" ? "repayments-view" : ""}`}
      >
        <div className="card ledger-card">
          <div className="ledger-header">
            <div className="tabs">
              <button
                className={tab === "Expenses" ? "active" : ""}
                aria-pressed={tab === "Expenses"}
                onClick={() => setTab("Expenses")}
              >
                Expense log <Badge>{scopedExpenses.length}</Badge>
              </button>
              <button
                className={tab === "Reimbursements" ? "active" : ""}
                aria-pressed={tab === "Reimbursements"}
                onClick={() => setTab("Reimbursements")}
              >
                Repayments
              </button>
            </div>
            <Button
              variant="small ledger-add"
              aria-label="Add expense"
              onClick={() => openExpense()}
            >
              <Plus size={17} aria-hidden="true" />
              <span className="ledger-add-label">Add expense</span>
              <span className="ledger-add-short" aria-hidden="true">
                Add
              </span>
            </Button>
          </div>
          {messageScope === "budget" && message && !message.startsWith("Budget updated.") && !overlay && (
            <BudgetFeedback message={message} dismiss={dismissMessage} />
          )}
          {tab === "Expenses" ? (
            <>
              <div className="ledger-toolbar">
                <label
                  className="ledger-filter-label"
                  htmlFor="expense-category-filter"
                >
                  Category
                </label>
                <select
                  id="expense-category-filter"
                  aria-label="Filter expense category"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  {["All", ...CATEGORIES].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                {filter !== "All" && (
                  <span className="ledger-filter-count" role="status">
                    {visibleExpenses.length} of {scopedExpenses.length} expenses
                  </span>
                )}
              </div>
              <div className="expense-list">
                {visibleExpenses.map((e) => (
                  <div className="expense-row" id={`expense-${e.id}`} tabIndex={-1} key={e.id}>
                    <span className="expense-icon">
                      <Receipt size={19} />
                    </span>
                    <div className="expense-main">
                      <strong>{e.purpose}</strong>
                      <div className="expense-meta">
                        <span>
                          {e.category} · paid by {name(e.payer).split(" ")[0]}
                        </span>
                        <time dateTime={e.date}>
                          {new Intl.DateTimeFormat("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            timeZone: "UTC",
                          }).format(new Date(`${e.date}T00:00:00Z`))}
                        </time>
                        {e.source !== "Manual" && <span>{e.source}</span>}
                      </div>
                      {Object.values(e.shares).filter((value) => value > 0)
                        .length > 1 && (
                        <details className="expense-split">
                          <summary>
                            Split among{" "}
                            {
                              Object.values(e.shares).filter(
                                (value) => value > 0,
                              ).length
                            }
                          </summary>
                          <ul>
                            {Object.entries(e.shares)
                              .filter(([, value]) => value > 0)
                              .map(([id, value]) => (
                                <li key={id}>
                                  <span>{name(id)}</span>
                                  <strong>{money(value)}</strong>
                                </li>
                              ))}
                          </ul>
                        </details>
                      )}
                    </div>
                    <div className="expense-amount">
                      <span className="expense-value">
                      <strong>
                        {money(
                          individual ? e.shares[travelerId] || 0 : e.amount,
                        )}
                      </strong>
                      {individual && <small>of {money(e.amount)}</small>}
                      </span>
                        <button
                          className="text-link"
                          onClick={() => openExpense({ id: e.id })}
                        >
                          {e.settled.length || e.payer !== travelerId ? "Details" : "Edit"}
                        </button>
                    </div>
                  </div>
                ))}
              </div>
              {!!t.expenses.length && !visibleExpenses.length && (
                <Empty
                  title="No expenses in this view."
                  body={
                    filter === "All"
                      ? "You don’t have a share in the logged expenses yet."
                      : `Nothing has been logged under ${filter.toLowerCase()} yet. Your totals still include all categories.`
                  }
                  action={
                    filter !== "All" ? (
                      <Button
                        variant="outline"
                        onClick={() => setFilter("All")}
                      >
                        Show all expenses
                      </Button>
                    ) : undefined
                  }
                />
              )}
              {!t.expenses.length && (
                <Empty
                  title="A fresh start for the budget."
                  body="Add your first expense or try a sample receipt."
                  action={
                    <Button onClick={() => openExpense()}>
                      Add an expense
                    </Button>
                  }
                />
              )}
            </>
          ) : (
            <>
              <div className="repayment-toolbar">
                <p className="repayment-overview" aria-live="polite">
                  <span>
                    {repaymentView === "Owed to me"
                      ? "Owed to you"
                      : repaymentView === "I owe"
                        ? "You owe"
                        : "Total unpaid"}
                  </span>
                  <strong>
                    {money(
                      [...repaymentGroups.values()].reduce(
                        (sum, group) => sum + group.unpaid,
                        0,
                      ),
                    )}
                  </strong>
                </p>
                <select
                  aria-label="Show repayments"
                  value={repaymentView}
                  onChange={(event) => setRepaymentView(event.target.value)}
                >
                  {["All repayments", "Owed to me", "I owe"].map((view) => (
                    <option key={view}>{view}</option>
                  ))}
                </select>
              </div>
              <div className="debt-list">
                {[...repaymentGroups.entries()].map(([key, group]) => (
                  <details className="repayment-group" key={key}>
                    <summary>
                      <span className="repayment-person">
                        <strong>
                          {group.debtor === travelerId
                            ? "You"
                            : name(group.debtor)}{" "}
                          {group.unpaid > 0
                            ? group.debtor === travelerId
                              ? "owe"
                              : "owes"
                            : "repaid"}{" "}
                          {group.payer === travelerId
                            ? "you"
                            : name(group.payer)}
                        </strong>
                        <small>
                          {group.items.length}{" "}
                          {group.items.length === 1 ? "expense" : "expenses"}
                        </small>
                      </span>
                      <strong className="repayment-total">
                        {group.unpaid > 0
                          ? `${money(group.unpaid)} unpaid`
                          : "Fully repaid"}
                      </strong>
                      <ChevronDown size={17} aria-hidden="true" />
                    </summary>
                    <div className="repayment-items">
                      {group.items.map(({ expense: e, debtor, amount }) => (
                        <div className="debt-row" key={e.id + debtor}>
                          <div>
                            <strong>{money(amount)}</strong>
                            <p>{e.purpose}</p>
                            {repaymentPaid(e, debtor) && (
                              <Badge tone="green">Completed</Badge>
                            )}
                            {(e.repaymentHistory ?? []).some(entry => entry.debtor === debtor) && (
                              <details className="repayment-history">
                                <summary>Repayment history</summary>
                                <ol>
                                  {e.repaymentHistory?.find(entry => entry.debtor === debtor)?.status === "unpaid" && <li>Earlier record: marked paid. Date was not recorded.</li>}
                                  {e.repaymentHistory?.filter(entry => entry.debtor === debtor).map(entry => <li key={entry.id}>
                                    <strong>{entry.status === "paid" ? "Marked paid" : "Corrected to unpaid"}</strong>
                                    <span>{name(entry.actor)} · {entry.recordedAt ? new Date(entry.recordedAt).toLocaleString() : "Awaiting save"}</span>
                                    {entry.reason && <p>{entry.reason}</p>}
                                  </li>)}
                                </ol>
                              </details>
                            )}
                          </div>
                          {e.payer === travelerId && (
                              <Button
                                variant="outline small"
                                onClick={() =>
                                  open("settle", { expenseId: e.id, debtor, correct: repaymentPaid(e, debtor) })
                                }
                              >
                                {repaymentPaid(e, debtor) ? "Correct repayment" : "Mark paid"}
                              </Button>
                            )}
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
              {!repaymentGroups.size && (
                <Empty
                  title={
                    repaymentView === "Owed to me"
                      ? "Nothing owed to you."
                      : repaymentView === "I owe"
                        ? "Nothing for you to repay."
                        : "All clear between friends."
                  }
                  body={
                    repaymentView === "I owe"
                      ? "When someone records a payment for you, your share will appear here."
                      : "When you log a payment for someone else, their reimbursement will appear here."
                  }
                  action={
                    repaymentView !== "All repayments" && debts.length > 0 ? (
                      <Button
                        variant="outline"
                        onClick={() => setRepaymentView("All repayments")}
                      >
                        Show all repayments
                      </Button>
                    ) : undefined
                  }
                />
              )}
            </>
          )}
          {tab === "Expenses" && filter === "All" && (
            <details className="budget-samples">
              <summary>Sample tools</summary>
              <div className="ledger-tools">
                <button onClick={() => openExpense({ scan: true })}>
                  <Camera size={16} />
                  Try sample receipt
                </button>
                <button onClick={gmail}>
                  <Mail size={16} />
                  Match sample Gmail receipt
                </button>
                <button onClick={transaction}>
                  <ArrowDownLeft size={16} />
                  Simulate transaction
                </button>
              </div>
            </details>
          )}
        </div>
        <aside className="card chart-card">
          <h2 className="breakdown-heading">
            <button
              type="button"
              aria-expanded={breakdownOpen}
              aria-controls="spending-breakdown"
              onClick={() =>
                tab === "Expenses"
                  ? setShowBreakdown((value) => !value)
                  : setShowRepaymentBreakdown((value) => !value)
              }
            >
              Spending breakdown
              <ChevronDown size={17} aria-hidden="true" />
            </button>
          </h2>
          <div id="spending-breakdown" hidden={!breakdownOpen}>
            <div
              className="donut"
              role="img"
              aria-label={`Spending chart. ${CATEGORIES.map((c, i) => `${c}: ${money(amounts[i])}`).join(", ")}. Remaining ${remaining === null ? "not set" : money(remaining)}`}
              style={{ background: `conic-gradient(${gradient})` }}
            >
              <div>
                <small>{individual ? "YOUR SHARE" : "SPENT SO FAR"}</small>
                <strong style={money(total).length > 8 ? {fontSize: Math.max(16, Math.floor(240 / money(total).length))} : undefined}>{money(total)}</strong>
                <span>
                  of {budget === null ? "unset budget" : money(budget)}
                </span>
              </div>
            </div>
            <div className="chart-legend">
              {[
                ...CATEGORIES,
                ...(remaining !== null && remaining < 0 ? [] : ["Remaining"]),
              ].map((c, i) => (
                <div key={c}>
                  <span
                    className="legend-color"
                    style={{ background: COLORS[i] }}
                  />
                  <span>{c}</span>
                  <strong>
                    {i === 5
                      ? remaining === null
                        ? "—"
                        : money(Math.abs(remaining))
                      : money(chartValues[i])}
                  </strong>
                </div>
              ))}
            </div>
            {remaining !== null && remaining < 0 && (
              <p className="breakdown-overage">
                Over budget <strong>{money(Math.abs(remaining))}</strong>
              </p>
            )}
            <p className="fine-print">
              Repayments settle what people owe. They don’t count as new
              spending.
            </p>
          </div>
        </aside>
      </div>
      {individual && isOwner(t, s.userId) && (
        <div className="card individual-summary">
          <h3>Group overview</h3>
          <div className="individual-grid">
            {t.members
              .filter((m) => m.status === "accepted")
              .map((m) => (
                <div key={m.id}>
                  <strong>{m.name}</strong>
                  <span>{money(spent(t, m.id))} allocated</span>
                  <small>
                    Budget{" "}
                    {t.individual[m.id] === undefined
                      ? "not set"
                      : money(t.individual[m.id])}
                  </small>
                </div>
              ))}
          </div>
        </div>
      )}
      <CurrencyConverter
        expanded={converterExpanded}
        onExpandedChange={setConverterExpanded}
        jumpRequest={converterJump}
      />
    </div>
  );
}
export function BudgetSetup() {
  const { trip: t, s, updateTrip, close, toast } = useApp();
  if (!t) return null;
  const travelerId = member(t, s.userId)!.id;
  const owner = isOwner(t, s.userId),
    [mode, setMode] = useState(t.budgetMode),
    [amount, setAmount] = useState(
      String(
        ((t.budgetMode === "group" ? t.budget : t.individual[travelerId]) ||
          0) / 100,
      ),
    ),
    [error, setError] = useState("");
  const [amountError, setAmountError] = useState("");
  return (
    <Modal title="A budget that fits">
      <form
        className="budget-setup-form"
        onSubmit={(e) => {
          e.preventDefault();
          const problem = moneyError(amount, MONEY_LIMITS.budget);
          if (problem) {
            setAmountError(problem);
            return;
          }
          if (mode === "group" && !owner) {
            setError("Only the Owner can set the group budget.");
            return;
          }
          updateTrip((t) => {
            if (owner) t.budgetMode = mode;
            if (mode === "group") t.budget = Math.round(Number(amount) * 100);
            else t.individual[travelerId] = Math.round(Number(amount) * 100);
          });
          toast("Budget updated. Existing expenses and shares are unchanged.", "budget");
          close();
          // The initial Set budget opener disappears after the first save.
          requestAnimationFrame(() => document.getElementById("budget-settings")?.focus());
        }}
      >
        {owner && (
          <Field label="How should we track spending?">
            <select
              value={mode}
              onChange={(e) => {
                const value = e.target.value as "group" | "individual";
                setMode(value);
                setAmountError("");
                setError("");
                setAmount(
                  String(
                    ((value === "group"
                      ? t.budget
                      : t.individual[travelerId]) || 0) / 100,
                  ),
                );
              }}
            >
              <option value="group">One combined group budget</option>
              <option value="individual">
                Individual budgets for each traveler
              </option>
            </select>
          </Field>
        )}
        <div className="expense-validated-field">
        <Field
          label={
            mode === "group"
              ? "Group budget (USD)"
              : "Your individual budget (USD)"
          }
        >
          <input
            required
            type="number"
            min="0.01"
            max={MONEY_LIMITS.budget / 100}
            step="0.01"
            value={amount}
            aria-invalid={!!amountError}
            aria-describedby={amountError ? "budget-amount-error" : undefined}
            onInvalid={(event) => {
              event.preventDefault();
              setAmountError(amount.trim() ? moneyError(amount, MONEY_LIMITS.budget) : "Enter your budget.");
              event.currentTarget.focus();
            }}
            onChange={(e) => { setAmount(e.target.value); setAmountError(""); }}
          />
        </Field>
        {amountError && <span id="budget-amount-error" className="error expense-field-error" role="alert">{amountError}</span>}
        </div>
        {mode === "individual" && (
          <p className="note">
            Each person sets their own budget. The Owner sees per-person totals.
            Your expense shares count toward your budget, even when someone else
            paid.
          </p>
        )}
        <ErrorBox text={error} />
        <Button type="submit" variant="full">
          Save budget
        </Button>
      </form>
    </Modal>
  );
}
export function ExpenseForm() {
  const { trip: t, s, overlay, updateTrip, close, open, toast } = useApp();
  if (!t) return null;
  const travelerId = member(t, s.userId)!.id;
  const original = t.expenses.find((e) => e.id === overlay?.data?.id);
  const [purpose, setPurpose] = useState(original?.purpose || ""),
    [amount, setAmount] = useState(
      original ? String(original.amount / 100) : "",
    ),
    [category, setCategory] = useState(original?.category || "Food"),
    [shared, setShared] = useState(
      original ? Object.keys(original.shares).length > 1 : false,
    ),
    [people, setPeople] = useState(
      original
        ? Object.keys(original.shares)
        : t.members.filter((m) => m.status === "accepted").map((m) => m.id),
    ),
    [scan, setScan] = useState(overlay?.data?.scan ? "ready" : ""),
    [error, setError] = useState(""),
    [source, setSource] = useState(original?.source || "Manual");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const purposeRef = useRef<HTMLTextAreaElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const purposeProblem = textError(purpose, "Expense description", TEXT_LIMITS.expense, true);
  const amountProblem = amount.trim()
    ? moneyError(amount, MONEY_LIMITS.expense)
    : "Enter the amount you paid.";
  // Focus the first invalid control and reveal its persistent explanation as one field.
  const revealInvalidField = (control: HTMLTextAreaElement | HTMLInputElement | null) => {
    requestAnimationFrame(() => {
      control?.focus({ preventScroll: true });
      control?.closest(".expense-validated-field")?.scrollIntoView({ block: "nearest" });
    });
  };
  // Integer cents keep the visible split identical to the saved allocation.
  const previewAmountError = moneyError(amount, MONEY_LIMITS.expense);
  const previewCents = previewAmountError
    ? 0
    : Math.round(Number(amount) * 100);
  const previewShares = splitCents(previewCents, people);
  const hasRounding =
    shared && people.length > 1 && previewCents % people.length !== 0;
  const scanReceipt = (fail = false) => {
    setScan("loading");
    setTimeout(() => {
      if (fail) {
        setScan("failed");
        return;
      }
      setPurpose("Sample café receipt");
      setAmount("28.00");
      setCategory("Food");
      setSource("Demo receipt scan");
      setScan("review");
    }, 650);
  };
  const recordedShares = original ? Object.entries(original.shares).filter(([, value]) => value > 0) : [];
  if (original && (original.settled.length || original.payer !== travelerId)) return <Modal title="Expense details">
    <div className="expense-history">
      <p className="note">{original.settled.length ? "This expense has repayment history and cannot be changed." : `Only the payer, ${t.members.find(person => person.id === original.payer)?.name || "the former traveler"}, can edit this expense.`}</p>
      <h3>{original.purpose}</h3>
      <dl className="expense-history-facts">
        <div><dt>Total paid</dt><dd>{money(original.amount)}</dd></div>
        <div><dt>Paid by</dt><dd>{t.members.find((person) => person.id === original.payer)?.name || "Former traveler"}</dd></div>
        <div><dt>Category</dt><dd>{original.category}</dd></div>
        <div><dt>Date</dt><dd>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${original.date}T00:00:00Z`))}</dd></div>
      </dl>
      <details className="expense-history-splits"><summary>Expense shares <span>{recordedShares.length} {recordedShares.length === 1 ? "traveler" : "travelers"}</span></summary>
      <ul className="expense-history-shares">{recordedShares.map(([id, value]) => <li key={id}>
        <span>{t.members.find((person) => person.id === id)?.name || "Former traveler"}
          {id !== original.payer && <small>{repaymentPaid(original, id) ? "Repayment completed" : "Repayment unpaid"}</small>}</span>
        <strong>{money(value)}</strong>
      </li>)}</ul></details>
    </div>
    <Button variant="full" onClick={close}>Done</Button>
  </Modal>;
  if (confirmDelete && original) return <Modal title="Delete this expense?">
    <p><strong>{original.purpose}</strong> · {money(original.amount)}</p>
    <p>This removes the expense and its unpaid shares. This cannot be undone.</p>
    <div className="form-actions"><Button variant="outline" onClick={() => setConfirmDelete(false)}>Keep expense</Button><Button variant="danger" onClick={() => {
      // Recheck settlement history at the destructive action, not only on opening.
      if (original.settled.length) { setConfirmDelete(false); setError("Completed repayments must stay in the history. Add an adjustment expense instead."); return; }
      updateTrip(trip => { trip.expenses = trip.expenses.filter(expense => expense.id !== original.id); });
      toast("Expense deleted. Your totals are up to date.", "budget");
      close();
    }}>Delete expense</Button></div>
  </Modal>;
  return (
    <Modal title={original ? "Edit an expense" : "Add an expense"}>
      <form
        className="expense-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (original && original.payer !== travelerId) {
            setError("Only the payer can edit this expense.");
            return;
          }
          setSubmitted(true);
          setError("");
          if (purposeProblem || amountProblem) {
            revealInvalidField(purposeProblem ? purposeRef.current : amountRef.current);
            return;
          }
          const cents = Math.round(Number(amount) * 100);
          if (!Number.isFinite(cents) || cents <= 0) {
            setError("Enter an amount greater than zero.");
            return;
          }
          if (shared && !people.length) {
            setError("Choose at least one participant.");
            return;
          }
          if (original?.settled.length) {
            setError(
              "This expense has repayment history. Keep the original record and add a separate adjustment expense.",
            );
            return;
          }
          const record: Expense = {
            id: original?.id || uid(),
            purpose: purpose.trim(),
            amount: cents,
            category,
            payer: travelerId,
            shares: splitCents(cents, shared ? people : [travelerId]),
            date: original?.date || s.date,
            source,
            settled: [],
          };
          updateTrip((t) => {
            const i = t.expenses.findIndex((x) => x.id === record.id);
            if (i >= 0) t.expenses[i] = record;
            else t.expenses.unshift(record);
          });
          // Saving a demo split should not open a pretend-message dialog.
          toast(
            shared && t.persistence !== "account"
              ? "Expense recorded. Shares updated; no message sent."
              : "Expense recorded. Your totals are up to date.",
            "budget",
          );
          close();
          overlay?.data?.onSaved?.(record);
        }}
      >
        <div className="expense-fields">
          {original && original.payer === travelerId && original.settled.length > 0 && <p className="note">This expense has completed repayments and cannot be deleted. Add an adjustment expense to preserve the history.</p>}
          {original && original.payer === travelerId && original.settled.length === 0 && (
            <Button
              variant="text danger"
              onClick={() => {
                if (original.settled.length) {
                  setError(
                    "Completed repayments must stay in the history. Add an adjustment expense instead.",
                  );
                  return;
                }
                setConfirmDelete(true);
              }}
            >
              Delete expense
            </Button>
          )}
          {scan === "review" ? (
            <div className="receipt-review-status" role="status">
              <span>Sample details added. Review the expense below.</span>
              <Button variant="text" onClick={() => setScan("ready")}>Choose another</Button>
            </div>
          ) : scan && (
            <div className="scan-box">
              <h3>
                {scan === "loading"
                  ? "Reading the sample receipt…"
                  : scan === "review"
                    ? "A few details, ready to review."
                    : "Try a sample receipt"}
              </h3>
              <p>Simulated scanning fills details for you to review.</p>
              <details className="receipt-image-options"><summary>Choose an image instead</summary>
              <input
                aria-label="Receipt image"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    if (!f.type.startsWith("image/") || f.size > 10000000) {
                      setError("Choose an image under 10 MB.");
                      return;
                    }
                    scanReceipt();
                  }
                }}
              />
              </details>
              <div className="receipt-scan-actions">
              <Button
                variant="outline"
                disabled={scan === "loading"}
                onClick={() => scanReceipt()}
              >
                Use sample receipt
              </Button>
              <Button variant={scan === "failed" ? "primary" : "text"} disabled={scan === "loading"} onClick={() => setScan("")}>{scan === "failed" ? "Enter expense manually" : "Enter manually"}</Button>
              </div>
              {scan !== "failed" && <button
                className="text-link"
                type="button"
                disabled={scan === "loading"}
                onClick={() => scanReceipt(true)}
              >
                Try scan failure
              </button>}
              {scan === "failed" && (
                <ErrorBox text="The scan didn’t work. Use the sample receipt or enter the details manually." />
              )}
            </div>
          )}
          <p className="expense-date-context">Expense date: {dateText(original?.date || s.date)}{t.persistence !== "account" && " · Demo date"}</p>
          <div className="expense-validated-field">
          <Field label="What was it for?">
            <textarea
              ref={purposeRef}
              rows={2}
              required
              aria-invalid={submitted && !!purposeProblem}
              aria-describedby={submitted && purposeProblem ? "expense-purpose-error" : undefined}
              maxLength={TEXT_LIMITS.expense}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              placeholder="Lunch by the waterfront"
            />
          </Field>
          {submitted && purposeProblem && <span id="expense-purpose-error" className="error expense-field-error" role="alert">{purposeProblem}</span>}
          </div>
          <div className="form-columns">
            <div className="expense-validated-field">
            <Field label="Amount (USD)">
              <input
                ref={amountRef}
                required
                type="number"
                min="0.01"
                aria-invalid={submitted && !!amountProblem}
                aria-describedby={submitted && amountProblem ? "expense-amount-error" : "expense-amount-hint"}
                max={MONEY_LIMITS.expense / 100}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </Field>
            {submitted && amountProblem && <span id="expense-amount-error" className="error expense-field-error" role="alert">{amountProblem}</span>}
            </div>
            <Field label="Category">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
          </div>
          {!(submitted && amountProblem) && <p className="expense-amount-hint" id="expense-amount-hint">
            {shared
              ? "Enter the total you paid, including others’ shares."
              : "Enter the amount you paid."}
          </p>}
          <label className="check-row">
            <input
              type="checkbox"
              checked={shared}
              onChange={(e) => setShared(e.target.checked)}
            />
            <span>
              I paid for other people too
              {shared && (
                <small>
                  {hasRounding
                    ? "Shares differ by 1¢ so they add up to the payment."
                    : "Split equally among the people selected below."}
                </small>
              )}
            </span>
          </label>
          {shared && previewAmountError && <p className="note">Enter a valid amount to preview each person’s share.</p>}
          {shared && (
            <fieldset>
              <legend>Who’s included? · {people.length} selected</legend>
              {t.members
                .filter((m) => m.status === "accepted")
                .map((m) => (
                  <label className="check-row" key={m.id}>
                    <input
                      type="checkbox"
                      checked={people.includes(m.id)}
                      onChange={(e) =>
                        setPeople(
                          e.target.checked
                            ? [...people, m.id]
                            : people.filter((id) => id !== m.id),
                        )
                      }
                    />
                    <span>{m.name}</span>
                    <strong>{previewAmountError ? "—" : money(previewShares[m.id] || 0)}</strong>
                  </label>
                ))}
            </fieldset>
          )}
          <ErrorBox text={error} />
        </div>
        <div className="form-actions">
          <Button variant="text" onClick={close}>
            Cancel
          </Button>
          <Button type="submit">Save expense</Button>
        </div>
      </form>
    </Modal>
  );
}


/** One append-only correction flow for both local samples and queued account saves. */
export function RepaymentForm() {
  const {trip, s, overlay, updateTrip, close, toast} = useApp();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const reasonInput = useRef<HTMLTextAreaElement>(null);
  const expense = trip?.expenses.find(item => item.id === overlay?.data.expenseId);
  const debtor = overlay?.data.debtor as string;
  const correct = Boolean(overlay?.data.correct);
  const actor = trip ? member(trip, s.userId)?.id : undefined;
  if (!trip || !expense || !actor || expense.payer !== actor || !(expense.shares[debtor] > 0) || debtor === actor)
    return <Modal title="Repayment unavailable"><p>Only the payer can update this repayment.</p><Button onClick={close}>Close</Button></Modal>;
  const changed = repaymentPaid(expense, debtor) !== correct;
  return <Modal title={correct ? "Correct repayment" : "Confirm repayment"}>
    <form className="repayment-form" onSubmit={event => {
      event.preventDefault();
      if (correct && !reason.trim()) { setError("Enter a reason for this correction."); reasonInput.current?.focus(); return; }
      try {
        updateTrip(current => {
          const latest = current.expenses.find(item => item.id === expense.id);
          const currentActor = member(current, s.userId)?.id;
          if (!latest || !currentActor) throw new Error("This repayment is no longer available.");
          recordRepayment(latest, debtor, currentActor, correct ? "unpaid" : "paid", reason,
            current.persistence === "account" ? undefined : new Date().toISOString());
        });
        toast(correct ? "Repayment corrected to unpaid. The original expense is unchanged." : "Repayment marked completed. Spending totals are unchanged.", "budget");
        close();
      } catch (issue) { setError(issue instanceof Error ? issue.message : "Could not update the repayment."); }
    }}>
      <p className="repayment-copy">{correct ? "Mark" : "Record that you received"} <strong>{money(expense.shares[debtor])}</strong> from <strong>{trip.members.find(person => person.id === debtor)?.name || "Former traveler"}</strong> for {expense.purpose}{correct ? " as unpaid again." : "."}</p>
      <p className="repayment-copy">{correct ? "The earlier paid record stays in the history. This amount returns to unpaid repayments; the original expense stays locked." : "This only updates the repayment log. No money is transferred or verified. The expense stays locked; a mistaken paid status can be corrected with a reason."}</p>
      {correct && <Field label="Reason for correction"><textarea ref={reasonInput} rows={3} maxLength={220} value={reason}
        aria-invalid={!!error} aria-describedby={error ? "repayment-error" : undefined}
        onChange={event => {setReason(event.target.value);setError("");}} /></Field>}
      {changed && <p role="alert" className="error">This repayment changed. Close this dialog and check its current status.</p>}
      {error && <p id="repayment-error" role="alert" className="error">{error}</p>}
      <div className="repayment-decision"><Button variant="outline" onClick={close}>Cancel</Button>
        <Button type="submit" variant="repayment-confirm" disabled={changed}>{correct ? "Mark as unpaid" : "Mark paid"}<Check size={16}/></Button></div>
    </form>
  </Modal>;
}
