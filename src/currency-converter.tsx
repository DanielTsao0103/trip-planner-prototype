import React, { useEffect, useRef, useState } from "react";
import { ArrowLeftRight, RefreshCw } from "lucide-react";
import { Button, Field } from "./ui";
import {
  cachedRate,
  CURRENCIES,
  formatCurrency,
  getExchangeRate,
  MAX_RATE_AGE_MS,
  RATE_TTL_MS,
  parseConversionAmount,
  type Currency,
  type ExchangeRate,
} from "./exchange-rates";

type RateState = {
  base: Currency;
  quote: Currency;
  rate: ExchangeRate | null;
  loading: boolean;
  failed: boolean;
};

export function CurrencyConverter() {
  const [from, setFrom] = useState<Currency>("USD");
  const [to, setTo] = useState<Currency>("KRW");
  const [amount, setAmount] = useState("100");
  const [refresh, setRefresh] = useState(0);
  const handledRefresh = useRef(0);
  const [state, setState] = useState<RateState | null>(null);
  const same = from === to;

  useEffect(() => {
    if (from === to) return;
    const controller = new AbortController();
    let busy = false;
    let timer: number | undefined;
    async function load(force = false) {
      if (busy || controller.signal.aborted) return;
      busy = true;
      window.clearTimeout(timer);
      let nextCheck = Date.now() + RATE_TTL_MS;
      setState({
        base: from,
        quote: to,
        rate: cachedRate(from, to),
        loading: true,
        failed: false,
      });
      try {
        const rate = await getExchangeRate(from, to, controller.signal, force);
        nextCheck = rate.checkedAt + RATE_TTL_MS;
        if (!controller.signal.aborted)
          setState({
            base: from,
            quote: to,
            rate,
            loading: false,
            failed: false,
          });
      } catch {
        if (!controller.signal.aborted)
          setState({
            base: from,
            quote: to,
            rate: cachedRate(from, to),
            loading: false,
            failed: true,
          });
      } finally {
        busy = false;
        if (!controller.signal.aborted) {
          timer = window.setTimeout(
            onFocus,
            Math.max(1000, nextCheck - Date.now()),
          );
        }
      }
    }
    function onFocus() {
      if (document.visibilityState === "visible") void load();
    }
    const onOnline = () => {
      void load();
    };
    // Only an explicit Refresh click bypasses the weekly cache.
    const force = refresh !== handledRefresh.current;
    handledRefresh.current = refresh;
    void load(force);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [from, to, refresh]);

  // Never show the previous pair's response while a new request is in flight.
  const current = state?.base === from && state.quote === to ? state : null;
  const rate =
    current?.rate &&
    Date.now() - Date.parse(`${current.rate.date}T00:00:00Z`) <= MAX_RATE_AGE_MS
      ? current.rate
      : null;
  const parsed = parseConversionAmount(amount);
  const converted =
    parsed === null ? null : same ? parsed : rate ? parsed * rate.rate : null;
  const validResult =
    converted !== null &&
    Number.isFinite(converted) &&
    converted <= Number.MAX_SAFE_INTEGER;
  const invalidAmount = amount !== "" && parsed === null;
  const loading = !same && (!current || current.loading);
  const options = Object.entries(CURRENCIES).map(([code, name]) => (
    <option key={code} value={code}>
      {code} — {name}
    </option>
  ));

  return (
    <section
      className="card currency-converter"
      aria-labelledby="currency-heading"
    >
      <div className="currency-heading">
        <div>
          <h2 id="currency-heading">Currency converter</h2>
          <p>A quick estimate for spending abroad.</p>
        </div>
        <Button
          variant="outline small"
          disabled={same || loading}
          onClick={() => setRefresh((value) => value + 1)}
        >
          <RefreshCw size={15} aria-hidden="true" />
          Refresh rates
        </Button>
      </div>
      <div className="currency-fields">
        <Field label="Amount to convert">
          <input
            inputMode="decimal"
            value={amount}
            maxLength={24}
            onChange={(event) => setAmount(event.target.value)}
            aria-invalid={invalidAmount}
            aria-describedby={
              invalidAmount ? "currency-amount-error" : undefined
            }
          />
        </Field>
        <Field label="From currency">
          <select
            value={from}
            onChange={(event) => setFrom(event.target.value as Currency)}
          >
            {options}
          </select>
        </Field>
        <Button
          variant="outline currency-swap"
          aria-label="Swap currencies"
          onClick={() => {
            setFrom(to);
            setTo(from);
          }}
        >
          <ArrowLeftRight size={18} aria-hidden="true" />
        </Button>
        <Field label="To currency">
          <select
            value={to}
            onChange={(event) => setTo(event.target.value as Currency)}
          >
            {options}
          </select>
        </Field>
      </div>
      {invalidAmount && (
        <p id="currency-amount-error" role="alert">
          Enter an amount from 0 to 1 trillion, using a decimal point and no
          commas.
        </p>
      )}
      <div
        className="currency-result"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <strong>
          {validResult
            ? formatCurrency(converted!, to)
            : loading
              ? "Loading exchange rate…"
              : "—"}
        </strong>
        {same ? (
          <p>
            Same currency: 1 {from} = 1 {to}.
          </p>
        ) : (
          <>
            {rate && (
              <p>
                1 {from} ={" "}
                {new Intl.NumberFormat("en-US", {
                  maximumSignificantDigits: 7,
                }).format(rate.rate)}{" "}
                {to} · Rate date: <time dateTime={rate.date}>{rate.date}</time>
              </p>
            )}
            {rate && (
              <p>Last checked: {new Date(rate.checkedAt).toLocaleString()}</p>
            )}
            {loading && rate && <p>Checking for updated rates…</p>}
            {current?.failed && (
              <p>
                {rate
                  ? "Couldn’t refresh. Showing a saved rate; it may be out of date."
                  : "Exchange rates are unavailable. Connect to the internet and try Refresh rates."}
              </p>
            )}
            {rate &&
              Date.now() - Date.parse(`${rate.date}T00:00:00Z`) >
                RATE_TTL_MS && (
                <p>
                  This rate is more than a week old. Refresh rates for the
                  latest available estimate.
                </p>
              )}
            {parsed !== null && converted !== null && !validResult && (
              <p>This conversion is too large. Enter a smaller amount.</p>
            )}
          </>
        )}
      </div>
      <p className="currency-note">
        Reference rates via{" "}
        <a href="https://frankfurter.dev/" target="_blank" rel="noreferrer">
          Frankfurter
        </a>
        . Automatically refreshed weekly when you use this page. Rates may pause
        on weekends and holidays; card and bank fees may differ. Your budget and
        saved expenses stay in USD.
      </p>
    </section>
  );
}
