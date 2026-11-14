const categoryClues = [
  ["Stay", /\b(hotel|motel|hostel|resort|inn|accommodation|lodging|room rate|room charge)\b/i],
  ["Transport", /\b(uber|lyft|taxi|transit|railway|airlines?|airport shuttle|parking|toll|gasoline|car rental|train fare|bus fare|fuel)\b/i],
  ["Food", /\b(caf[eé]|coffee|restaurant|diner|bistro|bakery|pizzeria|pizza|sushi|burger|grill|breakfast|lunch|dinner|espresso|latte|sandwich|cheeseburger|cappuccino|grocer(?:y|ies))\b/i],
  ["Activities", /\b(museum|aquarium|zoo|cinema|theat(?:er|re)|admission|guided tour|kayak rental|lift ticket|theme park)\b/i],
] as const;

const headerLabel = /^(?:receipt|sales receipt|tax invoice|invoice|customer copy|merchant copy|order|transaction|cashier|terminal|date|time|table|payment|subtotal|tax|tip|(?:grand )?total|amount\s+(?:due|paid))\b/i;
const totalLabel = /^(grand\s+total|total(?:\s+(?:paid|due|amount|charged))?|(?:amount|payment)\s+(?:due|paid|charged)|balance\s+due|sale\s+total)\b\s*[:=–-]?\s*/i;
const receiptMoney = /^(?:USD\s*|US\$\s*|\$\s*)?((?:\d{1,3}(?:,\d{3})+|\d+)\s*\.\s*\d{2})(?:\s+USD)?$/i;
const addressOrMetadata = /^(?:\d|tel\b|phone\b|welcome\b|thank you\b)|[@]|\bwww\.|\d+[.,]\d{2}\s*$/i;
const foreignCurrency = /[€£¥₩₹]|\b(?:EUR|GBP|JPY|CAD|AUD|NZD|MXN|CHF|CNY|KRW|INR)\b|\b(?:CA|AU|NZ|HK|SG|NT)\$/i;

export function parseReceiptFields(text: string) {
  const lines = text.split("\n").map(line => line.trim()).filter(Boolean);
  const merchant = lines.slice(0, 8).find(line =>
    /\p{L}{3}/u.test(line) && !headerLabel.test(line) &&
    !addressOrMetadata.test(line),
  ) ?? "";
  const category = categoryClues.find(([, clue]) => clue.test(merchant))?.[0] ??
    categoryClues.find(([, clue]) => lines.some(line => clue.test(line)))?.[0];
  const totals = new Set<string>();
  const dueTotals = new Set<string>();
  const grandTotals = new Set<string>();
  const paidTotals = new Set<string>();
  if (!foreignCurrency.test(text)) {
    for (const [index, line] of lines.entries()) {
      const labelMatch = line.match(totalLabel);
      if (!labelMatch) continue;
      const value = line.slice(labelMatch[0].length) || lines[index + 1] || "";
      const match = value.match(receiptMoney);
      if (!match) continue;
      const label = labelMatch[1].toLowerCase();
      const target = /paid|charged/.test(label) ? paidTotals : label.startsWith("grand") ? grandTotals : /due/.test(label) ? dueTotals : totals;
      target.add(match[1].replace(/[,\s]/g, ""));
    }
  }
  const candidates = [paidTotals, grandTotals, dueTotals, totals].find(values => values.size) ?? totals;
  return {
    purpose: merchant,
    amount: candidates.size === 1 ? [...candidates][0] : "",
    category,
    needsManualAmount: foreignCurrency.test(text) || candidates.size > 1,
  };
}
