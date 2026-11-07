import { getSupabase, passwordCheckClient } from "./supabase";

/** Rename the signed-in account everywhere (profile, trip traveler rows, sign-in metadata). */
export async function saveAccountName(name: string): Promise<void> {
  const client = getSupabase();
  const saved = await client.rpc("set_account_name", { p_name: name.trim() });
  if (saved.error)
    throw new Error(
      saved.error.code === "22023"
        ? "Enter a name of 1 to 90 characters."
        : "Could not save your name. Please try again.",
    );
  // Pull the updated name into this browser's session so every screen shows it right away.
  // The name is already saved, so a failure here only means the change appears after a reload.
  await client.auth.refreshSession();
}

/** Change the password of an email account after confirming the current one. */
export async function changeAccountPassword(email: string, current: string, next: string): Promise<void> {
  // Check the current password on a separate client so a wrong guess never affects this session.
  const check = await passwordCheckClient().auth.signInWithPassword({ email, password: current });
  if (check.error) {
    if (check.error.status === 429) throw new Error("Too many attempts. Please wait a few minutes and try again.");
    if (check.error.code === "invalid_credentials") throw new Error("Your current password is incorrect.");
    throw new Error("Could not check your current password. Please try again.");
  }
  const updated = await getSupabase().auth.updateUser({ password: next });
  if (updated.error) {
    const code = updated.error.code;
    if (code === "same_password") throw new Error("Choose a password that is different from your current one.");
    if (code === "weak_password") throw new Error("That password is too easy to guess. Try a longer or less common one.");
    if (code === "reauthentication_needed" || /reauthenticat/i.test(updated.error.message))
      throw new Error("For security, log out, log back in, and try again.");
    throw new Error("Could not change your password. Please try again.");
  }
}
