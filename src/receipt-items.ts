import { parseReceiptFields } from "./receipt-fields.ts";
import { normalizeReceiptDocument, type ReceiptLineItem } from "../supabase/functions/_shared/receipt.ts";
export { normalizeReceiptDocument, reconcileReceipt } from "../supabase/functions/_shared/receipt.ts";
export type { ReceiptLineItem, ReceiptScanResult, ReceiptReconciliation } from "../supabase/functions/_shared/receipt.ts";

/** Parse decimal text directly to cents, avoiding binary floating-point rounding. */
export function receiptCents(text: string): number | null {
  const match = text.trim().match(/^(?:USD\s*|US\$\s*|\$\s*)?([+-]?)(\d{1,3}(?:,\d{3})+|\d+)\s*\.\s*(\d{2})(?:\s*USD)?$/i);
  if (!match) return null;
  const amount = Number(match[2].replaceAll(",", "")) * 100 + Number(match[3]);
  return Number.isSafeInteger(amount) && amount <= 9999999 ? (match[1] === "-" ? -amount : amount) : null;
}
const moneyAtEnd = /\s+((?:(?:USD|US\$|\$)\s*)?[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)\s*\.\s*\d{2}(?:\s*USD)?)(?:\s+[A-Z])?\s*$/i;
const totalLabel = /^(?:grand\s+total|final\s+total|total(?:\s+(?:paid|due|amount|charged|sale))?|(?:amount|payment)\s+(?:due|paid|charged)|balance\s+due|sale\s+total)\b/i;
const excluded = /^(?:sub\s*total|tax(?:es)?|sales\s+tax|vat|gst|hst|pst|tip|gratuity|discount|coupon|savings|total\b|grand\b|final\b|amount\b|balance\b|cash\b|change\b|tender\b|debit\b|credit\b|visa\b|mastercard\b|amex\b|card\b|payment\b|paid\b|auth\b|approval\b|transaction\b|terminal\b|cashier\b|register\b|order\b|receipt\b|date\b|time\b|table\b|tel\b|phone\b|www\.|https?:|thank\b|suggested\b|recommended\b|you saved\b|your savings\b|points\b|rewards\b|member\b|acct\b)/i;
const currencyCodes = /\b(USD|CAD|AUD|NZD|EUR|GBP|JPY|CNY|KRW|INR|MXN|CHF|HKD|SGD|TWD)\b/g;

/** Conservative extraction: only rows with a readable description and printed
 * decimal line amount become items. Header/payment/card lines never become items. */
export function parseReceiptDocument(text: string, confidence: number | null = null) {
  const fields = parseReceiptFields(text);
  const lines = text.slice(0, 100000).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const explicit = [...new Set((text.toUpperCase().match(currencyCodes) || []))];
  let currency: string | null = explicit.length === 1 ? explicit[0] : null;
  if (!currency) currency = /US\$/.test(text) ? "USD" : /CA\$/.test(text) ? "CAD" : /AU\$/.test(text) ? "AUD" : /€/.test(text) ? "EUR" : /£/.test(text) ? "GBP" : null;
  const items: ReceiptLineItem[] = [], warnings: string[] = [];
  const summary: Record<string, number[]> = { subtotalCents: [], taxCents: [], tipCents: [], discountCents: [] };
  let summaryStarted = false;
  const aggregateTaxes: number[] = [];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const amountMatch = line.match(moneyAtEnd);
    const label = amountMatch ? line.slice(0, amountMatch.index).trim().replace(/[:=–-]+$/, "").trim() : line.replace(/[:=–-]+$/, "").trim();
    const amount = receiptCents(amountMatch?.[1] || lines[index + 1] || "");
    const summaryKey = /^sub\s*total\b/i.test(label) ? "subtotalCents"
      : /^(?:(?:sales|state|local|city|county)\s+)?tax(?:es)?\b|^(?:vat|gst|hst|pst)\b/i.test(label) && !/\bincluded\b/i.test(label) ? "taxCents"
      : /^(?:tip|gratuity)\b/i.test(label) && !/%|suggest|recommend/i.test(label) ? "tipCents"
      : /^(?:discount|coupon|savings|you saved|your savings)\b/i.test(label) ? "discountCents" : null;
    if (summaryKey && amount !== null) {
      summary[summaryKey].push(Math.abs(amount));
      if (summaryKey === "taxCents" && /^(?:sales\s+|total\s+)?tax(?:es)?$/i.test(label)) aggregateTaxes.push(Math.abs(amount));
      if (summaryKey === "subtotalCents") summaryStarted = true;
      if (!amountMatch) index++;
      continue;
    }
    if (totalLabel.test(label)) { summaryStarted = true; continue; }
    const separateAmount = !amountMatch && index > 0 && label !== fields.purpose && !/^(?:USD|CAD|AUD|NZD|EUR|GBP|JPY|Currency\b)/i.test(label) && receiptCents(lines[index + 1] || "") !== null;
    if (summaryStarted || (!amountMatch && !separateAmount) || amount === null || !/[\p{L}]/u.test(label) || excluded.test(label)) continue;
    if (/\*{3,}|\b\d{10,}\b|\b(?:st(?:reet)?|ave(?:nue)?|road|rd|blvd|drive|dr)\.?$/i.test(label)) continue;
    if (amount < 0) { summary.discountCents.push(-amount); continue; }
    const qtyMatch = label.match(/^(\d+(?:\.\d{1,3})?)\s*(?:x\s*|@\s*|\s+)(.+)$/i);
    const quantity = qtyMatch && Number(qtyMatch[1]) > 0 && Number(qtyMatch[1]) <= 10000 ? Number(qtyMatch[1]) : null;
    const description = (quantity !== null ? qtyMatch![2] : label).replace(/\s+@\s*\$?\d+\.\d{2}\s*$/, "").slice(0, 200);
    if (description) items.push({ description, quantity, amountCents: amount });
    if (separateAmount) index++;
  }
  const one = (key: string) => {
    const selected = key === "taxCents" && aggregateTaxes.length ? aggregateTaxes : summary[key];
    const values = [...new Set(selected)];
    if (values.length > 1 && key !== "taxCents" && key !== "discountCents") { warnings.push(`Multiple ${key === "subtotalCents" ? "subtotals" : "tips"} were found. Confirm the correct amount.`); return null; }
    if (key === "taxCents" && aggregateTaxes.length) {
      if (values.length > 1) { warnings.push("Multiple tax totals were found. Confirm the correct amount."); return null; }
      return values[0];
    }
    return values.length ? key === "taxCents" || key === "discountCents" ? selected.reduce((sum, value) => sum + value, 0) : values[0] : null;
  };
  // Foreign currencies are preserved for review, but never relabeled USD.
  const totalFields = currency && currency !== "USD" ? parseReceiptFields(text.replace(new RegExp(`\\b${currency}\\b`, "g"), "USD").replace(/[€£]/g, "$")) : fields;
  const totalCents = totalFields.amount ? receiptCents(totalFields.amount) : null;
  return normalizeReceiptDocument({ ...fields, items, totalCents, currency, confidence, method: "ocr", warnings,
    subtotalCents: one("subtotalCents"), taxCents: one("taxCents"), tipCents: one("tipCents"), discountCents: one("discountCents") });
}
