import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeftRight, ChevronDown } from "lucide-react";
import { Button, Field } from "./ui";
import {
  cachedRate,
  CURRENCIES,
  formatCurrency,
  getExchangeRate,
  MAX_RATE_AGE_MS,
  OutdatedExchangeRateError,
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
  outdatedDate?: string;
};

export function CurrencyConverter({
  expanded,
  onExpandedChange,
  jumpRequest,
}: {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  jumpRequest: number;
}) {
  const [visited, setVisited] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  // Measure after expansion commits; scrolling the collapsed height can stop too early.
  useLayoutEffect(() => {
    if (!expanded) return;
    toggleRef.current?.focus({ preventScroll: true });
    toggleRef.current?.scrollIntoView({ behavior: "instant", block: "start" });
  }, [expanded, jumpRequest]);
  useEffect(() => {
    if (expanded) setVisited(true);
  }, [expanded]);
  return (
    <section
      className="card currency-converter"
      aria-labelledby="currency-heading"
    >
      <h2 id="currency-heading" className="currency-disclosure-heading">
        <button
          ref={toggleRef}
          type="button"
          className="currency-disclosure"
          aria-expanded={expanded}
          aria-controls="currency-content"
          onClick={() => {
            setVisited(true);
            onExpandedChange(!expanded);
          }}
        >
          <ArrowLeftRight size={20} aria-hidden="true" />
          <span>
            Currency converter
            <small>Estimate a purchase in another currency</small>
          </span>
          <ChevronDown size={18} aria-hidden="true" />
        </button>
      </h2>
      <div id="currency-content" hidden={!expanded}>
        {(visited || expanded) && <CurrencyCalculator />}
      </div>
    </section>
  );
}

function CurrencyCalculator() {
  const [from, setFrom] = useState<Currency>("USD");
  const [to, setTo] = useState<Currency>("KRW");
  const [amount, setAmount] = useState("100");
  const [refresh, setRefresh] = useState(0);
  const handledRefresh = useRef(0);
  const output = useRef<HTMLDivElement>(null);
  const revealResult = useRef(true);
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
      } catch (error) {
        if (!controller.signal.aborted)
          setState({
            base: from,
            quote: to,
            rate: cachedRate(from, to),
            loading: false,
            failed: true,
            outdatedDate:
              error instanceof OutdatedExchangeRateError ? error.date : undefined,
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
  useLayoutEffect(() => {
    if (loading || !revealResult.current) return;
    revealResult.current = false;
    const result = output.current;
    if (!result || !result.getClientRects().length) return;
    const box = result.getBoundingClientRect();
    // Reveal user-requested feedback only while this result is on screen.
    // Weekly refreshes and responses after scrolling away must not move the page.
    if (box.bottom <= 0 || box.top >= window.innerHeight) return;
    const navigation = document.querySelector<HTMLElement>(".mobile-nav");
    const bottom = navigation?.getClientRects().length
      ? navigation.getBoundingClientRect().top : window.innerHeight;
    if (box.top < 16 || box.bottom > bottom - 16)
      result.scrollIntoView({ block: "center", behavior: "instant" });
  }, [loading, current?.failed, from, to]);

  const options = Object.entries(CURRENCIES).map(([code, name]) => (
    <option key={code} value={code}>
      {code} — {name}
    </option>
  ));

  return (
    <div className="currency-calculator">
      <div className="currency-heading">
        <div>
          <p>Your budget and saved expenses stay in USD.</p>
        </div>
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
            onChange={(event) => { revealResult.current = true; setFrom(event.target.value as Currency); }}
          >
            {options}
          </select>
        </Field>
        <Button
          variant="outline currency-swap"
          aria-label="Swap currencies"
          onClick={() => {
            revealResult.current = true;
            setFrom(to);
            setTo(from);
          }}
        >
          <ArrowLeftRight size={18} aria-hidden="true" />
        </Button>
        <Field label="To currency">
          <select
            value={to}
            onChange={(event) => { revealResult.current = true; setTo(event.target.value as Currency); }}
          >
            {options}
          </select>
        </Field>
      </div>
      {invalidAmount && (
        <p
          id="currency-amount-error"
          className="error currency-error"
          role="alert"
        >
          {Number(amount) < 0
            ? "Enter zero or a positive amount."
            : "Enter a number up to 1 trillion, using a decimal point and no commas."}
        </p>
      )}
      <div className="currency-output" ref={output}>
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
                  {rate.rate < 0.01 ? "1,000" : "1"} {from} ≈{" "}
                  {new Intl.NumberFormat("en-US", {
                    maximumFractionDigits: 4,
                  }).format(rate.rate * (rate.rate < 0.01 ? 1000 : 1))}{" "}
                  {to} · Rate date: <time dateTime={rate.date}>{rate.date}</time>
                </p>
              )}

              {loading && rate && <p>Checking for updated rates…</p>}
              {current?.failed && (
                <p className="currency-warning">
                  {current.outdatedDate ? (
                    <>
                      Rate dated {current.outdatedDate} is too old to use.{" "}
                      {rate ? "Showing a saved rate instead." : "Refresh to try again."}
                    </>
                  ) : rate
                    ? "Couldn’t refresh. Showing a saved rate; it may be out of date."
                    : "Exchange rates are unavailable. Try Refresh rates again in a moment."}
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
        <Button
          variant="outline small currency-refresh"
          aria-label="Refresh rates"
          disabled={same || loading}
          onClick={() => { revealResult.current = true; setRefresh((value) => value + 1); }}
        >
          Refresh
        </Button>
      </div>
      <div className="currency-note">
        <span>Weekly reference rates · Bank fees may differ.</span>
        <details className="currency-details">
          <summary>Rate details</summary>
          <p>
            Source:{" "}
            <a href="https://frankfurter.dev/" target="_blank" rel="noreferrer">
              Frankfurter
            </a>
            . Rates may pause on weekends and holidays.
          </p>
          {rate && (
            <p>Last checked: {new Date(rate.checkedAt).toLocaleString()}</p>
          )}
        </details>
      </div>
    </div>
  );
}
