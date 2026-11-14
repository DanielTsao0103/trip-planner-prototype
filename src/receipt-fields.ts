const categoryClues = [
  ["Stay", /\b(hotel|motel|hostel|resort|inn|accommodation|lodging|room rate|room charge)\b/i],
  ["Transport", /\b(uber|lyft|taxi|transit|railway|airlines?|airport shuttle|parking|toll|gasoline|car rental|train fare|bus fare|fuel)\b/i],
  ["Food", /\b(caf[eé]|coffee|restaurant|diner|bistro|bakery|pizzeria|pizza|sushi|burger|grill|breakfast|lunch|dinner|espresso|latte|sandwich|cheeseburger|cappuccino|grocer(?:y|ies))\b/i],
  ["Activities", /\b(museum|aquarium|zoo|cinema|theat(?:er|re)|admission|guided tour|kayak rental|lift ticket|theme park)\b/i],
] as const;

const headerLabel = /^(?:receipt|sales receipt|tax invoice|invoice|customer copy|merchant copy|order|transaction|cashier|terminal|date|time|table|payment|subtotal|tax|tip|(?:grand )?total|amount\s+(?:due|paid))\b/i;
const totalLabel = /^(grand\s+total|total(?:\s+(?:paid|due|amount|charged|sale))?|(?:amount|payment)\s+(?:due|paid|charged)|balance\s+due|sale\s+total|final\s+total)\b\s*[:=–-]?\s*/i;
const receiptMoney = /^(?:USD\s*|US\$\s*|\$\s*)?((?:\d{1,3}(?:,\d{3})+|\d+)\s*\.\s*\d{2})(?:\s+USD)?$/i;
const addressOrMetadata = /^(?:\d|tel\b|phone\b|welcome\b|thank you\b|see (?:the )?back\b|to win\b|id\s*#|manager\b)|[@]|\bwww\.|\d+[.,]\d{2}\s*$/i;
const currencyCode = "EUR|GBP|JPY|CAD|AUD|NZD|MXN|CHF|CNY|KRW|INR";
const foreignAmount = new RegExp(
  `^(?:[€£¥₩₹]|(?:CA|AU|NZ|HK|SG|NT)\\$|(?:${currencyCode})\\b)\\s*\\d|^\\d[\\d,.\\s]*\\s+(?:${currencyCode})$`,
  "i",
);
const foreignCurrencyLabel = new RegExp(`^(?:currency\\s*[:=]?\\s*)?(?:${currencyCode})$`, "i");

export function parseReceiptFields(text: string) {
  const lines = text.split("\n").map(line => line.trim()).filter(Boolean);
  const merchant = lines.slice(0, 8).find(line =>
    /\p{L}{3}/u.test(line) && !headerLabel.test(line) &&
    !addressOrMetadata.test(line),
  ) ?? "";
  const category = categoryClues.find(([, clue]) => clue.test(merchant))?.[0] ??
    categoryClues.find(([, clue]) => lines.some(line => !addressOrMetadata.test(line) && clue.test(line)))?.[0];
  const totals = new Set<string>();
  const dueTotals = new Set<string>();
  const grandTotals = new Set<string>();
  const paidTotals = new Set<string>();
  let hasForeignTotal = lines.some(line => foreignCurrencyLabel.test(line));
  for (const [index, line] of lines.entries()) {
    const labelMatch = line.match(totalLabel);
    if (!labelMatch) continue;
    const value = line.slice(labelMatch[0].length) || lines[index + 1] || "";
    if (foreignAmount.test(value)) hasForeignTotal = true;
    const match = value.match(receiptMoney);
    if (!match) continue;
    const amount = match[1].replace(/[,\s]/g, "");
    // A settled bill can show a zero balance below the positive charge.
    if (Number(amount) <= 0) continue;
    const label = labelMatch[1].toLowerCase();
    const target = /paid|charged/.test(label) ? paidTotals
      : /^(grand|final)/.test(label) ? grandTotals
      : /due/.test(label) ? dueTotals
      : totals;
    target.add(amount.replace(/^0+(?=\d)/, ""));
  }
  const candidates = [paidTotals, grandTotals, dueTotals, totals].find(values => values.size) ?? totals;
  return {
    purpose: merchant,
    amount: !hasForeignTotal && candidates.size === 1 ? [...candidates][0] : "",
    category,
    needsManualAmount: hasForeignTotal || candidates.size > 1,
  };
}
