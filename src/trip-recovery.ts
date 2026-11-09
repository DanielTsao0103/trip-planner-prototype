import type { Trip } from "./domain.ts";
import type { PendingTrip } from "./trip-save-queue.ts";

type Recovery = Pick<PendingTrip, "draft" | "retryDraft">;
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

  constructor(
    storage: Storage,
    session: Storage,
    accountId: string,
    writer: string = crypto.randomUUID(),
  ) {
    this.storage = storage;
    this.writer = writer;
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

  read(): Recovery[] {
    const sources: Source[] = [];
    for (let index = 0; index < this.storage.length; index++) {
      const key = this.storage.key(index);
      if (!key) continue;
      if (!key.startsWith(this.prefix) && key !== this.legacyKey) continue;
      const raw = this.storage.getItem(key);
      if (!raw) continue;
      try {
        const value = JSON.parse(raw);
        const entries = key === this.legacyKey ? value : [value];
        if (!Array.isArray(entries)) continue;
        for (const item of entries) {
          if (!item || typeof item !== "object") continue;
          const entry: Recovery =
            "draft" in item ? item : { draft: item as Trip };
          if (!entry.draft?.id || !Array.isArray(entry.draft.members)) continue;
          sources.push({
            key,
            raw,
            entry,
            updated: Number(item.updated) || 0,
            ...(key === this.legacyKey ? { legacy: item } : {}),
          });
        }
      } catch {
        /* One damaged record must not hide the other recovery copies. */
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
    for (const source of sources)
      if (!this.adopted.has(source.entry.draft.id))
        this.adopted.set(source.entry.draft.id, source);
    return [...this.adopted.values()].map((source) => source.entry);
  }

  sync(pending: ReadonlyMap<string, PendingTrip>): void {
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
