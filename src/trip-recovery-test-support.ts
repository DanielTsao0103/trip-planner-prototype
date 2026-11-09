import { seed } from "./data.ts";
import type { PendingTrip } from "./trip-save-queue.ts";

/** Enumerable dynamic keys match real Storage, unlike a plain Map wrapper. */
export function storage(): Storage {
  const records = new Map<string, string>();
  const target: Storage = {
    get length() {
      return records.size;
    },
    key: (index) => [...records.keys()][index] ?? null,
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => {
      records.set(key, value);
    },
    removeItem: (key) => {
      records.delete(key);
    },
    clear: () => records.clear(),
  };
  return new Proxy(target, {
    ownKeys: () => [...records.keys()],
    getOwnPropertyDescriptor: (_, key) =>
      typeof key === "string" && records.has(key)
        ? { configurable: true, enumerable: true, value: records.get(key) }
        : undefined,
  });
}

/** Mimic exclusive ifAvailable locks across independently constructed journals. */
export function lockManager(): LockManager {
  const held = new Set<string>();
  return {
    request: async (
      name: string,
      _options: LockOptions,
      callback: LockGrantedCallback<unknown>,
    ) => {
      await Promise.resolve();
      if (held.has(name)) return callback(null);
      held.add(name);
      try {
        return await callback({ name, mode: "exclusive" });
      } finally {
        held.delete(name);
      }
    },
  } as LockManager;
}

export function pending(id: string, title = id): Map<string, PendingTrip> {
  const trip = structuredClone(seed().trips[0]);
  trip.members[0] = {
    ...trip.members[0],
    id: "owner",
    role: "Owner",
    status: "accepted",
  };
  delete trip.sample;
  return new Map([
    [
      id,
      {
        draft: { ...trip, id, title, persistence: "account", revision: 1 },
        error: "",
        generation: 1,
      },
    ],
  ]);
}
