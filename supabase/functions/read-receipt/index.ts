import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { readReceiptWithVision } from "./vision.ts";

const allowedOrigins = new Set([
  "https://danieltsao0103.github.io",
  ...(Deno.env.get("RECEIPT_EXTRA_ORIGINS") ?? "").split(",").map(value => value.trim()),
]);
const maxBytes = 10 * 1024 * 1024;
const supported = new Set(["image/jpeg", "image/png", "image/webp"]);

Deno.serve(async request => {
  const origin = request.headers.get("origin") ?? "";
  const headers = {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "",
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
  const fail = (status: number) => Response.json({ error: "Receipt scan unavailable." }, { status, headers });
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST") return fail(405);
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return fail(401);
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return fail(503);
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { persistSession: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return fail(401);
  // Enable the paid pilot only for explicitly listed accounts.
  const pilot = (Deno.env.get("RECEIPT_VISION_USER_IDS") ?? "").split(",").map(id => id.trim());
  if (!pilot.includes(data.user.id)) return fail(403);
  const type = request.headers.get("content-type") ?? "";
  if (!supported.has(type)) return fail(415);
  const reader = request.body?.getReader();
  if (!reader) return fail(400);
  try {
    const parts: Uint8Array<ArrayBuffer>[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        return fail(413);
      }
      parts.push(new Uint8Array(value));
    }
    if (!length) return fail(400);
    const photo = new Blob(parts, { type });
    const result = await readReceiptWithVision(photo, apiKey, Deno.env.get("RECEIPT_VISION_MODEL") || "gpt-4.1-mini");
    return Response.json(result, { headers });
  } catch {
    return fail(502);
  }
});
