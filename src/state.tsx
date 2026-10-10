import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { demoStorageKey, loadDemoStore, type DemoAccount } from "./demo-store";
import { type Store, type Trip, type User, isActive, member } from "./domain";
export type Route = { page: number; params: URLSearchParams };
export type Overlay = { kind: string; data?: any } | null;
type Context = {
  s: Store;
  signOut: () => Promise<void>;
  mutate: (fn: (s: Store) => void) => void;
  trip: Trip | undefined;
  user: User | undefined;
  route: Route;
  go: (page: number, params?: Record<string, string>) => void;
  tripGo: (page: number) => void;
  open: (kind: string, data?: any) => void;
  close: () => void;
  overlay: Overlay;
  toast: (message: string) => void;
  updateTrip: (fn: (t: Trip) => void) => void;
  login: (id: string) => void;
  explore: () => void;
  returnFromSample: () => void;
};
const C = createContext<Context>(null!);
export const useApp = () => useContext(C);
function readRoute(): Route {
  const [path, query] = location.hash.replace(/^#\/?/, "").split("?");
  return { page: Number(path) || 1, params: new URLSearchParams(query) };
}
export function Provider({ children, account, onSignOut, initialTripId }: {
  children: ReactNode;
  account: DemoAccount;
  initialTripId?: string;
  onSignOut: () => Promise<void>;
}) {
  const [s, setS] = useState(() => {
    const saved = loadDemoStore(account, { getItem: key => window.localStorage.getItem(key) });
    // First-time demo visitors open the sample; existing local work survives refresh.
    if (!saved.tripId && initialTripId) saved.tripId = initialTripId;
    return saved;
  });
  const [route, setRoute] = useState(readRoute);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [message, setMessage] = useState("");
  const go = (page: number, params: Record<string, string> = {}) => {
    location.hash = `/${page}${Object.keys(params).length ? "?" + new URLSearchParams(params) : ""}`;
    setOverlay(null);
    window.scrollTo(0, 0);
  };
  const mutate = (fn: (s: Store) => void) =>
    setS((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  const user = s.users.find((u) => u.id === s.userId);
  const trip = s.trips.find((t) => t.id === s.tripId && member(t, s.userId));
  useEffect(() => {
    const handler = () => {
      setRoute(readRoute());
      setOverlay(null);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", handler);
    // A successful login opens Home directly. Refreshing a demo route keeps that route.
    if (readRoute().page === 1) go(4);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  useEffect(() => {
    try { localStorage.setItem(demoStorageKey(account.id), JSON.stringify(s)); }
    catch { setMessage("Browser storage is unavailable. Demo changes will last until this page closes."); }
  }, [s, account.id]);
  useEffect(() => {
    if (message) {
      const id = setTimeout(() => setMessage(""), 5000);
      return () => clearTimeout(id);
    }
  }, [message]);
  const login = (id: string) => {
    mutate((v) => {
      v.userId = id;
      delete v.sampleReturn;
    });
    const active = s.trips.filter((t) => member(t, id) && isActive(t, s.date));
    if (active.length === 1) {
      mutate((v) => (v.tripId = active[0].id));
      go(10);
    } else {
      go(4);
      if (active.length > 1)
        setOverlay({
          kind: "tripPicker",
          data: { target: 10, activeOnly: true },
        });
    }
  };
  const value: Context = {
    s,
    signOut: async () => {
      try { await onSignOut(); }
      catch { setMessage("Could not sign out. Please try again."); }
    },
    mutate,
    trip,
    user,
    route,
    go,
    tripGo: (page) =>
      trip
        ? go(page)
        : setOverlay({ kind: "tripPicker", data: { target: page } }),
    overlay,
    open: (kind, data) => setOverlay({ kind, data }),
    close: () => setOverlay(null),
    toast: setMessage,
    updateTrip: (fn) =>
      mutate((v) => {
        const t = v.trips.find((t) => t.id === v.tripId);
        if (t) fn(t);
      }),
    login,
    explore: () => {
      setMessage("");
      mutate((v) => {
        if (v.userId && v.userId !== "maya")
          v.sampleReturn = { userId: v.userId, tripId: v.tripId };
        v.userId = "maya";
        v.tripId = "seattle";
      });
      go(8);
    },
    returnFromSample: () => {
      if (!s.sampleReturn) return;
      mutate((v) => {
        v.userId = v.sampleReturn!.userId;
        v.tripId = v.sampleReturn!.tripId;
        delete v.sampleReturn;
      });
      go(5);
      setMessage("Back to your trips. Everything is just as you left it.");
    },
  };
  return (
    <C.Provider value={value}>
      {children}
      {message && (
        <div className="toast" role="status">
          {message}
          <button aria-label="Dismiss message" onClick={() => setMessage("")}>
            ×
          </button>
        </div>
      )}
    </C.Provider>
  );
}
