import { seed } from "./data.ts";
import type { Store } from "./domain.ts";

export type DemoAccount = { id: string; email: string; name: string };
type StorageReader = Pick<Storage, "getItem">;
export const demoStorageKey = (accountId: string): string => `trip-planner-demo-v1:${accountId}`;

/** Keep demo trips in this browser, separated by the real signed-in account. */
export function loadDemoStore(account: DemoAccount, storage: StorageReader): Store {
  let state = seed();
  let restoredAccount = false;
  // Copy an older prototype save if needed; never delete or overwrite the original.
  for (const key of [demoStorageKey(account.id), "trip-planner-v1"]) {
    try {
      const raw = storage.getItem(key);
      if (!raw) continue;
      const saved: Store = JSON.parse(raw);
      if (saved.version !== 1 || !Array.isArray(saved.users) || !Array.isArray(saved.trips)) continue;
      state = saved;
      restoredAccount = key === demoStorageKey(account.id);
      break;
    } catch { /* Unavailable storage leaves the built-in demo usable in memory. */ }
  }
  // Reuse the old fictional identity when its email matches, preserving local trip membership.
  const existing = state.users.find(u => u.id === account.id)
    || state.users.find(u => u.email.toLowerCase() === account.email.toLowerCase());
  const userId = existing?.id || account.id;
  if (!existing) state.users.push({ ...account, connections: {} });
  if (!restoredAccount || !state.users.some(u => u.id === state.userId)) {
    state.userId = userId;
    state.tripId = null;
    delete state.sampleReturn;
  }
  return state;
}
