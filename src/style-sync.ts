/** Implementation status: the signed-in account's Style page choices are stored in Supabase (public.user_style, with every change logged in public.user_style_log). Demo mode stays browser-only. See ../IMPLEMENTATION_STATUS.md. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "./supabase.ts";
import { THEMES, HEADING_FONTS, RADII, DEFAULT_STYLE, type StyleChoice } from "./theme.ts";

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
