/** Public reference rates only: no trip details, account data, or amounts leave the browser. */
const DAY_MS = 24 * 60 * 60 * 1000;
export const RATE_TTL_MS = 7 * DAY_MS;
// Allow a weekly refresh cycle plus a week of clearly labeled outage fallback.
export const MAX_RATE_AGE_MS = 14 * DAY_MS;
const CACHE_PREFIX = "stir-crazy-exchange-v1:";
export const CURRENCIES = {
  USD: "US dollar",
  KRW: "South Korean won",
  EUR: "Euro",
  GBP: "British pound",
  JPY: "Japanese yen",
  TWD: "New Taiwan dollar",
  CAD: "Canadian dollar",
  AUD: "Australian dollar",
  NZD: "New Zealand dollar",
  CHF: "Swiss franc",
  CNY: "Chinese yuan",
  HKD: "Hong Kong dollar",
  SGD: "Singapore dollar",
  THB: "Thai baht",
  VND: "Vietnamese dong",
  PHP: "Philippine peso",
  MYR: "Malaysian ringgit",
  IDR: "Indonesian rupiah",
  INR: "Indian rupee",
  MXN: "Mexican peso",
  BRL: "Brazilian real",
  COP: "Colombian peso",
  CLP: "Chilean peso",
  PEN: "Peruvian sol",
  CRC: "Costa Rican colon",
  SEK: "Swedish krona",
  NOK: "Norwegian krone",
  DKK: "Danish krone",
  ISK: "Icelandic krona",
  PLN: "Polish zloty",
  CZK: "Czech koruna",
  HUF: "Hungarian forint",
  TRY: "Turkish lira",
  ZAR: "South African rand",
  AED: "UAE dirham",
  SAR: "Saudi riyal",
  ILS: "Israeli new shekel",
} as const;
export type Currency = keyof typeof CURRENCIES;
export type ExchangeRate = {
  base: Currency;
  quote: Currency;
  rate: number;
  date: string;
  checkedAt: number;
};

/** Validate upstream and cached data before using it for any calculation. */
export function parseRate(
  data: unknown,
  base: Currency,
  quote: Currency,
  now: number,
): ExchangeRate {
  if (!data || typeof data !== "object")
    throw new Error("Invalid rate response");
  const row = data as Record<string, unknown>;
  const date = typeof row.date === "string" ? row.date : "";
  const timestamp = Date.parse(`${date}T00:00:00Z`);
  if (
    row.base !== base ||
    row.quote !== quote ||
    typeof row.rate !== "number" ||
    !Number.isFinite(row.rate) ||
    row.rate <= 0 ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== date ||
    timestamp > now + 2 * DAY_MS ||
    now - timestamp > MAX_RATE_AGE_MS
  ) {
    throw new Error("Invalid or outdated exchange rate");
  }
  return { base, quote, rate: row.rate, date, checkedAt: now };
}

export function cachedRate(
  base: Currency,
  quote: Currency,
  now = Date.now(),
): ExchangeRate | null {
  try {
    const raw = JSON.parse(
      localStorage.getItem(`${CACHE_PREFIX}${base}:${quote}`) || "null",
    );
    if (
      !raw ||
      typeof raw.checkedAt !== "number" ||
      !Number.isFinite(raw.checkedAt) ||
      raw.checkedAt > now ||
      now - raw.checkedAt > MAX_RATE_AGE_MS
    )
      return null;
    return { ...parseRate(raw, base, quote, now), checkedAt: raw.checkedAt };
  } catch {
    // Private browsing, disabled storage, or corrupt caches must not stop a live lookup.
    return null;
  }
}

export async function getExchangeRate(
  base: Currency,
  quote: Currency,
  signal: AbortSignal,
  force = false,
): Promise<ExchangeRate> {
  const cached = cachedRate(base, quote);
  if (!force && cached && Date.now() - cached.checkedAt < RATE_TTL_MS)
    return cached;
  const response = await fetch(
    `https://api.frankfurter.dev/v2/rate/${base}/${quote}`,
    {
      signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      credentials: "omit",
      cache: "no-cache",
      referrerPolicy: "no-referrer",
    },
  );
  if (!response.ok) throw new Error("Exchange rates unavailable");
  const result = parseRate(await response.json(), base, quote, Date.now());
  try {
    localStorage.setItem(
      `${CACHE_PREFIX}${base}:${quote}`,
      JSON.stringify(result),
    );
  } catch {
    /* Live conversion still works without a cache. */
  }
  return result;
}

/** Amounts are decimal currency units, not the integer cents used by the USD ledger. */
export function parseConversionAmount(value: string): number | null {
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 && amount <= 1_000_000_000_000
    ? amount
    : null;
}

export function formatCurrency(amount: number, currency: Currency): string {
  // Intl applies each currency's minor units (e.g. won and yen have no decimals).
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    currencyDisplay: "code",
  }).format(amount);
}
