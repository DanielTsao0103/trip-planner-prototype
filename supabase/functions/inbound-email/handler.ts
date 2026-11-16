/**
 * Receives Mailtrap's "new inbound email" webhook and saves forwarded bookings.
 *
 * The webhook is only a nudge. Nothing in its body is trusted or even read: this function asks the
 * Mailtrap API (with a private token) for the newest messages and handles any it has not seen.
 * A message is assigned only by an account-issued private forwarding code in its outer subject.
 * Sender addresses are display metadata, never proof of account ownership.
 * Only the extracted booking fields are stored, never the whole email.
 *
 * Secrets (Supabase dashboard, Edge Functions, Secrets): MAILTRAP_API_TOKEN, MAILTRAP_INBOX_ID,
 * INBOUND_WEBHOOK_KEY. The webhook URL ends with ?key=<INBOUND_WEBHOOK_KEY>.
 */
import {
  parseBooking,
  senderEmail,
  forwardingSubject,
  stripForwardingCodes,
} from "./parse.ts";

const MAX_PAGES = 100;
const REQUEST_TIMEOUT_MS = 45000;
const MAILTRAP = "https://mailtrap.io/api/inbound/inboxes";

function reply(body: string, status: number): Response {
  return new Response(body, { status });
}

function sameText(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++)
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function serviceKey(env: ReadEnvironment): string {
  const direct = env("SUPABASE_SERVICE_ROLE_KEY");
  if (direct) return direct;
  try {
    return String(
      JSON.parse(env("SUPABASE_SECRET_KEYS") || "{}").default || "",
    );
  } catch {
    return "";
  }
}

type Message = Record<string, unknown>;
const text = (value: unknown): string =>
  typeof value === "string" ? value : "";

type ReadEnvironment = (key: string) => string | undefined;

/** Dependency injection keeps retry and pagination checks away from real inboxes. */
export async function handleInbound(
  request: Request,
  env: ReadEnvironment,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  if (request.method !== "POST") return reply("Method not allowed", 405);

  const expected = env("INBOUND_WEBHOOK_KEY") ?? "";
  const given = new URL(request.url).searchParams.get("key") ?? "";
  if (expected.length < 16 || !sameText(given, expected))
    return reply("Not allowed", 401);

  const supabaseUrl = env("SUPABASE_URL");
  const dbKey = serviceKey(env);
  const mailtrapToken = env("MAILTRAP_API_TOKEN");
  const inboxId = env("MAILTRAP_INBOX_ID");
  if (
    !supabaseUrl ||
    !dbKey ||
    !mailtrapToken ||
    !inboxId ||
    !/^[0-9]{1,20}$/.test(inboxId)
  ) {
    return reply("Not configured", 503);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const mailtrap = (path: string) =>
      fetcher(`${MAILTRAP}/${inboxId}${path}`, {
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${mailtrapToken}`,
          "Api-Token": mailtrapToken,
          Accept: "application/json",
        },
      });
    const db = (path: string, init: RequestInit = {}) =>
      fetcher(`${supabaseUrl}/rest/v1/${path}`, {
        signal: controller.signal,
        ...init,
        headers: {
          apikey: dbKey,
          Authorization: `Bearer ${dbKey}`,
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
      });

    // The provider returns newest-first cursor pages. Previously a fixed slice of
    // the newest messages prevented older unseen bookings from ever being read.
    let saved = 0;
    let cursor = "";
    const visited = new Set<string>();
    for (let page = 0; page < MAX_PAGES; page++) {
      const listing = await mailtrap(
        `/messages${cursor ? `?last_id=${encodeURIComponent(cursor)}` : ""}`,
      );
      if (!listing.ok) return reply("Could not read the inbox", 502);
      const listed = await listing.json().catch(() => null);
      const items: Message[] | null = Array.isArray(listed)
        ? listed
        : Array.isArray(listed?.messages)
          ? listed.messages
          : Array.isArray(listed?.data)
            ? listed.data
            : null;
      if (!items) return reply("Could not read the inbox", 502);
      for (const item of items) {
        const id = String(item.id ?? "");
        // Opaque provider IDs are safe path segments after validation and encoding.
        if (!/^[A-Za-z0-9_-]{1,200}$/.test(id))
          return reply("Unsupported message identifier", 502);
        const seen = await db(
          `inbound_email_log?select=mailtrap_message_id&mailtrap_message_id=eq.${encodeURIComponent(id)}`,
        );
        if (!seen.ok) return reply("Database error", 502);
        if (((await seen.json()) as unknown[]).length > 0) continue;

        const detail = await mailtrap(`/messages/${encodeURIComponent(id)}`);
        if (!detail.ok) return reply("Could not read a message", 502);
        const raw = await detail.json().catch(() => null);
        if (!raw || typeof raw !== "object" || Array.isArray(raw))
          return reply("Could not read a message", 502);
        const message = raw.message ?? raw;
        if (!message || typeof message !== "object" || Array.isArray(message))
          return reply("Could not read a message", 502);

        const from = text(message.from) || text(message.from_email);
        const address = senderEmail(from);
        const log = (status: "saved" | "unmatched" | "ambiguous") =>
          db("inbound_email_log", {
            method: "POST",
            headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
            body: JSON.stringify({ mailtrap_message_id: id, status }),
          });

        const forwarding = forwardingSubject(text(message.subject));
        let owner: string | null = null;
        if (forwarding) {
          const resolved = await db("rpc/resolve_booking_forwarding_code", {
            method: "POST",
            body: JSON.stringify({ p_code: forwarding.code }),
          });
          if (!resolved.ok)
            return reply("Could not verify forwarding code", 502);
          const account = await resolved.json();
          if (
            account !== null &&
            (typeof account !== "string" || !/^[0-9a-f-]{36}$/i.test(account))
          )
            return reply("Could not verify forwarding code", 502);
          owner = account;
        }
        if (!owner || !forwarding) {
          if (!(await log("unmatched")).ok)
            return reply("Could not record message status", 502);
          continue;
        }

        const subject = forwarding.subject.slice(0, 300);
        const parsed = parseBooking({
          subject,
          text: stripForwardingCodes(text(message.text_body)) || null,
          html: stripForwardingCodes(text(message.html_body)) || null,
        });
        const received = Date.parse(
          text(message.received_at) ||
            text(message.created_at) ||
            text(message.sent_at),
        );
        const insert = await db("forwarded_booking", {
          method: "POST",
          headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
          body: JSON.stringify({
            owner_id: owner,
            mailtrap_message_id: id,
            sender: address ?? "",
            subject,
            kind: parsed.kind,
            title: parsed.title,
            start_date: parsed.startDate,
            end_date: parsed.endDate,
            location: parsed.location,
            confirmation_code: parsed.confirmationCode,
            details: {
              source: parsed.source,
              originalSender: parsed.originalSender,
              startTime: parsed.startTime,
            },
            received_at: new Date(
              Number.isNaN(received) ? Date.now() : received,
            ).toISOString(),
          }),
        });
        if (!insert.ok) return reply("Could not save", 502);
        if (!(await log("saved")).ok)
          return reply("Could not record message status", 502);
        saved++;
      }
      const next = listed?.last_id;
      if (next === null || next === undefined || next === "") {
        return new Response(JSON.stringify({ saved }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (typeof next !== "string" || next.length > 200 || visited.has(next))
        return reply("Invalid inbox cursor", 502);
      visited.add(next);
      cursor = next;
    }
    // Never acknowledge success for an incomplete traversal. Already committed
    // messages are skipped on retry, so bounded calls can safely resume progress.
    return reply("Inbox processing incomplete; retry required", 503);
  } catch {
    return reply("Inbox processing interrupted; retry required", 503);
  } finally {
    clearTimeout(timer);
  }
}
