import { useEffect, useState } from "react";

/** Offer a safe refresh for tabs left open through a deployment. Never discard a form automatically. */
export function ReleaseNotice() {
  const [available, setAvailable] = useState("");
  useEffect(() => {
    const current = import.meta.env.VITE_BUILD_SHA;
    if (!current) return;
    let active = true;
    let checking = false;
    const check = async () => {
      if (checking || document.visibilityState === "hidden") return;
      checking = true;
      try {
        const url = new URL(`${import.meta.env.BASE_URL}version.json`, location.origin);
        url.searchParams.set("check", String(Date.now()));
        const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
        if (!response.ok) return;
        const version: { commit?: string } = await response.json();
        if (active && version.commit && /^[a-f0-9]{40}$/.test(version.commit) && version.commit !== current) setAvailable(version.commit);
      } catch { /* Offline users can keep using their local demo. */ }
      finally { checking = false; }
    };
    void check();
    const interval = window.setInterval(() => { void check(); }, 60000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return available ? <aside className="release-notice" role="status">
    <span>A new version is ready. Finish any unsaved edits, then reload.</span>
    <button type="button" onClick={() => {
      // A release-specific URL avoids reusing a cached HTML document; keep the current route.
      const url = new URL(location.href);
      url.searchParams.set("release", available);
      location.replace(url.href);
    }}>Reload app</button>
  </aside> : null;
}
