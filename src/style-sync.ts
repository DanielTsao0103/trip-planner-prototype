/** Implementation status: the signed-in account's Style page choices are stored in Supabase (public.user_style, with every change logged in public.user_style_log). Demo mode stays browser-only. See ../IMPLEMENTATION_STATUS.md. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import { getSupabase } from "./supabase.ts";
import { THEMES, HEADING_FONTS, RADII, DEFAULT_STYLE, applyRemoteStyle, setStyleSaver, type StyleChoice } from "./theme.ts";

export type StyleSaveStatus = "device" | "loading" | "ready" | "saving" | "saved" | "save-error" | "load-error";
let status: StyleSaveStatus = "device";
const statusListeners = new Set<() => void>();
let retryCurrent: (() => void) | null = null;

function publishStatus(next: StyleSaveStatus): void {
  status = next;
  statusListeners.forEach((listener) => listener());
}

export function useStyleSaveStatus(): StyleSaveStatus {
  return useSyncExternalStore(
    (listener) => {
      statusListeners.add(listener);
      return () => { statusListeners.delete(listener); };
    },
    () => status,
  );
}

/** Retry the retained choice, even after navigating away from the Style page. */
export function retryStyleSync(): void {
  retryCurrent?.();
}

type StyleSyncOperations = {
  load: () => Promise<StyleChoice | null>;
  save: (choice: StyleChoice) => Promise<void>;
  apply: (choice: StyleChoice) => void;
  report: (status: StyleSaveStatus) => void;
};

/** Serialize account writes so an older response cannot replace the latest Apply. */
export function createStyleSync(operations: StyleSyncOperations) {
  let active = true;
  let edited = false;
  let pending: StyleChoice | null = null;
  let writing = false;
  let loading = false;

  async function load(): Promise<void> {
    if (!active || loading) return;
    loading = true;
    operations.report("loading");
    try {
      const choice = await operations.load();
      // A slow initial read must never undo a choice already applied on this visit.
      if (active && !edited) {
        if (choice) operations.apply(choice);
        operations.report("ready");
      }
    } catch {
      if (active && !edited) operations.report("load-error");
    } finally {
      loading = false;
    }
  }

  async function flush(): Promise<void> {
    if (!active || writing || !pending) return;
    writing = true;
    operations.report("saving");
    while (active && pending) {
      const snapshot: StyleChoice = pending;
      try {
        await operations.save(snapshot);
      } catch {
        if (!active) break;
        // A newer Apply may have arrived while the failed request was in flight.
        if (pending !== snapshot) continue;
        writing = false;
        operations.report("save-error");
        return;
      }
      if (!active) break;
      if (pending === snapshot) pending = null;
    }
    writing = false;
    if (active) operations.report("saved");
  }

  void load();
  return {
    save(choice: StyleChoice): void {
      if (!active) return;
      edited = true;
      pending = { ...choice };
      void flush();
    },
    retry(): void {
      if (pending) void flush();
      else if (!edited) void load();
    },
    dispose(): void {
      active = false;
      pending = null;
    },
  };
}

/** Register only while a real account is mounted; demo changes never use this writer. */
export function startAccountStyleSync(userId: string): () => void {
  const sync = createStyleSync({
    load: () => loadAccountStyle(userId),
    save: (choice) => saveAccountStyle(userId, choice),
    apply: applyRemoteStyle,
    report: publishStatus,
  });
  setStyleSaver(sync.save);
  retryCurrent = sync.retry;
  return () => {
    sync.dispose();
    setStyleSaver(null);
    retryCurrent = null;
    publishStatus("device");
  };
}

export type StyleRow = {
  user_id: string;
  theme: string;
  match_device: boolean;
  mode: string;
  heading: string;
  corners: string;
};

export function styleToRow(userId: string, choice: StyleChoice): StyleRow {
  return {
    user_id: userId,
    theme: choice.theme,
    match_device: choice.matchDevice,
    mode: choice.mode,
    heading: choice.heading,
    corners: choice.corners,
  };
}

/** Turn a stored row back into a choice. Anything unknown falls back to the default so a bad row can never break the site. */
export function rowToStyle(row: Partial<StyleRow> | null | undefined): StyleChoice | null {
  if (!row) return null;
  const pick = (value: unknown, allowed: string[], fallback: string) =>
    typeof value === "string" && allowed.includes(value) ? value : fallback;
  return {
    theme: pick(row.theme, THEMES.map((t) => t.id), DEFAULT_STYLE.theme),
    matchDevice: typeof row.match_device === "boolean" ? row.match_device : DEFAULT_STYLE.matchDevice,
    mode: pick(row.mode, ["light", "dark"], DEFAULT_STYLE.mode),
    heading: pick(row.heading, Object.keys(HEADING_FONTS), DEFAULT_STYLE.heading),
    corners: pick(row.corners, Object.keys(RADII), DEFAULT_STYLE.corners),
  };
}

export async function loadAccountStyle(
  userId: string,
  client: Pick<SupabaseClient, "from"> = getSupabase(),
): Promise<StyleChoice | null> {
  const { data, error } = await client.from("user_style").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return rowToStyle(data as StyleRow | null);
}

export async function saveAccountStyle(
  userId: string,
  choice: StyleChoice,
  client: Pick<SupabaseClient, "from"> = getSupabase(),
): Promise<void> {
  const { error } = await client.from("user_style").upsert(styleToRow(userId, choice), { onConflict: "user_id" });
  if (error) throw error;
}
