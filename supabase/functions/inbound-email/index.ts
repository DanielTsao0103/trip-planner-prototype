/**
 * Receives Mailtrap's "new inbound email" webhook and saves forwarded bookings.
 *
 * The webhook is only a nudge. Nothing in its body is trusted or even read: this function asks the
 * Mailtrap API (with a private token) for the newest messages and handles any it has not seen.
 * A message is saved only when its sender address matches the email of an account.
 * Sender addresses can be faked, so this proves "someone typed this account's email", not identity.
 * Only the extracted booking fields are stored, never the whole email.
 *
 * Secrets (Supabase dashboard, Edge Functions, Secrets): MAILTRAP_API_TOKEN, MAILTRAP_INBOX_ID,
 * INBOUND_WEBHOOK_KEY. The webhook URL ends with ?key=<INBOUND_WEBHOOK_KEY>.
 */
import { parseBooking, senderEmail } from "./parse.ts";

const MAX_PER_CALL = 20;
const MAILTRAP = "https://mailtrap.io/api/inbound/inboxes";

function reply(body: string, status: number): Response {
  return new Response(body, { status });
}

function sameText(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function serviceKey(): string {
  const direct = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (direct) return direct;
  try {
    return String(JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default || "");
  } catch {
    return "";
  }
}

type Message = Record<string, unknown>;
const text = (value: unknown): string => (typeof value === "string" ? value : "");

Deno.serve(async (request) => {
  if (request.method !== "POST") return reply("Method not allowed", 405);

  const expected = Deno.env.get("INBOUND_WEBHOOK_KEY") ?? "";
  const given = new URL(request.url).searchParams.get("key") ?? "";
  if (expected.length < 16 || !sameText(given, expected)) return reply("Not allowed", 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const dbKey = serviceKey();
  const mailtrapToken = Deno.env.get("MAILTRAP_API_TOKEN");
  const inboxId = Deno.env.get("MAILTRAP_INBOX_ID");
  if (!supabaseUrl || !dbKey || !mailtrapToken || !inboxId || !/^[0-9]{1,20}$/.test(inboxId)) {
    return reply("Not configured", 503);
  }

  const mailtrap = (path: string) =>
    fetch(`${MAILTRAP}/${inboxId}${path}`, {
      headers: { Authorization: `Bearer ${mailtrapToken}`, "Api-Token": mailtrapToken, Accept: "application/json" },
    });
  const db = (path: string, init: RequestInit = {}) =>
    fetch(`${supabaseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: dbKey,
        Authorization: `Bearer ${dbKey}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });

  // Newest messages first.
  const listing = await mailtrap("/messages");
  if (!listing.ok) return reply("Could not read the inbox", 502);
  const listed = await listing.json().catch(() => null);
  const items: Message[] = Array.isArray(listed)
    ? listed
    : Array.isArray(listed?.messages) ? listed.messages : Array.isArray(listed?.data) ? listed.data : [];
  const ids = items
    .map((m) => String(m.id ?? ""))
    .filter((id) => /^[0-9]{1,30}$/.test(id))
    .slice(0, MAX_PER_CALL);

  let saved = 0;
  for (const id of ids) {
    const seen = await db(`inbound_email_log?select=mailtrap_message_id&mailtrap_message_id=eq.${id}`);
    if (!seen.ok) return reply("Database error", 502);
    if (((await seen.json()) as unknown[]).length > 0) continue;

    const detail = await mailtrap(`/messages/${id}`);
    if (!detail.ok) return reply("Could not read a message", 502);
    const raw = (await detail.json().catch(() => ({}))) as Message;
    const message = ((raw.message as Message | undefined) ?? raw) as Message;

    const from = text(message.from) || text(message.from_email);
    const address = senderEmail(from);
    const log = (status: "saved" | "unmatched" | "ambiguous") =>
      db("inbound_email_log", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify({ mailtrap_message_id: id, status }),
      });

    let owners: { userID: string }[] = [];
    if (address) {
      const found = await db(`user?select=%22userID%22&email=eq.${encodeURIComponent(address)}&limit=2`);
      if (!found.ok) return reply("Database error", 502);
      owners = await found.json();
    }
    if (owners.length !== 1) {
      await log(owners.length > 1 ? "ambiguous" : "unmatched");
      continue;
    }

    const subject = text(message.subject).slice(0, 300);
    const parsed = parseBooking({
      subject,
      text: text(message.text_body) || null,
      html: text(message.html_body) || null,
    });
    const received = Date.parse(text(message.created_at) || text(message.sent_at));
    const insert = await db("forwarded_booking", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({
        owner_id: owners[0].userID,
        mailtrap_message_id: id,
        sender: address,
        subject,
        kind: parsed.kind,
        title: parsed.title,
        start_date: parsed.startDate,
        end_date: parsed.endDate,
        location: parsed.location,
        confirmation_code: parsed.confirmationCode,
        details: { source: parsed.source, originalSender: parsed.originalSender },
        received_at: new Date(Number.isNaN(received) ? Date.now() : received).toISOString(),
      }),
    });
    if (!insert.ok) return reply("Could not save", 502);
    await log("saved");
    saved++;
  }
  return new Response(JSON.stringify({ saved }), { status: 200, headers: { "Content-Type": "application/json" } });
});
