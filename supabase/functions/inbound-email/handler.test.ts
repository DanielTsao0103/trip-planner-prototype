import assert from "node:assert/strict";
import { test } from "node:test";
import { handleInbound } from "./handler.ts";

/** In-memory provider/database: these tests never contact a real inbox or account. */
function fixture(
  pages: Record<string, unknown>,
  options: {
    from?: string;
    malformedDetail?: boolean;
    failLog?: boolean;
    failDetail?: string;
    subject?: string;
    body?: string;
    invalidCode?: boolean;
    failResolve?: boolean;
  } = {},
) {
  const seen = new Set<string>();
  const saved = new Map<string, Record<string, unknown>>();
  const paths: string[] = [];
  const env: Record<string, string> = {
    INBOUND_WEBHOOK_KEY: "test-only-webhook-key",
    SUPABASE_URL: "https://database.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "test-only",
    MAILTRAP_API_TOKEN: "test-only",
    MAILTRAP_INBOX_ID: "1",
  };
  const json = (value: unknown, status = 200) =>
    Response.json(value, { status });
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    paths.push(url.pathname + url.search);
    if (url.hostname === "mailtrap.io") {
      const match = url.pathname.match(/\/messages\/([^/]+)$/);
      if (!match) return json(pages[url.searchParams.get("last_id") ?? ""]);
      if (options.failDetail === match[1]) return json({}, 502);
      if (options.malformedDetail) return new Response("not json");
      return json({
        from: options.from ?? "Traveler <traveler@example.invalid>",
        subject: options.subject ?? `[SC:${"a".repeat(48)}] Booking`,
        text_body: options.body ?? "Hotel confirmed",
        received_at: "2026-11-16T10:00:00Z",
      });
    }
    if (url.pathname.endsWith("/rpc/resolve_booking_forwarding_code")) {
      if (options.failResolve) return json({}, 503);
      return json(
        options.invalidCode ? null : "11111111-1111-4111-8111-111111111111",
      );
    }
    if (url.pathname.endsWith("/inbound_email_log")) {
      if (init.method === "POST") {
        if (options.failLog) return json({}, 503);
        seen.add(JSON.parse(String(init.body)).mailtrap_message_id);
        return json([]);
      }
      const id = url.searchParams.get("mailtrap_message_id")!.slice(3);
      return json(seen.has(id) ? [{ mailtrap_message_id: id }] : []);
    }
    if (url.pathname.endsWith("/forwarded_booking")) {
      const row = JSON.parse(String(init.body));
      // Model the actual unique key and ignore-duplicates behavior across retries.
      if (!saved.has(row.mailtrap_message_id))
        saved.set(row.mailtrap_message_id, row);
      return json([]);
    }
    throw new Error(`Unexpected fake request: ${url.pathname}`);
  };
  const request = () =>
    handleInbound(
      new Request("https://function.invalid/?key=test-only-webhook-key", {
        method: "POST",
      }),
      (key) => env[key],
      fetcher,
    );
  return { request, seen, saved, paths };
}

test("processes more than twenty messages and follows opaque cursor pages, skipping seen records", async () => {
  const first = Array.from({ length: 21 }, (_, i) => ({ id: `msg_${30 - i}` }));
  const f = fixture({
    "": { data: first, last_id: "msg_10" },
    msg_10: { data: [{ id: "msg_9" }], last_id: null },
  });
  first.slice(0, 20).forEach((message) => f.seen.add(message.id));
  const response = await f.request();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { saved: 2 });
  assert.deepEqual([...f.saved.keys()], ["msg_10", "msg_9"]);
  assert.equal(f.saved.get("msg_10")?.received_at, "2026-11-16T10:00:00.000Z");
  assert.ok(f.paths.includes("/api/inbound/inboxes/1/messages?last_id=msg_10"));
  assert.deepEqual(await (await f.request()).json(), { saved: 0 });
});

test("does not acknowledge a failed processing log and retries without duplicate bookings", async () => {
  const options = { failLog: true };
  const f = fixture({ "": [{ id: "1" }] }, options);
  assert.equal((await f.request()).status, 502);
  assert.equal(f.saved.size, 1);
  options.failLog = false;
  assert.equal((await f.request()).status, 200);
  assert.equal(f.saved.size, 1);
  assert.equal(f.seen.has("1"), true);
});

test("partial provider failure retains progress and retries the unprocessed message", async () => {
  const options = { failDetail: "2" };
  const f = fixture(
    { "": { data: [{ id: "1" }, { id: "2" }], last_id: null } },
    options,
  );
  assert.equal((await f.request()).status, 502);
  assert.deepEqual([...f.saved.keys()], ["1"]);
  options.failDetail = "";
  assert.deepEqual(await (await f.request()).json(), { saved: 1 });
  assert.deepEqual([...f.saved.keys()], ["1", "2"]);
});

test("rejects malformed listing and repeated cursors instead of silently claiming completion", async () => {
  assert.equal(
    (await fixture({ "": { unexpected: [] } }).request()).status,
    502,
  );
  const loop = fixture({
    "": { data: [], last_id: "again" },
    again: { data: [], last_id: "again" },
  });
  assert.equal((await loop.request()).status, 502);
  assert.equal(loop.paths.length, 2);
});

test("rejects unsafe message identifiers before constructing detail or database queries", async () => {
  const f = fixture({ "": [{ id: "../../other" }] });
  assert.equal((await f.request()).status, 502);
  assert.equal(f.paths.length, 1);
});

test("spoofed From and codes buried in the body cannot authorize a booking", async () => {
  for (const subject of [
    "Booking",
    `[SC:${"a".repeat(47)}] Booking`,
    `[SC:${"a".repeat(48)}] [SC:${"b".repeat(48)}] Booking`,
  ]) {
    const f = fixture(
      { "": [{ id: "1" }] },
      { subject, body: `[SC:${"a".repeat(48)}] Hotel confirmed` },
    );
    assert.equal((await f.request()).status, 200);
    assert.equal(f.saved.size, 0);
    assert.equal(
      f.paths.some((path) => path.includes("resolve_booking_forwarding_code")),
      false,
    );
  }
});

test("invalid or revoked codes cannot route bookings, while resolver outages remain retryable", async () => {
  const invalid = fixture({ "": [{ id: "1" }] }, { invalidCode: true });
  assert.equal((await invalid.request()).status, 200);
  assert.equal(invalid.saved.size, 0);
  const failed = fixture({ "": [{ id: "1" }] }, { failResolve: true });
  assert.equal((await failed.request()).status, 502);
  assert.equal(failed.seen.size, 0);
});

test("only the code's owner receives the booking and credentials are removed before extraction", async () => {
  const marker = `[SC:${"a".repeat(48)}]`;
  const f = fixture(
    { "": [{ id: "1" }] },
    {
      subject: `${marker} Hotel confirmed`,
      body: `Subject: ${marker} Hotel confirmed`,
    },
  );
  assert.equal((await f.request()).status, 200);
  const booking = f.saved.get("1")!;
  assert.equal(booking.owner_id, "11111111-1111-4111-8111-111111111111");
  assert.equal(booking.subject, "Hotel confirmed");
  assert.equal(JSON.stringify(booking).includes("a".repeat(48)), false);
  assert.equal(
    f.paths.some((path) => path.includes("/user")),
    false,
  );
});


test("a valid code works without a parseable From address", async () => {
  const f = fixture({ "": [{ id: "1" }] }, { from: "" });
  assert.equal((await f.request()).status, 200);
  assert.equal(f.saved.get("1")?.sender, "");
});


test("malformed provider details are retried rather than logged as processed", async () => {
  const f = fixture({ "": [{ id: "1" }] }, { malformedDetail: true });
  assert.equal((await f.request()).status, 502);
  assert.equal(f.saved.size, 0);
  assert.equal(f.seen.size, 0);
});
