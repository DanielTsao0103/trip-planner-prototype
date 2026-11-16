import { useEffect, useRef, useState } from "react";
import { Button } from "./ui";
import { money } from "./domain";
import { CURRENCIES } from "./exchange-rates";
import { normalizeReceiptDocument, type ReceiptScanResult } from "./receipt-items";

const cents = (value: string) => /^\d+(?:\.\d{0,2})?$/.test(value) && Number(value) <= 99999.99 ? Math.round(Number(value) * 100) : null;
const currencyText = (value: number, currency: string | null) => {
  if (!currency) return (value / 100).toFixed(2);
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value / 100); }
  catch { return (value / 100).toFixed(2); }
};
const adjustments = [["subtotalCents", "Subtotal"], ["taxCents", "Tax"], ["tipCents", "Tip"], ["discountCents", "Discount"], ["totalCents", "Printed total"]] as const;
type Adjustment = typeof adjustments[number][0];
type Draft = { items: { key: number; description: string; quantity: string; amount: string }[]; fields: Record<Adjustment, string>; currency: string };
const currencies: string[] = Object.keys(CURRENCIES);
const validDraft = (draft: Draft) => draft.items.every(item => item.description.trim() && item.description.length <= 200 && cents(item.amount) !== null &&
  (!item.quantity || /^\d+(?:\.\d{1,3})?$/.test(item.quantity) && Number(item.quantity) > 0 && Number(item.quantity) <= 10000)) &&
  Object.values(draft.fields).every(value => value === "" || cents(value) !== null);

/** Keep editable strings separate from normalized values so typing a space or a
 * decimal point does not erase an item or move the caret. Stable keys survive removal. */
export function ReceiptReview({ value, onChange, onUseTotal, onValidityChange }: { value: ReceiptScanResult; onChange?: (value: ReceiptScanResult) => void; onUseTotal?: (amount: string) => void; onValidityChange?: (valid: boolean) => void }) {
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    const root = section.current;
    const scrollport = root?.closest<HTMLElement>(".expense-fields");
    if (!root || !scrollport) return;
    let frame = 0;
    const reveal = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const control = document.activeElement;
        if (!(control instanceof HTMLElement) || !root.contains(control)) return;
        const bounds = control.getBoundingClientRect(), visible = scrollport.getBoundingClientRect();
        const top = visible.top + 12, bottom = visible.bottom - 12;
        if (bounds.top >= top && bounds.bottom <= bottom) return;
        const label = control.closest("label")?.getBoundingClientRect();
        const target = label && label.height <= bottom - top ? label : bounds;
        scrollport.scrollBy({ top: (target.top + target.bottom - top - bottom) / 2, behavior: "instant" });
      });
    };
    // Rotation and enlarged text can move an already-focused field without a new focus event.
    const observer = new ResizeObserver(reveal);
    observer.observe(root); observer.observe(scrollport);
    root.addEventListener("focusin", reveal);
    window.visualViewport?.addEventListener("resize", reveal);
    return () => {
      cancelAnimationFrame(frame); observer.disconnect();
      root.removeEventListener("focusin", reveal);
      window.visualViewport?.removeEventListener("resize", reveal);
    };
  }, []);
  const editable = Boolean(onChange);
  const sequence = useRef(0);
  const makeDraft = (receipt: ReceiptScanResult): Draft => ({
    items: receipt.items.map(item => ({ key: ++sequence.current, description: item.description, quantity: item.quantity == null ? "" : String(item.quantity), amount: (item.amountCents / 100).toFixed(2) })),
    fields: Object.fromEntries(adjustments.map(([key]) => [key, receipt[key] == null ? "" : (receipt[key]! / 100).toFixed(2)])) as Record<Adjustment, string>,
    currency: receipt.currency || "",
  });
  const [draft, setDraft] = useState(() => makeDraft(value));
  const emitted = useRef(value);
  useEffect(() => {
    if (value !== emitted.current) { emitted.current = value; setDraft(makeDraft(value)); }
  }, [value]);
  const valid = validDraft(draft);
  useEffect(() => { onValidityChange?.(!editable || valid); }, [editable, valid, onValidityChange]);
  const update = (next: Draft) => {
    setDraft(next);
    const okay = validDraft(next);
    onValidityChange?.(okay);
    if (!okay) return;
    const receipt = normalizeReceiptDocument({ ...value,
      items: next.items.map(item => ({ description: item.description, quantity: item.quantity ? Number(item.quantity) : null, amountCents: cents(item.amount)! })),
      ...Object.fromEntries(adjustments.map(([key]) => [key, next.fields[key] === "" ? null : cents(next.fields[key])])),
      currency: next.currency || null,
      needsManualAmount: next.currency !== "USD" || !cents(next.fields.totalCents),
    }, value.method);
    emitted.current = receipt;
    onChange?.(receipt);
  };
  const changeItem = (key: number, change: Partial<Draft["items"][number]>) => update({ ...draft, items: draft.items.map(item => item.key === key ? { ...item, ...change } : item) });
  const subtotalDifference = value.subtotalCents === null ? null : value.reconciliation.itemTotalCents - (value.discountCents ?? 0) - value.subtotalCents;
  const difference = value.reconciliation.differenceCents || subtotalDifference || 0;
  return <section ref={section} className="receipt-review" aria-label="Receipt details">
    <div className="receipt-review-heading"><h3>{editable ? "Review the receipt" : "Receipt details"}</h3><span>{editable ? draft.items.length : value.items.length} line {(editable ? draft.items.length : value.items.length) === 1 ? "item" : "items"}</span></div>
    {editable && <p>Compare the photo with the items and total. Correct anything that was missed.</p>}
    {editable && <label>Receipt currency<select aria-label="Receipt currency" value={draft.currency} onChange={event => update({ ...draft, currency: event.target.value })}><option value="">Choose currency</option>{currencies.map(code => <option key={code}>{code}</option>)}{draft.currency && !currencies.includes(draft.currency) && <option>{draft.currency}</option>}</select></label>}
    {editable && !value.currency && <p className="receipt-currency-note">Choose the receipt currency to fill the USD expense amount automatically.</p>}
    <div className="receipt-items">
      {editable ? draft.items.map((item, index) => <div className="receipt-item" key={item.key}>
        <label>Item {index + 1}<input aria-label={`Receipt item ${index + 1}`} maxLength={200} value={item.description} aria-invalid={!item.description.trim() || undefined} onChange={event => changeItem(item.key, { description: event.target.value })}/></label>
        <label>Quantity<input type="number" min="0.001" max="10000" step="0.001" aria-label={`Receipt item ${index + 1} quantity`} value={item.quantity} onChange={event => changeItem(item.key, { quantity: event.target.value })}/></label>
        <label>Line total<input type="number" min="0" max="99999.99" step="0.01" aria-label={`Receipt item ${index + 1} amount`} value={item.amount} aria-invalid={cents(item.amount) === null || undefined} onChange={event => changeItem(item.key, { amount: event.target.value })}/></label>
        <Button variant="text" aria-label={`Remove receipt item ${index + 1}`} onClick={() => update({ ...draft, items: draft.items.filter(current => current.key !== item.key) })}>Remove</Button>
      </div>) : value.items.map((item, index) => <div className="receipt-item" key={index}><span>{item.quantity && item.quantity !== 1 ? `${item.quantity} × ` : ""}{item.description}</span><strong>{currencyText(item.amountCents, value.currency)}</strong></div>)}
      {!(editable ? draft.items.length : value.items.length) && <p>No line items could be read. You can still enter and save the expense total.</p>}
    </div>
    {editable && !valid && <p className="error" role="alert">Enter a name and a valid line total for each item. Quantities must be greater than zero, and amounts can have up to two decimal places.</p>}
    {editable && draft.items.length < 100 && <Button variant="text" onClick={() => update({ ...draft, items: [...draft.items, { key: ++sequence.current, description: "New item", quantity: "", amount: "0.00" }] })}>Add a line item</Button>}
    <details className="receipt-adjustments"><summary>Subtotal, tax and tip</summary>
      <div className="receipt-adjustment-grid">{adjustments.map(([key, label]) => <label key={key}>{label}{editable ? <input type="number" min="0" max="99999.99" step="0.01" aria-label={`Receipt ${label.toLowerCase()}`} value={draft.fields[key]} aria-invalid={draft.fields[key] !== "" && cents(draft.fields[key]) === null || undefined} onChange={event => update({ ...draft, fields: { ...draft.fields, [key]: event.target.value } })}/> : <strong>{value[key] == null ? "Not recorded" : currencyText(value[key]!, value.currency)}</strong>}</label>)}</div>
      {!editable && <p>Receipt currency: {value.currency || "Not identified"}</p>}
    </details>
    {value.totalCents != null && <p className="receipt-total"><span>Printed total</span><strong>{currencyText(value.totalCents, value.currency)}</strong></p>}
    <p className="receipt-reconciliation" role="status">{editable && !valid ? "Correct the highlighted receipt details before saving." : value.reconciliation.matches === true ? "Line items, adjustments and total agree." : value.reconciliation.matches === false ? `The ${value.reconciliation.differenceCents ? "final total" : "item subtotal"} differs by ${currencyText(Math.abs(difference), value.currency)}. Check the photo for missing items or adjustments.` : "Check the total against the photo; there is not enough information to check the full calculation."}</p>
    {editable && valid && value.currency === "USD" && value.totalCents != null && value.totalCents > 0 && <Button variant="text" onClick={() => onUseTotal?.((value.totalCents! / 100).toFixed(2))}>Use {money(value.totalCents)} as expense amount</Button>}
    {editable && value.warnings.length > 0 && <details><summary>Reading notes</summary><ul>{value.warnings.filter(warning => !/^This receipt is in [A-Z]{3}\. Enter the amount paid in USD\.$/.test(warning)).map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
  </section>;
}
