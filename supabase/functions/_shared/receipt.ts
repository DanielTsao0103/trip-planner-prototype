/** Amounts are integer cents throughout review and persistence. A line amount is
 * the printed line total, not a unit price to multiply by quantity again. */
export type ReceiptLineItem = { description: string; quantity: number | null; amountCents: number };
export type ReceiptReconciliation = { itemTotalCents: number; expectedTotalCents: number | null; differenceCents: number | null; matches: boolean | null };
export type ReceiptScanResult = {
  purpose: string; category: string | undefined; amount: string; needsManualAmount: boolean;
  items: ReceiptLineItem[]; subtotalCents: number | null; taxCents: number | null;
  tipCents: number | null; discountCents: number | null; totalCents: number | null;
  currency: string | null; reconciliation: ReceiptReconciliation; warnings: string[];
  confidence: number | null; method: "ocr" | "vision";
};
const maxCents = 9999999;
const categories = ["Stay", "Food", "Transport", "Activities", "Other"];
const cleanText = (value: unknown, limit: number) => typeof value === "string"
  ? value.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, " ").trim().slice(0, limit) : "";
const cents = (value: unknown): number | null => Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= maxCents ? Number(value) : null;

/** A matching sum checks arithmetic, not whether OCR read every printed item. */
export function reconcileReceipt(items: ReceiptLineItem[], subtotal: number | null, tax: number | null, tip: number | null, discount: number | null, total: number | null): ReceiptReconciliation {
  const itemTotalCents = items.reduce((sum, item) => sum + item.amountCents, 0);
  const netItems = itemTotalCents - (discount ?? 0);
  const expectedTotalCents = subtotal !== null ? subtotal + (tax ?? 0) + (tip ?? 0)
    : items.length ? netItems + (tax ?? 0) + (tip ?? 0) : null;
  const differenceCents = total !== null && expectedTotalCents !== null ? total - expectedTotalCents : null;
  const itemsMatch = !items.length || subtotal === null || netItems === subtotal;
  return { itemTotalCents, expectedTotalCents, differenceCents,
    matches: differenceCents === null ? null : differenceCents !== 0 || !itemsMatch ? false : items.length ? true : null };
}

/** Both server output and saved receipt documents are untrusted input. */
export function normalizeReceiptDocument(value: unknown, method: "ocr" | "vision" = "ocr"): ReceiptScanResult {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const items: ReceiptLineItem[] = [];
  let rejected = false;
  if (Array.isArray(raw.items)) for (const item of raw.items.slice(0, 100)) {
    if (!item || typeof item !== "object") { rejected = true; continue; }
    const description = cleanText(item.description, 200), amountCents = cents(item.amountCents);
    const quantity = typeof item.quantity === "number" && Number.isFinite(item.quantity) && item.quantity > 0 && item.quantity <= 10000 ? item.quantity : null;
    if (!description || amountCents === null) { rejected = true; continue; }
    items.push({ description, quantity, amountCents });
  }
  const subtotalCents = cents(raw.subtotalCents), taxCents = cents(raw.taxCents), tipCents = cents(raw.tipCents), discountCents = cents(raw.discountCents);
  const totalCents = cents(raw.totalCents);
  const currency = typeof raw.currency === "string" && /^[A-Z]{3}$/.test(raw.currency) ? raw.currency : null;
  const needsManualAmount = raw.needsManualAmount === true || currency !== "USD" || totalCents === null || totalCents <= 0;
  const reconciliation = reconcileReceipt(items, subtotalCents, taxCents, tipCents, discountCents, totalCents);
  const derivedWarning = /^(?:No item lines were identified\.|This receipt is in [A-Z]{3}\. Enter the amount paid in USD\.|Confirm the receipt currency before using its total as USD\.|The final total could not be identified\.|The item and receipt totals do not agree\.|The photo was difficult to read\.)/;
  const warnings = Array.isArray(raw.warnings) ? raw.warnings.filter((entry): entry is string => typeof entry === "string").slice(0, 10).map(entry => cleanText(entry, 300)).filter(entry => entry && !derivedWarning.test(entry)) : [];
  if (rejected) warnings.push("Some item details could not be read. Compare the list with your receipt.");
  if (Array.isArray(raw.items) && raw.items.length > 100) warnings.push("This receipt has more than 100 items. Review the remaining items on the photo.");
  if (!items.length) warnings.push("No item lines were identified. You can add them manually.");
  if (currency !== "USD") warnings.push(currency ? `This receipt is in ${currency}. Enter the amount paid in USD.` : "Confirm the receipt currency before using its total as USD.");
  if (totalCents === null) warnings.push("The final total could not be identified. Enter the amount you paid.");
  if (reconciliation.matches === false) warnings.push("The item and receipt totals do not agree. Check missing items, discounts, tax and tip.");
  if (typeof raw.confidence === "number" && raw.confidence < 65) warnings.push("The photo was difficult to read. Check each extracted value against the receipt.");
  return { purpose: cleanText(raw.purpose, 130), category: typeof raw.category === "string" && categories.includes(raw.category) ? raw.category : undefined,
    amount: needsManualAmount ? "" : (totalCents! / 100).toFixed(2), needsManualAmount, items,
    subtotalCents, taxCents, tipCents, discountCents, totalCents, currency, reconciliation,
    warnings: [...new Set(warnings)].slice(0, 12), confidence: typeof raw.confidence === "number" && Number.isFinite(raw.confidence) ? Math.max(0, Math.min(100, raw.confidence)) : null,
    method: raw.method === "vision" || raw.method === "ocr" ? raw.method : method };
}
