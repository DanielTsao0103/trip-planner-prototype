import { sharedChangeError } from "./trip-permissions";
import { useAccountTripSync } from "./account-trip-sync";
import { useRecoveryClearance } from "./use-recovery-clearance";
import { ConfirmDialog } from "./ui";
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check } from "lucide-react";
import { demoStorageKey, loadDemoStore, type DemoAccount } from "./demo-store";
import { type Store, type Preference, type Trip, type User, isActive, isOwner, member, canEdit, EVENT_PERMISSION_MESSAGE } from "./domain";
import { TripSaveQueue, type PendingTrip } from "./trip-save-queue";
import { TripRecoveryJournal } from "./trip-recovery";
import { getSupabase, sendTripInvitationEmail } from "./supabase";
import type { SignInMethod } from "./account";
import { useCompanionPictures, useProfilePicture, type ProfilePicture } from "./use-profile-picture";
import {
  loadAccountTrips,
  saveAccountTrip,
  deleteAccountTrip,
  tripFromRow,
} from "./account-trips";
export type Route = { page: number; params: URLSearchParams };
export type Overlay = { kind: string; data?: any } | null;
type FeedbackScope = "global" | "budget" | "connections" | "calendar" | "preferences";
type Context = {
  s: Store;
  mapSyncOffline: boolean;
  recoveryNotice: ReactNode;
  unavailableTrip: string;
  accountTrips: boolean;
  pendingTripIds: string[];
  invite: (tripId: string, emails: string[]) => Promise<{ email: string; error: string }[]>;
  savePreferences: (trip: Trip, answers: Preference) => Promise<void>;
  saveTrip: (trip: Trip) => Promise<void>;
  deleteTrip: (trip: Trip) => Promise<void>;
  signOut: () => Promise<void>;
  /** The signed-in account's own picture (uploaded, else Google, else initials). */
  picture: ProfilePicture;
  /** Which account this is and how it signs in ("demo" for the standalone Maya demo). */
  accountInfo: { cloud: boolean; email: string; method: SignInMethod | "demo" };
  /** Picture URL for an account id: the signed-in account's own, or a trip companion's. */
  avatarFor: (id?: string) => string | undefined;
  mutate: (fn: (s: Store) => void) => void;
  trip: Trip | undefined;
  user: User | undefined;
  route: Route;
  go: (page: number, params?: Record<string, string>, replace?: boolean) => void;
  tripGo: (page: number) => void;
  open: (kind: string, data?: any) => void;
  close: () => void;
  overlay: Overlay;
  toast: (message: string, scope?: FeedbackScope) => void;
  /** Transient UI feedback; Budget presents it inline so it cannot cover expenses. */
  message: string;
  messageScope: FeedbackScope;
  dismissMessage: () => void;
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
  initialUserId,
  cloud = false,
  googlePicture,
  signInMethod,
}: {
  children: ReactNode;
  account: DemoAccount;
  cloud?: boolean;
  googlePicture?: string;
  signInMethod?: SignInMethod;
  initialTripId?: string;
  initialUserId?: string;
  onSignOut: () => Promise<void>;
}) {
  const [s, setS] = useState(() => {
    const saved = loadDemoStore(account, {
      getItem: (key) => window.localStorage.getItem(key),
    });
    // First-time demo visitors open the sample; existing local work survives refresh.
    if (!saved.tripId && initialTripId) saved.tripId = initialTripId;
    if (!cloud && initialUserId && saved.users.some(user => user.id === initialUserId)) {
      // Explicit demo entry honors its named traveler; a normal refresh keeps the selected participant.
      saved.userId = initialUserId;
      delete saved.sampleReturn;
      const accessible = saved.trips.filter(trip => trip.members.some(person => person.id === initialUserId && person.status === "accepted"));
      if (!accessible.some(trip => trip.id === saved.tripId))
        saved.tripId = accessible.find(trip => trip.id === initialTripId)?.id ?? accessible[0]?.id ?? null;
    }
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
  // Long-lived callbacks (the save queue, background sync) must see the latest name, not the first.
  const accountRef = useRef(account);
  accountRef.current = account;
  const legacyTrips = useRef(s.trips);
  const recoveryRef = useRef<TripRecoveryJournal | null>(null);
  const [recoveryError, setRecoveryError] = useState(false);
  const [rejectedRecovery, setRejectedRecovery] = useState<{ key: string; reason: string; raw: string }[]>([]);
  if (!recoveryRef.current) {
    try { recoveryRef.current = new TripRecoveryJournal(localStorage, sessionStorage, account.id); }
    catch { /* The save banner and unload guard still protect in-memory drafts. */ }
  }
  const [, setSaveTick] = useState(0);
  const [{ text: message, scope: messageScope }, setFeedback] = useState<{text: string; scope: FeedbackScope}>({text: "", scope: "global"});
  // Scope keeps transient feedback out of unrelated feature panels after navigation.
  const setMessage = (text: string, scope: FeedbackScope = "global") => setFeedback({text, scope});
  const [demoStorageError, setDemoStorageError] = useState(false);
  const [unavailableTrip, setUnavailableTrip] = useState("");
  const demoStorageIssue = useRef(false);
  const [saveNotice, setSaveNotice] = useState(0);
  const noticeSequence = useRef(0);
  const notifySaved = () => {
    setMessage("");
    setSaveNotice(++noticeSequence.current);
  };
  const queueRef = useRef<TripSaveQueue | null>(null);
  const commit = (next: Store) => {
    const previous = stateRef.current.trips.find(trip => trip.id === stateRef.current.tripId);
    if (previous?.persistence === "account" && !next.trips.some(trip => trip.id === previous.id)) setUnavailableTrip(previous.title);
    else if (next.tripId) setUnavailableTrip("");
    stateRef.current = next;
    setS(next);
  };
  if (!queueRef.current)
    queueRef.current = new TripSaveQueue(
      async (draft) => {
        try {
          return await saveAccountTrip(getSupabase(), accountRef.current, draft);
        } catch (error) {
          // An owner can revoke access while an editor is typing. Replace that
          // optimistic copy with the authorized state; never retry a denied edit.
          if ((error as { refreshPermissions?: boolean })?.refreshPermissions) {
            const { data, error: readError } = await getSupabase().rpc("read_invited_trip", { p_trip: draft.id });
            if (!readError || readError.code === "42501") {
              const remote = data ? tripFromRow(data, accountRef.current) : undefined;
              const role = member(draft, account.id), currentRole = remote && member(remote, account.id);
              const grantChanged = role?.role !== currentRole?.role || JSON.stringify(role?.days) !== JSON.stringify(currentRole?.days);
              // Role updates bump the revision. A conflict caused by promotion or
              // another permitted edit still gets the normal recovery options.
              const reason = remote && grantChanged ? sharedChangeError(remote, { ...draft, members: remote.members }, account.id) : "";
              if (!remote || reason || (error as { forbidden?: boolean }).forbidden) {
                throw Object.assign(new Error(!remote ? "You no longer have access to this trip." :
                  reason || (error as Error).message), { denied: true, remote });
              }
            }
          }
          throw error;
        }
      },
      () => {
        if (!mounted.current) return;
        setSaveTick((n) => n + 1);
        if (queueRef.current!.pending.size) setSaveNotice(0);
        try {
          if (!recoveryRef.current) throw new Error("Recovery storage unavailable");
          recoveryRef.current.sync(queueRef.current!.pending);
          setRecoveryError(false);
        } catch {
          setRecoveryError(true);
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
        if (!newer && !queueRef.current!.pending.size) notifySaved();
      },
      (id, remote, reason) => {
        const current = stateRef.current;
        commit({ ...current, trips: current.trips.flatMap(t => t.id !== id ? [t] : remote ? [remote] : []),
          tripId: !remote && current.tripId === id ? null : current.tripId });
        setOverlay({ kind: "message", data: { title: "Trip permissions", body: reason } });
      },
    );
  const queue = queueRef.current;
  const picture = useProfilePicture(cloud, account.id, googlePicture);
  const companionPictures = useCompanionPictures(cloud);
  // When the account is renamed, update every local copy of the name so an older one is never
  // saved back to a trip.
  useEffect(() => {
    if (!cloud) return;
    const current = stateRef.current;
    const renamed = (m: { id: string; accountId?: string | null; name: string }) =>
      (m.id === account.id || m.accountId === account.id) && m.name !== account.name;
    const stale =
      current.users.some((u) => u.id === account.id && u.name !== account.name) ||
      current.trips.some((t) => t.members.some(renamed));
    if (!stale) return;
    const next = structuredClone(current);
    for (const u of next.users) if (u.id === account.id) u.name = account.name;
    for (const t of next.trips) for (const m of t.members) if (renamed(m)) m.name = account.name;
    commit(next);
  }, [cloud, account.id, account.name]);
  const pending = [...queue.pending.values()];
  const saveError = pending.find((entry) => entry.error)?.error;
  const [loadState, setLoadState] = useState(cloud ? "loading" : "ready");
  const recoveryBanner = useRef<HTMLDivElement>(null);
  const [confirmRecoveryDiscard, setConfirmRecoveryDiscard] = useState(false);
  useEffect(() => { if (!pending.length) setConfirmRecoveryDiscard(false); }, [pending.length]);
  const showRecovery = cloud && loadState === "ready" && (pending.length > 0 || rejectedRecovery.length > 0);
  useRecoveryClearance(recoveryBanner, showRecovery);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const reconnect = () => queue.reconnect();
    window.addEventListener("online", reconnect);
    return () => {
      window.removeEventListener("online", reconnect);
      mounted.current = false;
      queue.stop();
      recoveryRef.current?.close();
    };
  }, []);
  useEffect(() => {
    if (!cloud) return;
    let active = true;
    setLoadState("loading");
    void loadAccountTrips(getSupabase(), account.id)
      .then(async (rows) => {
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
          if (!recoveryRef.current) throw new Error("Recovery storage unavailable");
          recovered = await recoveryRef.current.read();
          if (!active) return;
          setRejectedRecovery([...recoveryRef.current.rejected]);
        } catch {
          if (active) setRecoveryError(true);
        }
        if (!active) return;
        if (!Array.isArray(recovered)) recovered = [];
        for (const entry of recovered) {
          if (!entry || typeof entry !== "object") continue;
          const draft = "draft" in entry ? entry.draft : entry;
          if (!draft?.id || !Array.isArray(draft.members)) continue;
          const index = restored.findIndex((t) => t.id === draft.id);
          const confirmed = restored[index];
          // Never resurrect a deleted/revoked trip from an old recovery copy.
          if (confirmed ? sharedChangeError(confirmed, draft, account.id) :
              draft.revision != null || !isOwner(draft, account.id)) continue;
          queue.restore(draft, "draft" in entry ? entry.retryDraft : undefined);
          if (index < 0) restored.push(draft);
          else restored[index] = draft;
        }
        const targetKey = "trip-planner-invite-target:" + account.id;
        const target = sessionStorage.getItem(targetKey);
        const invited = target && restored.find(t => t.id === target && member(t, account.id));
        if (invited) {
          go(8, {}, true);
          sessionStorage.removeItem(targetKey);
        }
        commit({
          ...previous,
          ...(invited ? { tripId: invited.id } : {}),
          trips: [
            ...previous.trips.filter(
              (t) =>
                t.persistence !== "account" &&
                !restored.some((r) => r.id === t.id),
            ),
            ...restored,
          ],
        });
        try {
          if (!recoveryRef.current) throw new Error("Recovery storage unavailable");
          recoveryRef.current.sync(queue.pending);
          setRecoveryError(false);
        } catch { setRecoveryError(true); }
        queue.resume();
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
  const go = (page: number, params: Record<string, string> = {}, replace = false) => {
    if (page === 7) {
      const current = stateRef.current;
      const selected = current.trips.find(t => t.id === current.tripId);
      if (selected && !canEdit(selected, current.userId,
          selected.events.find(e => e.id === params.event)?.date ?? params.date ?? selected.start)) {
        setOverlay({ kind: "message", data: { title: "Event permissions", body: EVENT_PERMISSION_MESSAGE } });
        return;
      }
    }
    const hash = `#/${page}${Object.keys(params).length ? "?" + new URLSearchParams(params) : ""}`;
    if (replace) {
      // In-page selection survives refresh without adding a Back step or scrolling.
      history.replaceState(history.state, "", hash);
      setRoute(readRoute());
      return;
    }
    location.hash = hash;
    setOverlay(null);
    window.scrollTo(0, 0);
  };
  const mutate = (fn: (store: Store) => void) => {
    if (!mounted.current) return;
    const previous = stateRef.current;
    const next = structuredClone(previous);
    fn(next);
    const changed: Trip[] = [];
    for (const trip of next.trips) {
      const old = previous.trips.find((t) => t.id === trip.id);
      if (JSON.stringify(trip) === JSON.stringify(old)) continue;
      if (old) {
        const reason = sharedChangeError(old, trip, previous.userId);
        if (reason) {
          setOverlay({ kind: "message", data: { title: "Trip permissions", body: reason } });
          return;
        }
      }
      if (trip.persistence !== "account") continue;
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
  const mapSyncOffline = useAccountTripSync(
    cloud && loadState === "ready" && s.userId === account.id,
    account, stateRef, queue, commit);

  useEffect(() => {
    const handler = () => {
      setRoute(readRoute());
      setOverlay(null);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", handler);
    // A deep link or browser Back can change between render and subscription.
    // Re-read after subscribing so the visible page cannot lag behind the URL.
    setRoute(readRoute());
    // A successful login opens Home directly. Refreshing a demo route keeps that route.
    if (readRoute().page === 1) go(4);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  function persistDemoState(store: Store): boolean {
    try {
      // Account trips live in the database; this copy holds only local demo work.
      localStorage.setItem(demoStorageKey(account.id), JSON.stringify(cloud
        ? {...store, trips: store.trips.filter(trip => trip.persistence !== "account")}
        : store));
      demoStorageIssue.current = false;
      setDemoStorageError(false);
      return true;
    } catch {
      demoStorageIssue.current = true;
      setDemoStorageError(true);
      return false;
    }
  }
  useEffect(() => {
    if (cloud && loadState !== "ready") return;
    persistDemoState(s);
  }, [s, account.id, cloud, loadState]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (queue.pending.size || demoStorageIssue.current) {
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
  useEffect(() => {
    if (!saveNotice) return;
    const timer = setTimeout(() => setSaveNotice(0), 3000);
    return () => clearTimeout(timer);
  }, [saveNotice]);
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
  const recoveryNotice = showRecovery && (
    <div
      ref={recoveryBanner}
      className="account-save-banner trip-recovery-banner"
      role={saveError || recoveryError || rejectedRecovery.length ? "alert" : "status"}
    >
      <span>
        {pending.length === 0 ? "Some local recovery data could not be read. Your saved trips are available. Download the recovery copy before clearing browser data." : saveError
          ? `Not saved: ${saveError}`
          : "Saving trip changes… Keep this page open."}
      </span>
      {recoveryError && pending.length > 0 && <span>
        This browser cannot keep a recovery copy. Keep this page open until saving finishes, or download your changes before leaving.
      </span>}
      {rejectedRecovery.length > 0 && pending.length > 0 && <span>
        Some older recovery data could not be read and has been kept for download.
      </span>}
      {(saveError || recoveryError || rejectedRecovery.length > 0) && (
        <>
          {pending.length > 0 && <button
            className="btn small recovery-retry"
            onClick={() => queue.retry()}
          >
            Retry save
          </button>}
          <details className="recovery-more" onToggle={(event) => {
            const details = event.currentTarget;
            if (!details.open || window.innerWidth > 760) return;
            requestAnimationFrame(() => {
              const banner = details.closest(".trip-recovery-banner");
              const eventId = route.params.get("event");
              const card = eventId ? document.getElementById(`itinerary-event-${eventId}`) : null;
              if (!banner || !card) return;
              const clearance = card.getBoundingClientRect().top - banner.getBoundingClientRect().bottom - 12;
              if (clearance < 0) window.scrollBy({ top: clearance, behavior: "instant" });
            });
          }}>
            <summary>More options</summary>
            <div className="recovery-secondary-actions">
          <button
            className="btn outline small"
            aria-label="Download unsaved copy"
            onClick={() => {
              const blob = new Blob(
                [
                  JSON.stringify(
                    rejectedRecovery.length
                      ? { pending: pending.map(p => p.draft), unreadable: rejectedRecovery }
                      : pending.map((p) => p.draft),
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
          {pending.length > 0 && <button
            className="btn outline small"
            aria-label="Discard edits and reload"
            onClick={(event) => {
              event.currentTarget.focus({ preventScroll: true });
              setConfirmRecoveryDiscard(true);
            }}
          >
            <span className="recovery-label-full">Discard edits and reload</span><span className="recovery-label-short" aria-hidden="true">Discard edits</span>
          </button>}
            </div>
          </details>
        </>
      )}
    </div>
  );
  const value: Context = {
    recoveryNotice,
    s,
    mapSyncOffline,
    unavailableTrip,
    accountTrips: cloud && s.userId === account.id,
    pendingTripIds: [...queue.pending.keys()],
    invite: async (tripId, emails) => {
      const current = stateRef.current;
      const target = current.trips.find(t => t.id === tripId);
      if (!target || !isOwner(target, current.userId)) throw new Error("Only the trip owner can invite travelers.");
      if (target.persistence !== "account") {
        mutate(store => {
          const trip = store.trips.find(t => t.id === tripId)!;
          for (const email of emails) {
            const existing = trip.members.find(m => m.email.toLowerCase() === email);
            if (existing && existing.status !== "removed") continue;
            const user = store.users.find(u => u.email.toLowerCase() === email);
            const guest = { id: existing?.id || user?.id || crypto.randomUUID(), name: user?.name || email.split("@")[0].slice(0,90),
              email, role: "Viewer" as const, days: [], status: "pending" as const };
            if (existing) Object.assign(existing,guest);
            else trip.members.push(guest);
          }
        });
        return [];
      }
      if (!cloud || current.userId !== account.id) throw new Error("Return to your account to invite travelers.");
      await queue.wait(tripId);
      const client = getSupabase();
      const failures: { email: string; error: string }[] = [];
      const awaitingEmail: string[] = [];
      for (const email of emails) {
        const { data, error } = await client.rpc("share_trip_recipient", { p_trip: tripId, p_email: email });
        if (error) failures.push({ email, error: error.message });
        else if (data === "needs_email") awaitingEmail.push(email);
      }
      if (awaitingEmail.length) {
        for (const email of awaitingEmail) {
          try {
            await sendTripInvitationEmail(email, tripId);
            const confirmation = await client.rpc("share_trip_recipient", { p_trip: tripId, p_email: email, p_delivered: true });
            if (confirmation.error) throw new Error("Link requested. Retry to confirm the invitation.");
          } catch (error) {
            failures.push({ email, error: error instanceof Error ? error.message : "Could not send the invitation email." });
          }
        }
      }
      const { data, error } = await client.rpc("read_invited_trip", { p_trip: tripId });
      if (error) throw new Error("Could not refresh the traveler list. Retry to confirm the invitations.");
      if (mounted.current && !queue.pending.has(tripId)) {
        const latest = stateRef.current;
        const refreshed = tripFromRow(data, account);
        commit({ ...latest, trips: latest.trips.map(t => t.id === tripId && (t.revision ?? 0) <= (refreshed.revision ?? 0)
          ? { ...refreshed, imageSource: t.imageSource, imageCredit: t.imageCredit } : t) });
      }
      return failures;
    },
    savePreferences: async (target, answers) => {
      const current = stateRef.current;
      const traveler = member(target, current.userId);
      if (!traveler) throw new Error("Join this trip before saving preferences.");
      if (target.persistence === "account" && !isOwner(target, current.userId)) {
        if (!cloud || traveler.accountId !== account.id || current.userId !== account.id)
          throw new Error("Sign in to your invited account to save preferences.");
        await queue.wait(target.id);
        const { data, error } = await getSupabase().rpc("save_invited_preferences", {
          p_trip: target.id, p_answers: answers,
        });
        if (error || !data?.content?.prefs?.[traveler.id])
          throw new Error(error?.code === "42501" ? "Your invitation is no longer active." :
            "Could not save your preferences. Your answers are still here. Try again.");
        if (!mounted.current) throw new Error("Sign in again to view your trip.");
        const latest = stateRef.current;
        const saved = tripFromRow(data, account);
        commit({ ...latest, tripId: target.id, trips: latest.trips.map(t => t.id === target.id && !queue.pending.has(t.id) && (t.revision ?? 0) <= (saved.revision ?? 0)
          ? { ...saved, imageSource: t.imageSource, imageCredit: t.imageCredit } : t) });
      } else {
        mutate(store => {
          const trip = store.trips.find(t => t.id === target.id)!;
          trip.prefs[traveler.id] = answers;
        });
        if (target.persistence === "account") {
          queue.retry();
          await queue.wait(target.id);
        }
      }
    },
    saveTrip: async (draft) => {
      const existing = stateRef.current.trips.find(t => t.id === draft.id);
      if (existing && !isOwner(existing, stateRef.current.userId))
        throw new Error("Only the trip owner can change trip settings.");
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
      const current = stateRef.current.trips.find(t => t.id === target.id);
      if (!current || !isOwner(current, stateRef.current.userId)) throw new Error("Only the trip owner can delete this trip.");
      if (target.persistence === "account") {
        setSaveNotice(0);
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
      if (target.persistence === "account") notifySaved();
    },
    signOut: async () => {
      if (demoStorageIssue.current && !window.confirm("Some demo changes are not saved in this browser. Keep this page open and retry, or leave without saving?")) return;
      if (
        queue.pending.size &&
        !window.confirm(
          recoveryError
            ? "This browser cannot keep a recovery copy. Signing out may lose unsaved changes. Download your unsaved copy first. Sign out anyway?"
            : "Some trip changes have not reached the database. Sign out and keep a recovery copy on this device?",
        )
      )
        return;
      try {
        await onSignOut();
      } catch {
        setMessage("Could not sign out. Please try again.");
      }
    },
    picture,
    accountInfo: { cloud, email: account.email, method: cloud ? (signInMethod ?? "other") : "demo" },
    avatarFor: (id) =>
      !cloud || !id ? undefined : id === account.id ? picture.url : companionPictures.get(id),
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
    message: demoStorageError ? "" : message,
    messageScope,
    dismissMessage: () => setMessage(""),
    toast: (message, scope = "global") => {
      if (!queue.pending.size) setMessage(message, scope);
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
      {demoStorageError && <div className="account-save-banner demo-storage-error" role="alert">
        <span>Browser storage is unavailable. Demo changes will last until this page closes.</span>
        <button className="btn outline small" onClick={() => {
          if (persistDemoState(stateRef.current)) setMessage("Demo changes saved in this browser.");
        }}>Retry browser save</button>
      </div>}

      {loadState === "ready" ? (
        children
      ) : (
        <main className="narrow-page account-load-state" aria-busy={loadState === "loading"}>
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
      {confirmRecoveryDiscard && pending.length > 0 && <ConfirmDialog
        title="Discard unsaved trip changes?"
        cancelLabel="Keep changes"
        confirmLabel="Discard and reload"
        onCancel={() => setConfirmRecoveryDiscard(false)}
        onConfirm={() => {
          setConfirmRecoveryDiscard(false);
          const discardedIds = [...queue.pending.keys()];
          if (!discardedIds.length) return;
          try {
            if (!recoveryRef.current) throw new Error("Recovery storage unavailable");
            recoveryRef.current.discard(discardedIds);
          } catch {
            setRecoveryError(true);
            return;
          }
          queue.pending.clear();
          queue.stop();
          location.reload();
        }}>
        Your unsaved changes will be lost and your saved trips will reload. Download your unsaved copy first if you want to keep it.
      </ConfirmDialog>}
      {saveNotice > 0 && (
        <div className="save-toast" role="status" aria-live="polite">
          <Check size={16} aria-hidden="true" />
          Trip changes saved
        </div>
      )}
      {message && !demoStorageError && (messageScope !== "calendar" || (route.page === 8 && route.params.get("view") === "calendar")) && (messageScope !== "connections" || [2, 3].includes(route.page)) && (messageScope !== "preferences" || [8, 10, 13].includes(route.page)) && (messageScope !== "budget" || (route.page === 12 && (!trip || overlay))) && (
        <div className="toast" role="status" data-event-success={/^(?:Event updated everywhere|A new plan, added)/.test(message) || undefined}>
          {message}
          <button aria-label="Dismiss message" onClick={() => setMessage("")}>
            ×
          </button>
        </div>
      )}
    </C.Provider>
  );
}
