import { getSupabase, inviteProofClient } from "./supabase";

const key = "trip-planner-invite-entry-v1";
export type InviteClaim = {
  trip: string;
  ticket: string;
  email: string;
  canSetup: boolean;
  /** A plain notification URL carries a trip identifier, never login credentials. */
  notice?: boolean;
  /** An existing membership belongs to this account even when the email is forwarded. */
  accountId?: string | null;
};
type Entry = {
  trip: string | null;
  access: string;
  refresh: string;
  claim?: InviteClaim;
  choosing?: boolean;
  authMode?: "signup" | "login";
  notice?: boolean;
  error?: string;
};

/** Run before the planner Auth client sees the URL, so the invite cannot replace an existing login. */
function capture(): Entry | null {
  const url = new URL(location.href);
  const hash = new URLSearchParams(url.hash.slice(1));
  const notice = url.searchParams.has("trip_notice");
  if (notice || url.searchParams.has("trip_invite")) {
    const access = notice ? null : hash.get("access_token");
    const refresh = notice ? null : hash.get("refresh_token");
    const entry: Entry = {
      trip: url.searchParams.get(notice ? "trip_notice" : "trip_invite"),
      notice,
      access: access || "",
      refresh: refresh || "",
    };
    if (hash.has("error") || url.searchParams.has("error"))
      entry.error =
        "This invitation link is incomplete or expired. Ask the trip owner for a fresh invitation.";
    url.searchParams.delete("trip_invite");
    url.searchParams.delete("trip_notice");
    url.hash = "";
    history.replaceState(history.state, "", url);
    sessionStorage.removeItem("trip-planner-demo-session");
    sessionStorage.setItem(key, JSON.stringify(entry));
    return entry;
  }
  try {
    return JSON.parse(sessionStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}
export let inviteEntry = capture();

export function storeInvite(): void {
  sessionStorage.setItem(key, JSON.stringify(inviteEntry));
}
export function leaveInvite(): void {
  sessionStorage.removeItem(key);
  inviteEntry = null;
}

export async function verifiedInviteClient() {
  if (!inviteEntry) throw new Error("Open your invitation email again.");
  // A traveler who opened the old setup form before this release may still have
  // its emailed session, but no hash. The server checks the same OTP proof.
  if (!inviteEntry.access || !inviteEntry.refresh) {
    const { data } = await getSupabase().auth.getSession();
    if (!data.session)
      throw new Error(
        "Open the link in your invitation email, or ask the owner for a fresh link.",
      );
    inviteEntry.access = data.session.access_token;
    inviteEntry.refresh = data.session.refresh_token;
  }
  const client = inviteProofClient();
  const result = await client.auth.setSession({
    access_token: inviteEntry.access,
    refresh_token: inviteEntry.refresh,
  });
  if (result.error || !result.data.session)
    throw new Error(
      "Invitation expired. Ask the trip owner for a fresh invitation.",
    );
  inviteEntry.access = result.data.session.access_token;
  inviteEntry.refresh = result.data.session.refresh_token;
  storeInvite();
  return client;
}

export async function openInvite(): Promise<InviteClaim> {
  if (!inviteEntry || inviteEntry.error)
    throw new Error(inviteEntry?.error || "No invitation found.");
  if (inviteEntry.notice) {
    if (!inviteEntry.trip || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inviteEntry.trip))
      throw new Error("This invitation link is incomplete. Ask the trip owner for a fresh invitation.");
    return { trip: inviteEntry.trip, ticket: "", email: "", canSetup: false, notice: true };
  }
  const client = await verifiedInviteClient();
  const { data, error } = await client.rpc("open_trip_invite", {
    p_trip: inviteEntry.trip,
    // Revalidate setup status without invalidating this tab's existing ticket.
    ...(inviteEntry.claim?.ticket ? { p_ticket: inviteEntry.claim.ticket } : {}),
  });
  if (error || !data?.ticket)
    throw new Error(
      "Couldn’t open this invitation. Retry, or ask the trip owner for a fresh link.",
    );
  inviteEntry.claim = data;
  storeInvite();
  return data;
}
