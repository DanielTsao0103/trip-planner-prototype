import type { Trip } from "./domain.ts";

export type PendingTrip = {
  draft: Trip;
  error: string;
  generation: number;
  retryDraft?: { draft: Trip; generation: number };
};
type Writer = (trip: Trip) => Promise<Trip>;

/** Serialize writes per account. Changes made during a save become the next revision,
 * rather than racing and overwriting one another. Failed drafts remain retryable. */
export class TripSaveQueue {
  readonly pending = new Map<string, PendingTrip>();
  private running = false;
  private stopped = false;
  private retries = new Map<string, ReturnType<typeof setTimeout>>();
  private delays = new Map<string, number>();
  private waiters = new Map<
    string,
    { resolve: () => void; reject: (error: Error) => void }[]
  >();
  private write: Writer;
  private changed: () => void;
  private saved: (trip: Trip, newer: boolean) => void;
  constructor(
    write: Writer,
    changed: () => void,
    saved: (trip: Trip, newer: boolean) => void,
  ) {
    this.write = write;
    this.changed = changed;
    this.saved = saved;
  }

  enqueue(draft: Trip): void {
    const existing = this.pending.get(draft.id);
    this.pending.set(draft.id, {
      draft: {
        ...structuredClone(draft),
        revision: existing?.draft.revision ?? draft.revision,
      },
      error: "",
      generation: (existing?.generation ?? 0) + 1,
      retryDraft: existing?.retryDraft,
    });
    this.changed();
    void this.drain();
  }
  restore(draft: Trip, retryDraft?: PendingTrip["retryDraft"]): void {
    this.pending.set(draft.id, {
      draft,
      error: "",
      generation: retryDraft ? retryDraft.generation + 1 : 1,
      retryDraft,
    });
  }
  /** All recovered entries must be loaded before the first storage callback. */
  resume(): void {
    void this.drain();
  }
  reconnect(): void {
    for (const id of this.retries.keys()) {
      const entry = this.pending.get(id);
      if (entry) entry.error = "";
    }
    this.resume();
  }
  retry(): void {
    for (const entry of this.pending.values()) entry.error = "";
    this.changed();
    void this.drain();
  }
  stop(): void {
    this.stopped = true;
    for (const timer of this.retries.values()) clearTimeout(timer);
    this.retries.clear();
  }
  wait(id: string): Promise<void> {
    const entry = this.pending.get(id);
    if (!entry) return Promise.resolve();
    if (entry.error) return Promise.reject(new Error(entry.error));
    return new Promise((resolve, reject) => {
      this.waiters.set(id, [
        ...(this.waiters.get(id) ?? []),
        { resolve, reject },
      ]);
    });
  }
  private finish(id: string, error?: Error): void {
    for (const waiter of this.waiters.get(id) ?? [])
      error ? waiter.reject(error) : waiter.resolve();
    this.waiters.delete(id);
  }
  private async drain(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      while (!this.stopped) {
        const next = [...this.pending].find(([, entry]) => !entry.error);
        if (!next) break;
        const [id, entry] = next;
        const generation = entry.retryDraft?.generation ?? entry.generation;
        const snapshot = structuredClone(
          entry.retryDraft?.draft ?? entry.draft,
        );
        clearTimeout(this.retries.get(id));
        this.retries.delete(id);
        // Journal the exact write before sending it. If the browser closes after
        // commit, the database recognizes the replay by its payload hash.
        entry.retryDraft = { draft: snapshot, generation };
        this.changed();
        try {
          const saved = await this.write(snapshot);
          if (this.stopped) return;
          const current = this.pending.get(id)!;
          this.delays.delete(id);
          delete current.retryDraft;
          const newer = current.generation !== generation;
          if (newer) current.draft.revision = saved.revision;
          else this.pending.delete(id);
          this.saved(saved, newer);
          this.changed();
          if (!newer) this.finish(id);
        } catch (issue) {
          if (this.stopped) return;
          const error =
            issue instanceof Error
              ? issue
              : new Error("Could not save trip changes. Please retry.");
          const current = this.pending.get(id);
          if (current) {
            current.error = error.message;
            if ((issue as { retryOriginal?: boolean })?.retryOriginal) {
              const delay = this.delays.get(id) ?? 3000;
              this.delays.set(id, Math.min(delay * 2, 60000));
              this.retries.set(
                id,
                setTimeout(() => {
                  current.error = "";
                  this.resume();
                }, delay),
              );
            } else {
              delete current.retryDraft;
              const revision = (issue as { confirmedRevision?: number })
                ?.confirmedRevision;
              if (revision !== undefined) current.draft.revision = revision;
              // A corrected draft may already be waiting behind the rejected one.
              if (current.generation !== generation) current.error = "";
            }
          }
          this.changed();
          this.finish(id, error);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
