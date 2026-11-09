import type { PendingTrip } from "./trip-save-queue.ts";

import { parseRecovery, type Recovery } from "./trip-recovery-validation.ts";
export type RejectedRecovery = { key: string; reason: string; raw: string };
type Source = {
  key: string;
  raw: string;
  entry: Recovery;
  updated: number;
  legacy?: unknown;
};

/** Each queue owns separate storage records, so another tab cannot erase its draft.
 * Discover abandoned records on startup. Transfer adopted copies only after a
 * replacement is durable, and only if the source has not changed in another tab. */
export class TripRecoveryJournal {
  private prefix: string;
  private legacyKey: string;
  private writer: string;
  private previous: string | null = null;
  private written = new Map<string, string>();
  private sequence = 0;
  private adopted = new Map<string, Source>();
  private observed: Source[] = [];
  private storage: Storage;
  private accountId: string;
  private locks: LockManager | null | undefined;
  private releases = new Map<string, () => void>();
  private starting: Promise<void> | undefined;
  private closed = false;
  readonly rejected: RejectedRecovery[] = [];
  ignoredActiveWriters = 0;

  constructor(
    storage: Storage,
    session: Storage,
    accountId: string,
    writer: string = crypto.randomUUID(),
    locks: LockManager | null | undefined = typeof navigator === "undefined"
      ? undefined
      : navigator.locks,
  ) {
    this.storage = storage;
    this.writer = writer;
    this.accountId = accountId;
    this.locks = locks;
    this.prefix = `trip-planner-pending-v2:${accountId}:`;
    this.legacyKey = `trip-planner-pending-v1:${accountId}`;
    try {
      this.previous = session.getItem(this.prefix);
      // A new identity per mount also isolates tabs created with a cloned sessionStorage.
      session.setItem(this.prefix, writer);
    } catch {
      /* Discovery still works when session storage is unavailable. */
    }
  }

  /** Hold ownership for this tab's lifetime, independently of network state. */
  start(): Promise<void> {
    if (this.closed)
      return Promise.reject(new Error("Trip recovery is closed."));
    this.starting ??= this.claim(this.writer).then((acquired) => {
      if (!acquired)
        throw new Error("Could not acquire this tab's recovery storage.");
    });
    return this.starting;
  }

  private async claim(writer: string): Promise<boolean> {
    if (this.closed) return false;
    if (this.releases.has(writer)) return true;
    if (!this.locks)
      throw new Error(
        "This browser cannot safely coordinate recovery across tabs. Keep this page open until changes save.",
      );
    return new Promise<boolean>((resolve, reject) => {
      void this.locks!.request(
        `${this.prefix}writer:${writer}`,
        { ifAvailable: true },
        async (lock) => {
          if (!lock || this.closed) {
            resolve(false);
            return;
          }
          let release!: () => void;
          const lifetime = new Promise<void>((done) => {
            release = done;
          });
          this.releases.set(writer, release);
          resolve(true);
          await lifetime;
        },
      ).catch(reject);
    });
  }

  /** Browser Web Locks distinguish active writers from abandoned journals.
   * Only this owner or a claimant holding the abandoned writer's lock may read,
   * transfer, or discard its records. Never infer abandonment from a timeout. */
  async read(): Promise<Recovery[]> {
    await this.start();
    const sources: Source[] = [];
    this.rejected.length = 0;
    this.ignoredActiveWriters = 0;
    // Enumerate once; cleanup in another tab cannot shift this list mid-read.
    const keys = Object.keys(this.storage).filter(
      (key) => key.startsWith(this.prefix) || key === this.legacyKey,
    );
    const available = new Map<string, boolean>();
    for (const key of keys) {
      const writer =
        key === this.legacyKey
          ? "legacy"
          : key.slice(this.prefix.length).split(":")[0];
      if (!available.has(writer)) {
        const acquired = await this.claim(writer);
        if (this.closed) return [];
        available.set(writer, acquired);
        if (!acquired) this.ignoredActiveWriters++;
      }
      if (!available.get(writer)) continue;
      const raw = this.storage.getItem(key);
      if (!raw) continue;
      try {
        const value: unknown = JSON.parse(raw);
        const entries = key === this.legacyKey ? value : [value];
        if (!Array.isArray(entries))
          throw new Error("Unrecognized recovery journal format.");
        for (const item of entries) {
          const entry = parseRecovery(item, this.accountId);
          if (!entry) {
            this.rejected.push({
              key,
              raw,
              reason:
                "A recovery copy has invalid or incompatible trip data and was not loaded.",
            });
            continue;
          }
          sources.push({
            key,
            raw,
            entry,
            updated:
              typeof item.updated === "number" && Number.isFinite(item.updated)
                ? item.updated
                : 0,
            ...(key === this.legacyKey ? { legacy: item } : {}),
          });
        }
      } catch {
        // Quarantine in place: retain the exact raw copy for export even if the
        // storage device is full. Never parse it into application state.
        this.rejected.push({
          key,
          raw,
          reason: "A recovery copy is unreadable and was not loaded.",
        });
      }
    }
    // Prefer this tab's interrupted draft. Keep competing same-trip records in
    // storage: revision checks must resolve conflicts, never a last-writer overwrite.
    sources.sort((a, b) => {
      const own = (source: Source) =>
        Number(
          !!this.previous &&
            source.key.startsWith(`${this.prefix}${this.previous}:`),
        );
      return own(b) - own(a) || b.updated - a.updated;
    });
    this.observed = sources;
    this.adopted.clear();
    for (const source of sources)
      if (!this.adopted.has(source.entry.draft.id))
        this.adopted.set(source.entry.draft.id, source);
    return [...this.adopted.values()].map((source) => source.entry);
  }

  sync(pending: ReadonlyMap<string, PendingTrip>): void {
    if (this.closed || !this.releases.has(this.writer))
      throw new Error(
        "Recovery storage is unavailable. Keep this page open until changes save.",
      );
    // Write new recovery copies before removing anything. A full storage device
    // must leave the previous journal intact.
    for (const [id, entry] of pending) {
      const key = `${this.prefix}${this.writer}:${id}:${++this.sequence}`;
      const previousKey = this.written.get(id);
      this.storage.setItem(
        key,
        JSON.stringify({
          draft: entry.draft,
          retryDraft:
            entry.retryDraft?.generation !== entry.generation
              ? entry.retryDraft
              : undefined,
          updated: Date.now(),
        }),
      );
      this.written.set(id, key);
      // Other tabs may retire this snapshot, but never mutate its immutable key.
      // Write the replacement first so interrupted storage never loses the draft.
      if (previousKey) this.storage.removeItem(previousKey);
      // The new record is durable: retire unchanged ancestors now, even if the
      // user edited this recovered draft. Otherwise an older ancestor could be
      // replayed after a later reload and undo the user's successful recovery.
      const source = this.adopted.get(id);
      if (source) {
        this.retireCopies(source);
        this.adopted.delete(id);
      }
    }
    for (const [id, key] of this.written) {
      if (pending.has(id)) continue;
      this.storage.removeItem(key);
      this.written.delete(id);
    }
    for (const [id, source] of this.adopted) {
      if (pending.has(id)) continue;
      this.retireCopies(source);
      this.adopted.delete(id);
    }
  }

  /** Explicit discard covers the known alternatives for these trips only.
   * A different tab's subsequent changes remain protected by compare-and-delete. */
  discard(ids: Iterable<string>): void {
    if (this.closed || !this.releases.has(this.writer))
      throw new Error(
        "Recovery storage is unavailable; unsaved copies were not discarded.",
      );
    const selected = new Set(ids);
    for (const source of this.observed)
      if (selected.has(source.entry.draft.id)) this.removeUnchanged(source);
    for (const id of selected) {
      const key = this.written.get(id);
      if (key) this.storage.removeItem(key);
      this.written.delete(id);
      this.adopted.delete(id);
    }
    this.observed = this.observed.filter(
      (source) => !selected.has(source.entry.draft.id),
    );
  }

  /** Release writer and orphan claims on sign-out/unmount; browsers also release
   * Web Locks automatically when a tab closes or its process terminates. */
  close(): void {
    this.closed = true;
    for (const release of this.releases.values()) release();
    this.releases.clear();
  }

  private retireCopies(source: Source): void {
    const signature = this.signature(source.entry);
    for (const copy of this.observed)
      if (
        copy.entry.draft.id === source.entry.draft.id &&
        this.signature(copy.entry) === signature
      )
        this.removeUnchanged(copy);
  }

  private signature(entry: Recovery): string {
    return JSON.stringify({ draft: entry.draft, retryDraft: entry.retryDraft });
  }

  private removeUnchanged(source: Source): void {
    if (source.legacy !== undefined) {
      // Legacy journals contain several trips. Remove only this exact entry.
      const raw = this.storage.getItem(source.key);
      if (!raw) return;
      const entries = JSON.parse(raw);
      if (!Array.isArray(entries)) return;
      const remaining = entries.filter(
        (entry) => JSON.stringify(entry) !== JSON.stringify(source.legacy),
      );
      if (remaining.length)
        this.storage.setItem(source.key, JSON.stringify(remaining));
      else this.storage.removeItem(source.key);
    } else if (this.storage.getItem(source.key) === source.raw) {
      this.storage.removeItem(source.key);
    }
  }
}
