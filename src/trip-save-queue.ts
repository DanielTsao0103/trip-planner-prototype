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
      draft: structuredClone(draft),
      error: existing?.error ?? "",
      generation: (existing?.generation ?? 0) + 1,
      retryDraft: existing?.retryDraft,
    });
    this.changed();
    void this.drain();
  }
  restore(draft: Trip, retryDraft?: PendingTrip["retryDraft"]): void {
    this.pending.set(draft.id, {
      draft,
      error:
        "Recovered unsaved changes. Retry to save them, or reload the database version.",
      generation: retryDraft ? retryDraft.generation + 1 : 1,
      retryDraft,
    });
  }
  retry(): void {
    for (const entry of this.pending.values()) entry.error = "";
    this.changed();
    void this.drain();
  }
  stop(): void {
    this.stopped = true;
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
        try {
          const saved = await this.write(snapshot);
          if (this.stopped) return;
          const current = this.pending.get(id)!;
          delete current.retryDraft;
          const newer = current.generation !== generation;
          if (newer) current.draft.revision = saved.revision;
          else this.pending.delete(id);
          this.saved(saved, newer);
          this.changed();
          if (!newer) this.finish(id);
        } catch (issue) {
          const error =
            issue instanceof Error
              ? issue
              : new Error("Could not save trip changes. Please retry.");
          const current = this.pending.get(id);
          if (current) {
            current.error = error.message;
            if ((issue as { retryOriginal?: boolean })?.retryOriginal)
              current.retryDraft = { draft: snapshot, generation };
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
