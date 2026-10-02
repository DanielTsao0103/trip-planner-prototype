import React, { useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Camera,
  Check,
  ChevronRight,
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
  Avatar,
  Badge,
  Button,
  Empty,
  ErrorBox,
  Field,
  Modal,
  PageHead,
} from "./ui";
import { money, spent, isOwner, uid, splitCents, type Expense } from "./domain";
export const CATEGORIES = ["Stay", "Food", "Transport", "Activities", "Other"];
const COLORS = [
  "#285648",
  "#ce865e",
  "#a7bba3",
  "#deb86f",
  "#aaa4b3",
  "#ebe9df",
];
export function Budget() {
  const { trip: t, s, user, open, updateTrip, toast } = useApp();
  const [tab, setTab] = useState("Expenses"),
    [filter, setFilter] = useState("All");
  if (!t) return null;
  const individual = t.budgetMode === "individual",
    total = spent(t, individual ? s.userId! : undefined),
    budget = individual ? (t.individual[s.userId!] ?? null) : t.budget,
    remaining = budget !== null ? budget - total : null;
  const amounts = CATEGORIES.map((cat) =>
    t.expenses
      .filter((e) => e.category === cat)
      .reduce(
        (sum, e) => sum + (individual ? e.shares[s.userId!] || 0 : e.amount),
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
        d.debtor === s.userId ||
        d.expense.payer === s.userId,
    );
  const visibleExpenses = t.expenses.filter(
    (e) =>
      (filter === "All" || e.category === filter) &&
      (!individual || e.shares[s.userId!] || e.payer === s.userId),
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
        payer: s.userId!,
        shares: { [s.userId!]: 650 },
        date: s.date,
        source: "Demo transaction",
        settled: [],
      }),
    );
    open("transaction");
  };
  return (
    <>
      <PageHead
        eyebrow="A LITTLE CLARITY GOES A LONG WAY"
        title="Good times. Clear numbers."
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
        <Badge>USD</Badge>
        {(isOwner(t, s.userId) || individual) && (
          <button className="text-link" onClick={() => open("budgetSetup")}>
            {budget === null ? "Set budget" : "Budget settings"}
            <ArrowUpRight size={15} />
          </button>
        )}
        <span className="push fine-print">
          Demo finances · no accounts linked
        </span>
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
            {remaining !== null && remaining < 0
              ? "OVER BUDGET"
              : "STILL TO ENJOY"}
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
        <aside className="card chart-card">
          <div className="eyebrow">WHERE IT’S GOING</div>
          <h2>The spending picture.</h2>
          <div
            className="donut"
            role="img"
            aria-label={`Spending chart. ${CATEGORIES.map((c, i) => `${c}: ${money(amounts[i])}`).join(", ")}. Remaining ${remaining === null ? "not set" : money(remaining)}`}
            style={{ background: `conic-gradient(${gradient})` }}
          >
            <div>
              <small>{individual ? "YOUR SHARE" : "SPENT SO FAR"}</small>
              <strong>{money(total)}</strong>
              <span>of {budget === null ? "unset budget" : money(budget)}</span>
            </div>
          </div>
          <div className="chart-legend">
            {[...CATEGORIES, "Remaining"].map((c, i) => (
              <div key={c}>
                <span
                  className="legend-color"
                  style={{ background: COLORS[i] }}
                />
                <span>{c}</span>
                <strong>
                  {i === 5 && remaining === null ? "—" : money(chartValues[i])}
                </strong>
              </div>
            ))}
          </div>
          <p className="fine-print">
            Reimbursements settle what people owe. They don’t count as new
            spending.
          </p>
        </aside>
        <div className="card ledger-card">
          <div className="tabs">
            <button
              className={tab === "Expenses" ? "active" : ""}
              onClick={() => setTab("Expenses")}
            >
              Expense log <Badge>{t.expenses.length}</Badge>
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
                <span className="eyebrow">THE DETAILS</span>
                <select
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
                    </div>
                    <div className="expense-amount">
                      <strong>
                        {money(
                          individual ? e.shares[s.userId!] || 0 : e.amount,
                        )}
                      </strong>
                      {individual && <small>of {money(e.amount)}</small>}
                      {e.payer === s.userId && (
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
              <p className="ledger-help">
                Clear little IOUs. Only the person owed can mark one paid.
              </p>
              <div className="debt-list">
                {debts.map(({ expense: e, debtor, amount }) => (
                  <div className="debt-row" key={e.id + debtor}>
                    <Avatar name={name(debtor)} />
                    <div>
                      <strong>
                        {name(debtor)} owes {name(e.payer)} {money(amount)}
                      </strong>
                      <p>{e.purpose}</p>
                      <Badge tone={e.settled.includes(debtor) ? "green" : ""}>
                        {e.settled.includes(debtor)
                          ? "Completed"
                          : "Awaiting repayment"}
                      </Badge>
                    </div>
                    {e.payer === s.userId && !e.settled.includes(debtor) && (
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
              </div>
              {!debts.length && (
                <Empty
                  title="All clear between friends."
                  body="When you log a payment for someone else, their reimbursement will appear here."
                />
              )}
            </>
          )}
          <div className="ledger-tools">
            <button onClick={gmail}>
              <Mail size={16} />
              Match sample Gmail receipt
            </button>
            <button onClick={transaction}>
              <ArrowDownLeft size={16} />
              Simulate transaction
            </button>
          </div>
        </div>
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
      <div className="budget-bottom">
        <div>
          <small>{individual ? "YOUR SHARE SPENT" : "TOTAL SPENT"}</small>
          <strong>{money(total)}</strong>
        </div>
        <div>
          <small>REMAINING</small>
          <strong>
            {remaining === null ? "Set a budget" : money(remaining)}
          </strong>
        </div>
        <Button
          variant="outline"
          onClick={() => open("expense", { scan: true })}
        >
          <Camera size={18} />
          Scan a receipt
        </Button>
      </div>
    </>
  );
}
export function BudgetSetup() {
  const { trip: t, s, updateTrip, close, toast } = useApp();
  if (!t) return null;
  const owner = isOwner(t, s.userId),
    [mode, setMode] = useState(t.budgetMode),
    [amount, setAmount] = useState(
      String(
        ((t.budgetMode === "group" ? t.budget : t.individual[s.userId!]) || 0) /
          100,
      ),
    ),
    [error, setError] = useState("");
  return (
    <Modal title="A budget that fits">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
            setError("Enter a budget greater than zero.");
            return;
          }
          if (mode === "group" && !owner) {
            setError("Only the Owner can set the group budget.");
            return;
          }
          updateTrip((t) => {
            if (owner) t.budgetMode = mode;
            if (mode === "group") t.budget = Math.round(Number(amount) * 100);
            else t.individual[s.userId!] = Math.round(Number(amount) * 100);
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
                    ((value === "group" ? t.budget : t.individual[s.userId!]) ||
                      0) / 100,
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
    <Modal title={original ? "Edit an expense" : "Keep the little costs clear"}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (original && original.payer !== s.userId) {
            setError("Only the payer can edit this expense.");
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
            payer: s.userId!,
            shares: splitCents(cents, shared ? people : [s.userId!]),
            date: original?.date || s.date,
            source,
            settled: [],
          };
          updateTrip((t) => {
            const i = t.expenses.findIndex((x) => x.id === record.id);
            if (i >= 0) t.expenses[i] = record;
            else t.expenses.unshift(record);
          });
          toast("Expense recorded. Your totals are up to date.");
          if (shared && people.some((id) => id !== s.userId))
            open("message", {
              title: "Your group is in the loop",
              body: `Simulated notification: ${people
                .filter((id) => id !== s.userId)
                .map((id) => t.members.find((m) => m.id === id)?.name)
                .join(
                  ", ",
                )} can see what they owe for ${purpose}. No message was sent.`,
            });
          else close();
        }}
      >
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
            <small>Split equally among the people selected below.</small>
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
                    {money(
                      splitCents(Math.round(Number(amount || 0) * 100), people)[
                        m.id
                      ] || 0,
                    )}
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
          <Button type="submit">
            {shared ? "Save & simulate notification" : "Save expense"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
