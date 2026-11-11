import test from "node:test";
import assert from "node:assert/strict";
import {
  cachedRate,
  formatCurrency,
  getExchangeRate,
  MAX_RATE_AGE_MS,
  parseConversionAmount,
  parseRate,
  RATE_TTL_MS,
} from "./exchange-rates.ts";
const now = Date.parse("2026-11-11T12:00:00Z");
const valid = { base: "USD", quote: "KRW", rate: 1344.29, date: "2026-11-11" };

test("validates rate identity, positivity, dates and maximum age", () => {
  assert.equal(parseRate(valid, "USD", "KRW", now).rate * 100, 134429);
  for (const patch of [
    { base: "EUR" },
    { quote: "JPY" },
    { rate: 0 },
    { rate: -1 },
    { rate: Infinity },
    { rate: "1344" },
    { date: "2026-02-30" },
    { date: "2026-11-01" },
    { date: "2027-11-11" },
  ]) {
    assert.throws(() => parseRate({ ...valid, ...patch }, "USD", "KRW", now));
  }
  assert.throws(() => parseRate(null, "USD", "KRW", now));
  // Friday's publication is still useful on Sunday; next-day publications are supported.
  assert.equal(
    parseRate(
      { ...valid, date: "2026-11-06" },
      "USD",
      "KRW",
      Date.parse("2026-11-08T12:00:00Z"),
    ).date,
    "2026-11-06",
  );
  assert.equal(
    parseRate({ ...valid, date: "2026-11-12" }, "USD", "KRW", now).date,
    "2026-11-12",
  );
});

test("amount validation preserves zero and decimals without accepting misleading input", () => {
  for (const input of [
    "",
    " ",
    "-1",
    "1,000",
    "1e3",
    "Infinity",
    "NaN",
    "1000000000001",
    "1.2.3",
  ])
    assert.equal(parseConversionAmount(input), null);
  assert.equal(parseConversionAmount("0"), 0);
  assert.equal(parseConversionAmount(".25"), 0.25);
  assert.equal(parseConversionAmount("123.45"), 123.45);
  assert.match(formatCurrency(134429.25, "KRW"), /134,429$/);
  assert.match(formatCurrency(12.345, "USD"), /12\.35$/);
});

test("rate cache expires, validates stored data and survives blocked storage", async (t) => {
  const values = new Map<string, string>();
  const now = Date.now();
  const current = { ...valid, date: new Date(now).toISOString().slice(0, 10) };
  const originalStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  t.after(() => {
    if (originalStorage)
      Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    } as Storage,
  });
  const fetchMock = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(JSON.stringify(current)),
  );
  const signal = new AbortController().signal;
  await getExchangeRate("USD", "KRW", signal);
  await getExchangeRate("USD", "KRW", signal);
  assert.equal(fetchMock.mock.callCount(), 1);
  await getExchangeRate("USD", "KRW", signal, true);
  assert.equal(fetchMock.mock.callCount(), 2);
  assert.equal(cachedRate("USD", "KRW", now + MAX_RATE_AGE_MS), null);
  const key = "stir-crazy-exchange-v1:USD:KRW";
  values.set(key, JSON.stringify({ ...current, checkedAt: now - RATE_TTL_MS }));
  await getExchangeRate("USD", "KRW", signal);
  assert.equal(fetchMock.mock.callCount(), 3);
  values.set(key, JSON.stringify({ ...current, checkedAt: now + 60000 }));
  assert.equal(cachedRate("USD", "KRW"), null);
  values.set(key, "not json");
  assert.equal(cachedRate("USD", "KRW"), null);
  t.mock.method(globalThis.localStorage, "setItem", () => {
    throw new Error("blocked");
  });
  assert.equal((await getExchangeRate("USD", "KRW", signal)).rate, valid.rate);
  fetchMock.mock.mockImplementation(
    async () => new Response("{}", { status: 429 }),
  );
  await assert.rejects(getExchangeRate("USD", "KRW", signal, true));
});
