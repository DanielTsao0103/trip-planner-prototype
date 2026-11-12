/** Implementation status: the Admin page reads and edits public.admin_email in Supabase; row-level security and private.is_admin() decide who may. Demo accounts never reach it. See ../IMPLEMENTATION_STATUS.md. */
import { useEffect, useState } from "react";
import { getSupabase } from "./supabase.ts";
import { normalizeAdminEmail, sortAdminEntries, type AdminEntry } from "./admin.ts";

/** Ask the database whether the signed-in account is an admin. A failed check means "no". */
export async function checkIsAdmin(): Promise<boolean> {
  const { data, error } = await getSupabase().rpc("is_admin");
  return !error && data === true;
}

const known = new Map<string, boolean>();

/**
 * Whether to show admin entry points. `null` while the first check for this account is running.
 * Only real (cloud) accounts are ever checked; the answer is remembered for the account per visit.
 */
export function useIsAdmin(cloud: boolean, userId: string | undefined): boolean | null {
  const cached = cloud && userId ? known.get(userId) : false;
  const [result, setResult] = useState<{ userId?: string; value: boolean } | null>(null);
  useEffect(() => {
    if (!cloud || !userId || known.has(userId)) return;
    let active = true;
    void checkIsAdmin()
      .catch(() => false)
      .then((value) => {
        known.set(userId, value);
        if (active) setResult({ userId, value });
      });
    return () => {
      active = false;
    };
  }, [cloud, userId]);
  if (!cloud || !userId) return false;
  if (cached !== undefined) return cached;
  return result?.userId === userId ? result.value : null;
}

/** Record a fresh answer, for example when the Admin page finds the account no longer has access. */
export function rememberAdmin(userId: string, value: boolean): void {
  known.set(userId, value);
}

export async function listAdminEntries(): Promise<AdminEntry[]> {
  const { data, error } = await getSupabase().from("admin_email").select("email, added_at");
  if (error) throw new Error("Could not load the admin list. Please try again.");
  return sortAdminEntries(
    (data ?? []).map((row: { email: string; added_at: string }) => ({ email: row.email, addedAt: row.added_at })),
  );
}

export async function addAdminEmail(raw: string): Promise<void> {
  const email = normalizeAdminEmail(raw);
  const { error } = await getSupabase().from("admin_email").insert({ email });
  if (!error) return;
  if (error.code === "23505") throw new Error("That email already has admin access.");
  if (error.code === "23514") throw new Error("Enter a valid email address.");
  if (error.code === "42501") throw new Error("Your account no longer has admin access.");
  throw new Error("Could not add that email. Please try again.");
}

export async function removeAdminEmail(raw: string): Promise<void> {
  const email = normalizeAdminEmail(raw);
  const { data, error } = await getSupabase().from("admin_email").delete().eq("email", email).select("email");
  if (error) {
    if (error.code === "PT422") throw new Error("The list must keep at least one admin email.");
    throw new Error("Could not remove that email. Please try again.");
  }
  // Row-level security hides rows from a delete instead of failing, so an empty result is not success.
  if (!data?.length) throw new Error("That email was not removed. Refresh the list and try again.");
}
