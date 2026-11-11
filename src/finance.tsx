/** Implementation status: Account budgets, expenses, splits, and repayment markers save through updateTrip to Supabase. Sample trips stay local. Receipt scans/Gmail/bank actions remain fixtures; no messages or money are sent. See ../IMPLEMENTATION_STATUS.md. */
import { TEXT_LIMITS, MONEY_LIMITS, textError, moneyError } from "./limits.ts";
import React, { useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Camera,
  Check,
  ChevronRight,
  ChevronDown,
  Mail,
  Plus,
  Receipt,
  Wallet,
  Info,
  Send,
  ScanLine,
} from "lucide-react";
import { useApp } from "./state";
import {
  Badge,
  Button,
  Empty,
  ErrorBox,
  Field,
  Modal,
  PageHead,
} from "./ui";
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
export function Budget() {
  const { trip: t, s, user, open, updateTrip, toast } = useApp();
  const [tab, setTab] = useState("Expenses"),
    [filter, setFilter] = useState("All");
  const [showBreakdown, setShowBreakdown] = useState(
    () => window.innerWidth > 760,
  );
  const [converterExpanded, setConverterExpanded] = useState(false);
  const [converterJump, setConverterJump] = useState(0);
  const [repaymentView, setRepaymentView] = useState("Owed to me");
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
    if (!debt.expense.settled.includes(debt.debtor))
      group.unpaid += debt.amount;
    repaymentGroups.set(key, group);
  }
  const visibleExpenses = t.expenses.filter(
    (e) =>
      (filter === "All" || e.category === filter) &&
      (!individual || e.shares[travelerId] || e.payer === travelerId),
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
      toast("This sample transaction is already logged.");
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
    open("transaction");
  };
  return (
    <div className="budget-page">
      <PageHead
        title="Budget"
        description={
          individual
            ? "Your share of the trip, in one place."
            : "Your shared trip budget, without the guesswork."
        }
        action={
          <Button onClick={() => open("expense")}>
            <Plus size={17} />
            Add expense
          </Button>
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
          USD · Convert
        </button>
        {(isOwner(t, s.userId) || individual) && (
          <button className="text-link" onClick={() => open("budgetSetup")}>
            {budget === null ? "Set budget" : "Budget settings"}
            <ArrowUpRight size={15} />
          </button>
        )}
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
      <div className="budget-stats">
        <div>
          <span>{individual ? "YOUR SHARE SPENT" : "TOTAL SPENT"}</span>
          <strong>{money(total)}</strong>
          <small>Across {t.expenses.length} logged expenses</small>
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
            {remaining !== null && remaining < 0
              ? "Time to revisit the plan."
              : "A little room for possibility."}
          </small>
        </div>
      </div>
      <div className="finance-layout">
        <div className="card ledger-card">
          <div className="tabs">
            <button
              className={tab === "Expenses" ? "active" : ""}
              onClick={() => setTab("Expenses")}
            >
              Expense log <Badge>{visibleExpenses.length}</Badge>
            </button>
            <button
              className={tab === "Reimbursements" ? "active" : ""}
              onClick={() => setTab("Reimbursements")}
            >
              Reimbursements
            </button>
          </div>
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
              </div>
              <div className="expense-list">
                {visibleExpenses.map((e) => (
                  <div className="expense-row" key={e.id}>
                    <span className="expense-icon">
                      <Receipt size={19} />
                    </span>
                    <div className="expense-main">
                      <strong>{e.purpose}</strong>
                      <span>
                        {e.category} · paid by {name(e.payer).split(" ")[0]}
                      </span>
                      <small>
                        {e.source} · {e.date}
                      </small>
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
                      <strong>
                        {money(
                          individual ? e.shares[travelerId] || 0 : e.amount,
                        )}
                      </strong>
                      {individual && <small>of {money(e.amount)}</small>}
                      {e.payer === travelerId && (
                        <button
                          className="text-link"
                          onClick={() => open("expense", { id: e.id })}
                        >
                          Edit
                        </button>
                      )}
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
                    <Button onClick={() => open("expense")}>
                      Add an expense
                    </Button>
                  }
                />
              )}
            </>
          ) : (
            <>
              <div className="repayment-toolbar">
                <p className="ledger-help">
                  Only the person owed can mark a repayment paid.
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
                  <section className="repayment-group" key={key}>
                    <header>
                      <h3>
                        {name(group.debtor)}{" "}
                        {group.unpaid > 0 ? "owes" : "repaid"}{" "}
                        {name(group.payer)}
                      </h3>
                      {group.items.length > 1 && (
                        <strong>{money(group.unpaid)} unpaid</strong>
                      )}
                    </header>
                    {group.items.map(({ expense: e, debtor, amount }) => (
                      <div className="debt-row" key={e.id + debtor}>
                        <div>
                          <strong>{money(amount)}</strong>
                          <p>{e.purpose}</p>
                          {e.settled.includes(debtor) && (
                            <Badge tone="green">Completed</Badge>
                          )}
                        </div>
                        {e.payer === travelerId &&
                          !e.settled.includes(debtor) && (
                            <Button
                              variant="outline small"
                              onClick={() =>
                                open("settle", { expenseId: e.id, debtor })
                              }
                            >
                              Mark paid
                            </Button>
                          )}
                      </div>
                    ))}
                  </section>
                ))}
              </div>
              {!repaymentGroups.size && (
                <Empty
                  title={repaymentView === "Owed to me" ? "Nothing owed to you." : repaymentView === "I owe" ? "Nothing for you to repay." : "All clear between friends."}
                  body={repaymentView === "I owe"
                    ? "When someone records a payment for you, your share will appear here."
                    : "When you log a payment for someone else, their reimbursement will appear here."}
                  action={repaymentView !== "All repayments" && debts.length > 0 ? (
                    <Button variant="outline" onClick={() => setRepaymentView("All repayments")}>Show all repayments</Button>
                  ) : undefined}
                />
              )}
            </>
          )}
          <details className="budget-samples">
            <summary>Sample tools</summary>
            <div className="ledger-tools">
              <button onClick={() => open("expense", { scan: true })}>
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
        </div>
        <aside className="card chart-card">
          <h2 className="breakdown-heading">
            <button
              type="button"
              aria-expanded={showBreakdown}
              aria-controls="spending-breakdown"
              onClick={() => setShowBreakdown((value) => !value)}
            >
              Spending breakdown
              <ChevronDown size={17} aria-hidden="true" />
            </button>
          </h2>
          <div id="spending-breakdown" hidden={!showBreakdown}>
            <div
              className="donut"
              role="img"
              aria-label={`Spending chart. ${CATEGORIES.map((c, i) => `${c}: ${money(amounts[i])}`).join(", ")}. Remaining ${remaining === null ? "not set" : money(remaining)}`}
              style={{ background: `conic-gradient(${gradient})` }}
            >
              <div>
                <small>{individual ? "YOUR SHARE" : "SPENT SO FAR"}</small>
                <strong>{money(total)}</strong>
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
              Reimbursements settle what people owe. They don’t count as new
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
  return (
    <Modal title="A budget that fits">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const problem = moneyError(amount, MONEY_LIMITS.budget);
          if (problem) {
            setError(problem);
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
          toast("Budget updated. Existing expenses and shares are unchanged.");
          close();
        }}
      >
        {owner && (
          <Field label="How should we track spending?">
            <select
              value={mode}
              onChange={(e) => {
                const value = e.target.value as "group" | "individual";
                setMode(value);
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
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
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
  // Integer cents keep the visible split identical to the saved allocation.
  const previewCents = moneyError(amount, MONEY_LIMITS.expense)
    ? 0
    : Math.round(Number(amount) * 100);
  const previewShares = splitCents(previewCents, people);
  const hasRounding = shared && people.length > 1 && previewCents % people.length !== 0;
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
  return (
    <Modal title={original ? "Edit an expense" : "Add an expense"}>
      <form
        className="expense-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (original && original.payer !== travelerId) {
            setError("Only the payer can edit this expense.");
            return;
          }
          const problem =
            textError(
              purpose,
              "Expense description",
              TEXT_LIMITS.expense,
              true,
            ) || moneyError(amount, MONEY_LIMITS.expense);
          if (problem) {
            setError(problem);
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
              "This expense has completed repayments. Keep the historical record and add a separate adjustment expense.",
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
          );
          close();
        }}
      >
        {original && original.payer === travelerId && (
          <Button
            variant="text danger"
            onClick={() => {
              if (original.settled.length) {
                setError(
                  "Completed repayments must stay in the history. Add an adjustment expense instead.",
                );
                return;
              }
              if (
                window.confirm("Delete this expense and its unpaid shares?")
              ) {
                updateTrip((trip) => {
                  trip.expenses = trip.expenses.filter(
                    (e) => e.id !== original.id,
                  );
                });
                close();
              }
            }}
          >
            Delete expense
          </Button>
        )}
        {scan && (
          <div className="scan-box">
            <ScanLine size={30} />
            <h3>
              {scan === "loading"
                ? "Reading the sample receipt…"
                : scan === "review"
                  ? "A few details, ready to review."
                  : "Start with a receipt."}
            </h3>
            <p>Simulated scanning. Choose an image or try the sample.</p>
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
            <Button
              variant="outline"
              disabled={scan === "loading"}
              onClick={() => scanReceipt()}
            >
              Use sample receipt
            </Button>
            <button
              className="text-link"
              type="button"
              onClick={() => scanReceipt(true)}
            >
              Try scan failure
            </button>
            {scan === "failed" && (
              <ErrorBox text="The scan didn’t work. Try another image or type the details below." />
            )}
          </div>
        )}
        <Field label="What was it for?">
          <input
            required
            maxLength={TEXT_LIMITS.expense}
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            placeholder="Lunch by the waterfront"
          />
        </Field>
        <div className="form-columns">
          <Field label="Amount (USD)">
            <input
              required
              type="number"
              min="0.01"
              max={MONEY_LIMITS.expense / 100}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </Field>
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
        <div className="note">Paid by you. Record only your own payment.</div>
        <label className="check-row">
          <input
            type="checkbox"
            checked={shared}
            onChange={(e) => setShared(e.target.checked)}
          />
          <span>
            I paid for other people too
            <small>
              {hasRounding
                ? "Shares differ by 1¢ so they add up to the payment."
                : "Split equally among the people selected below."}
            </small>
          </span>
        </label>
        {shared && (
          <fieldset>
            <legend>Who’s included?</legend>
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
                  <strong>
                    {money(previewShares[m.id] || 0)}
                  </strong>
                </label>
              ))}
          </fieldset>
        )}
        <ErrorBox text={error} />
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
