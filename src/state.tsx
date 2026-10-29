import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { demoStorageKey, loadDemoStore, type DemoAccount } from "./demo-store";
import { type Store, type Trip, type User, isActive, member } from "./domain";
import { TripSaveQueue, type PendingTrip } from "./trip-save-queue";
import { getSupabase } from "./supabase";
import {
  loadAccountTrips,
  saveAccountTrip,
  deleteAccountTrip,
  tripFromRow,
} from "./account-trips";
export type Route = { page: number; params: URLSearchParams };
export type Overlay = { kind: string; data?: any } | null;
type Context = {
  s: Store;
  accountTrips: boolean;
  pendingTripIds: string[];
  saveTrip: (trip: Trip) => Promise<void>;
  deleteTrip: (trip: Trip) => Promise<void>;
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
export function Provider({
  children,
  account,
  onSignOut,
  initialTripId,
  cloud = false,
}: {
  children: ReactNode;
  account: DemoAccount;
  cloud?: boolean;
  initialTripId?: string;
  onSignOut: () => Promise<void>;
}) {
  const [s, setS] = useState(() => {
    const saved = loadDemoStore(account, {
      getItem: (key) => window.localStorage.getItem(key),
    });
    // First-time demo visitors open the sample; existing local work survives refresh.
    if (!saved.tripId && initialTripId) saved.tripId = initialTripId;
    if (cloud) {
      // A matching email in a fictional fixture is never proof of account ownership.
      if (!saved.users.some((u) => u.id === account.id))
        saved.users.push({ ...account, connections: {} });
      saved.userId = account.id;
      delete saved.sampleReturn;
      const now = new Date();
      saved.date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      saved.time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    }
    return saved;
  });
  const stateRef = useRef(s);
  const legacyTrips = useRef(s.trips);
  const recoveryKey = `trip-planner-pending-v1:${account.id}`;
  const [, setSaveTick] = useState(0);
  const queueRef = useRef<TripSaveQueue | null>(null);
  const commit = (next: Store) => {
    stateRef.current = next;
    setS(next);
  };
  if (!queueRef.current)
    queueRef.current = new TripSaveQueue(
      (draft) => saveAccountTrip(getSupabase(), account, draft),
      () => {
        if (!mounted.current) return;
        setSaveTick((n) => n + 1);
        try {
          const drafts = [...queueRef.current!.pending.values()].map(
            (entry) => ({ draft: entry.draft, retryDraft: entry.retryDraft }),
          );
          if (drafts.length)
            localStorage.setItem(recoveryKey, JSON.stringify(drafts));
          else localStorage.removeItem(recoveryKey);
        } catch {
          /* The persistent unsaved banner and unload guard remain active. */
        }
      },
      (saved, newer) => {
        if (!mounted.current) return;
        const current = stateRef.current;
        commit({
          ...current,
          trips: current.trips.map((t) =>
            t.id === saved.id
              ? newer
                ? { ...t, revision: saved.revision }
                : saved
              : t,
          ),
        });
      },
    );
  const queue = queueRef.current;
  const pending = [...queue.pending.values()];
  const saveError = pending.find((entry) => entry.error)?.error;
  const [loadState, setLoadState] = useState(cloud ? "loading" : "ready");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      queue.stop();
    };
  }, []);
  useEffect(() => {
    if (!cloud) return;
    let active = true;
    setLoadState("loading");
    void loadAccountTrips(getSupabase(), account.id)
      .then((rows) => {
        if (!active) return;
        const previous = stateRef.current;
        const restored = rows.map((row) =>
          tripFromRow(
            row,
            account,
            legacyTrips.current.find((t) => t.id === row.tripID),
          ),
        );
        let recovered: (Trip | Pick<PendingTrip, "draft" | "retryDraft">)[] =
          [];
        try {
          recovered = JSON.parse(localStorage.getItem(recoveryKey) || "[]");
        } catch {
          /* Ignore unreadable recovery storage. */
        }
        if (!Array.isArray(recovered)) recovered = [];
        for (const entry of recovered) {
          if (!entry || typeof entry !== "object") continue;
          const draft = "draft" in entry ? entry.draft : entry;
          if (
            !draft?.id ||
            !Array.isArray(draft.members) ||
            !draft.members.some(
              (m) => m.id === account.id && m.role === "Owner",
            )
          )
            continue;
          queue.restore(draft, "draft" in entry ? entry.retryDraft : undefined);
          const index = restored.findIndex((t) => t.id === draft.id);
          if (index < 0) restored.push(draft);
          else restored[index] = draft;
        }
        commit({
          ...previous,
          trips: [
            ...previous.trips.filter(
              (t) =>
                t.persistence !== "account" &&
                !restored.some((r) => r.id === t.id),
            ),
            ...restored,
          ],
        });
        // Import only this account's existing browser plans for a server-owned trip.
        // Unassigned sample trips and fictional email matches are never claimed.
        for (const trip of restored) {
          const old = legacyTrips.current.find((t) => t.id === trip.id);
          if (
            !queue.pending.has(trip.id) &&
            trip.contentVersion === 0 &&
            old &&
            (old.events.length ||
              old.expenses.length ||
              old.todos.length ||
              old.members.length > 1 ||
              Object.keys(old.prefs).length ||
              old.budget !== null ||
              Object.keys(old.individual).length ||
              old.dismissed.length)
          )
            queue.enqueue(trip);
        }
        setLoadState("ready");
      })
      .catch(() => {
        if (active) setLoadState("error");
      });
    return () => {
      active = false;
    };
  }, [cloud, account.id, loadAttempt]);
  const [route, setRoute] = useState(readRoute);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [message, setMessage] = useState("");
  const go = (page: number, params: Record<string, string> = {}) => {
    location.hash = `/${page}${Object.keys(params).length ? "?" + new URLSearchParams(params) : ""}`;
    setOverlay(null);
    window.scrollTo(0, 0);
  };
  const mutate = (fn: (store: Store) => void) => {
    const previous = stateRef.current;
    const next = structuredClone(previous);
    fn(next);
    const changed: Trip[] = [];
    for (const trip of next.trips) {
      const old = previous.trips.find((t) => t.id === trip.id);
      if (
        trip.persistence !== "account" ||
        JSON.stringify(trip) === JSON.stringify(old)
      )
        continue;
      if (!cloud || previous.userId !== account.id) {
        setMessage("Return to your account before changing a saved trip.");
        return;
      }
      // Keep removed travelers for historical allocations, but hide them from active groups.
      for (const removed of old?.members ?? []) {
        if (!trip.members.some((m) => m.id === removed.id))
          trip.members.push({ ...removed, status: "removed" });
      }
      changed.push(trip);
    }
    commit(next);
    if (changed.length) setMessage("");
    changed.forEach((trip) => queue.enqueue(trip));
  };
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
    if (cloud && loadState !== "ready") return;
    try {
      // Database-backed trips are no longer a second permanent browser database.
      // Only unsaved recovery drafts (above) and standalone demo data stay local.
      localStorage.setItem(
        demoStorageKey(account.id),
        JSON.stringify(
          cloud
            ? {
                ...s,
                trips: s.trips.filter((t) => t.persistence !== "account"),
              }
            : s,
        ),
      );
    } catch {
      setMessage(
        "Browser storage is unavailable. Demo changes will last until this page closes.",
      );
    }
  }, [s, account.id, cloud, loadState]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (queue.pending.size) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [queue]);
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
    accountTrips: cloud && s.userId === account.id,
    pendingTripIds: [...queue.pending.keys()],
    saveTrip: async (draft) => {
      if (cloud && stateRef.current.userId === account.id && !draft.sample) {
        const pendingDraft = { ...draft, persistence: "account" as const };
        mutate((v) => {
          const index = v.trips.findIndex((t) => t.id === draft.id);
          if (index < 0) v.trips.push(pendingDraft);
          else v.trips[index] = pendingDraft;
          v.tripId = draft.id;
        });
        queue.retry();
        await queue.wait(draft.id);
      } else
        mutate((v) => {
          const index = v.trips.findIndex((t) => t.id === draft.id);
          if (index < 0) v.trips.push(draft);
          else v.trips[index] = draft;
          v.tripId = draft.id;
        });
      if (!mounted.current)
        throw new Error("Sign back into your account to view the result.");
    },
    deleteTrip: async (target) => {
      if (target.persistence === "account") {
        if (!cloud || stateRef.current.userId !== account.id)
          throw new Error("Return to your account to delete this trip.");
        await queue.wait(target.id);
        const latest = stateRef.current.trips.find((t) => t.id === target.id)!;
        await deleteAccountTrip(getSupabase(), account.id, latest);
      }
      if (!mounted.current)
        throw new Error("Sign back into your account to view the result.");
      const next = structuredClone(stateRef.current);
      next.trips = next.trips.filter((t) => t.id !== target.id);
      if (next.tripId === target.id) next.tripId = null;
      if (next.sampleReturn?.tripId === target.id)
        next.sampleReturn.tripId = null;
      commit(next);
    },
    signOut: async () => {
      if (
        queue.pending.size &&
        !window.confirm(
          "Some trip changes have not reached the database. Sign out and keep a recovery copy on this device?",
        )
      )
        return;
      try {
        await onSignOut();
      } catch {
        setMessage("Could not sign out. Please try again.");
      }
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
    toast: (message) => {
      if (!queue.pending.size) setMessage(message);
    },
    updateTrip: (fn) =>
      mutate((v) => {
        const t = v.trips.find((t) => t.id === v.tripId);
        if (t) fn(t);
      }),
    login,
    explore: () => {
      setMessage("");
      mutate((v) => {
        if (!v.sampleReturn && v.userId && v.userId !== "maya")
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
      {cloud &&
        loadState === "ready" &&
        (pending.length > 0 || (s.userId === account.id && route.page !== 4)) && (
          <div
            className="account-save-banner"
            role={saveError ? "alert" : "status"}
          >
            <span>
              {saveError
                ? `Not saved: ${saveError}`
                : pending.length
                  ? "Saving trip changes… Keep this page open."
                  : "All trip changes saved to your account."}
            </span>
            {saveError && (
              <>
                <button
                  className="btn outline small"
                  onClick={() => queue.retry()}
                >
                  Retry save
                </button>
                <button
                  className="btn outline small"
                  onClick={() => {
                    const blob = new Blob(
                      [
                        JSON.stringify(
                          pending.map((p) => p.draft),
                          null,
                          2,
                        ),
                      ],
                      { type: "application/json" },
                    );
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = "unsaved-trip-changes.json";
                    link.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Download unsaved copy
                </button>
                <button
                  className="btn outline small"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Discard unsaved changes and reload the database version? Download your unsaved copy first if you want to keep it.",
                      )
                    ) {
                      queue.pending.clear();
                      localStorage.removeItem(recoveryKey);
                      location.reload();
                    }
                  }}
                >
                  Reload saved version
                </button>
              </>
            )}
          </div>
        )}
      {loadState === "ready" ? (
        children
      ) : (
        <main className="narrow-page" aria-busy={loadState === "loading"}>
          <h1>
            {loadState === "loading"
              ? "Loading your trips…"
              : "Couldn’t load your trips"}
          </h1>
          {loadState === "error" && (
            <>
              <p role="alert">
                Check your connection and try again. Your saved trips have not
                been changed.
              </p>
              <button
                className="btn"
                onClick={() => setLoadAttempt((n) => n + 1)}
              >
                Try again
              </button>
            </>
          )}
          <button className="btn outline" onClick={() => void value.signOut()}>
            Log out
          </button>
        </main>
      )}
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
