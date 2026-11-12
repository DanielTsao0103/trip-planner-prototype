import { useEffect, useRef, useState } from "react";
import { Button } from "./ui";
import "./place-popular-times.css";

type Status = "loading" | "ready" | "empty" | "error";

/** Keep Google's chart and attribution intact; do not copy or store busyness data. */
function PopularTimesChart({ place, googlePlaceId, destinations }: {
  place: string;
  googlePlaceId?: string | null;
  destinations: string[];
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(350);
  const content = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [attempt, setAttempt] = useState(0);
  // Trip refreshes can replace the array without changing the search geography.
  const destinationKey = JSON.stringify(destinations);

  useEffect(() => {
    if (status === "loading") return;
    const frame = requestAnimationFrame(() => {
      const feedback = content.current;
      const disclosure = feedback?.closest("details");
      // Reveal async feedback only while focus remains on this tool. A traveler
      // who has moved on to another field should keep their scroll position.
      if (!feedback || !disclosure?.open || !disclosure.contains(document.activeElement)) return;
      const actions = feedback.closest("form")?.querySelector<HTMLElement>("[data-fixed-actions]");
      const bottom = actions && ["fixed", "sticky"].includes(getComputedStyle(actions).position)
        ? Math.min(actions.getBoundingClientRect().top, window.innerHeight) : window.innerHeight;
      const overflow = feedback.getBoundingClientRect().bottom - bottom + 16;
      if (overflow > 0) window.scrollBy({ top: overflow, behavior: "instant" });
    });
    return () => cancelAnimationFrame(frame);
  }, [status, height]);

  const sendTheme = () => {
    const style = getComputedStyle(document.documentElement);
    const values = Object.fromEntries(["--paper", "--ink", "--muted", "--green", "--action-ink", "--line"].map(name => [name, style.getPropertyValue(name)]));
    frame.current?.contentWindow?.postMessage({ type: "trip-popular-times:theme", values, colorScheme: style.colorScheme }, location.origin);
  };

  useEffect(() => {
    let settled = false;
    setStatus("loading");
    setHeight(350);
    const finish = (next: Status) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      setStatus(next);
    };
    const timeout = window.setTimeout(() => finish("error"), 20000);
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow) return;
      const data = event.data;
      if (data?.type === "trip-popular-times:status" && ["ready", "empty", "error"].includes(data.status)) finish(data.status);
      if (data?.type === "trip-popular-times:resize" && Number.isFinite(data.height) && data.height > 0)
        setHeight(Math.max(64, Math.min(1200, data.height)));
    };
    window.addEventListener("message", receive);
    const theme = new MutationObserver(sendTheme);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
    return () => {
      settled = true;
      clearTimeout(timeout);
      window.removeEventListener("message", receive);
      theme.disconnect();
    };
  }, [place, googlePlaceId, destinationKey, attempt]);

  return <div ref={content}>
    <div role="status" aria-live="polite" className="popular-times-status">
      {status === "loading" && "Loading popular times…"}
      {status === "empty" && "Popular times aren’t available for this location."}
      {status === "error" && "Popular times couldn’t load right now. You can still save your event."}
    </div>
    {(status === "loading" || status === "ready") && <iframe
      key={attempt}
      ref={frame}
      className="popular-times-frame"
      title="Google popular times"
      src={`${import.meta.env.BASE_URL}popular-times.html`}
      style={{ height }}
      onLoad={() => {
        sendTheme();
        frame.current?.contentWindow?.postMessage({ type: "trip-popular-times:init", place, googlePlaceId, destinations }, location.origin);
      }}
    />}
    {status === "ready" && <p className="fine-print">Typical weekly patterns, not a forecast for your trip date. Times are local to this place.</p>}
    {status === "error" && <Button variant="outline" onClick={() => setAttempt(value => value + 1)}>Retry popular times</Button>}
  </div>;
}

/** Mount on first expansion so typing and unrelated form edits don't incur queries. */
export function PlacePopularTimes(props: {
  place: string;
  googlePlaceId?: string | null;
  destinations: string[];
}) {
  const [requested, setRequested] = useState(false);
  return <details className="place-popular-times" onToggle={event => {
    if (event.currentTarget.open) setRequested(true);
  }}>
    <summary>Popular times</summary>
    {requested && <PopularTimesChart {...props} />}
  </details>;
}
