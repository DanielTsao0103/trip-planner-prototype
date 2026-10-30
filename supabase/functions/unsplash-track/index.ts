const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(body: string, status: number): Response {
  return new Response(body, { status, headers: cors });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return reply("", 204);
  if (request.method !== "POST") return reply("Method not allowed", 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return reply("Sign in required", 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
  const publishableKey = publishableKeys.default || Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !publishableKey) return reply("Supabase is not configured", 503);

  const auth = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: publishableKey, Authorization: authorization },
  });
  if (!auth.ok) return reply("Sign in required", 401);

  let photoId: unknown;
  try {
    photoId = (await request.json()).photoId;
  } catch {
    return reply("Invalid request", 400);
  }
  if (typeof photoId !== "string" || !/^[A-Za-z0-9_-]{5,32}$/.test(photoId)) {
    return reply("Invalid photo", 400);
  }

  const key = Deno.env.get("Unsplash_Key");
  if (!key) return reply("Unsplash is not configured", 503);

  try {
    const result = await fetch(`https://api.unsplash.com/photos/${encodeURIComponent(photoId)}/download`, {
      headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" },
    });
    if (!result.ok) return reply("Could not register photo", 502);
    return new Response(JSON.stringify({ tracked: true }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch {
    return reply("Could not reach Unsplash", 502);
  }
});
