const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(body: string, status: number): Response {
  return new Response(status === 204 ? null : body, { status, headers: cors });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return reply("", 204);
  if (request.method !== "POST") return reply("Method not allowed", 405);

  const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
  const publishableKey = publishableKeys.default || Deno.env.get("SUPABASE_ANON_KEY");
  if (!publishableKey) return reply("Supabase is not configured", 503);
  if (request.headers.get("apikey") !== publishableKey) return reply("Invalid API key", 401);

  let downloadLocation: unknown;
  try {
    downloadLocation = (await request.json()).downloadLocation;
  } catch {
    return reply("Invalid request", 400);
  }
  if (typeof downloadLocation !== "string" || downloadLocation.length > 512) {
    return reply("Invalid photo", 400);
  }
  let downloadUrl: URL;
  try {
    downloadUrl = new URL(downloadLocation);
  } catch {
    return reply("Invalid photo", 400);
  }
  if (downloadUrl.protocol !== "https:" || downloadUrl.hostname !== "api.unsplash.com" ||
      downloadUrl.port || downloadUrl.username || downloadUrl.password || downloadUrl.hash ||
      !/^\/photos\/[A-Za-z0-9_-]{5,32}\/download$/.test(downloadUrl.pathname)) {
    return reply("Invalid photo", 400);
  }

  const key = Deno.env.get("Unsplash_Key");
  if (!key) return reply("Unsplash is not configured", 503);

  try {
    const result = await fetch(downloadUrl, {
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
