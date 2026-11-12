import { useLayoutEffect, type RefObject } from "react";

/** Keep a focused itinerary item clear of the notice as its text wraps. */
export function useRecoveryClearance(ref: RefObject<HTMLDivElement | null>, visible: boolean) {
  useLayoutEffect(() => {
    const banner = ref.current;
    if (!visible || !banner) return;
    const root = document.documentElement;
    let frame = 0;
    const measure = () => {
      const sticky = getComputedStyle(banner).position === "sticky";
      root.style.setProperty("--trip-recovery-height", `${sticky ? banner.getBoundingClientRect().height : 0}px`);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!sticky) return;
        const focused = document.activeElement;
        const item = focused instanceof HTMLElement && focused.closest<HTMLElement>('[id^="itinerary-event-"], [id^="day-event-"], .day-section');
        if (!item) return;
        const clearance = item.getBoundingClientRect().top - banner.getBoundingClientRect().bottom - 12;
        if (clearance < 0) window.scrollBy({top: clearance, behavior: "instant"});
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(banner);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      cancelAnimationFrame(frame);
      root.style.removeProperty("--trip-recovery-height");
    };
  }, [ref, visible]);
}
