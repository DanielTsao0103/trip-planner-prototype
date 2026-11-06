// Every share uses the caller's JWT. Only account-setup email delivery uses the admin key.
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, x-client-info, content-type",
  "Content-Type": "application/json",
};
const reply = (value: unknown, status = 200) =>
  Response.json(value, { status, headers });
const plannerUrl = "https://danieltsao0103.github.io/trip-planner-prototype/";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "POST") return reply({}, 405);
  const authorization = req.headers.get("Authorization");
  if (!authorization) return reply({}, 401);
  const body = await req.json().catch(() => null);
  if (
    !Array.isArray(body?.emails) ||
    !body.emails.length ||
    body.emails.length > 20 ||
    !body.emails.every(
      (e: unknown) =>
        typeof e === "string" &&
        e.length <= 280 &&
        /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(e),
    ) ||
    typeof body.tripId !== "string"
  )
    return reply({ error: "Enter up to 20 valid addresses." }, 400);
  const base = Deno.env.get("SUPABASE_URL");
  const caller = {
    Authorization: authorization,
    apikey: Deno.env.get("SUPABASE_ANON_KEY")!,
    "Content-Type": "application/json",
  };
  const admin = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  async function share(email: string, delivered = false): Promise<string> {
    const r = await fetch(base + "/rest/v1/rpc/share_trip_recipient", {
      method: "POST",
      headers: caller,
      body: JSON.stringify({
        p_trip: body.tripId,
        p_email: email,
        p_delivered: delivered,
      }),
    });
    if (!r.ok) {
      const error = await r.json().catch(() => ({}));
      throw new Error(
        error.code === "P0001" || error.code === "42501"
          ? error.message
          : "Could not share this trip. Try again.",
      );
    }
    return await r.json();
  }
  const results = [];
  for (const email of new Set<string>(
    body.emails.map((s: string) => s.trim().toLowerCase()),
  )) {
    try {
      if ((await share(email)) === "needs_email") {
        const r = await fetch(
          base +
            "/auth/v1/invite?redirect_to=" +
            encodeURIComponent(plannerUrl),
          {
            method: "POST",
            headers: {
              apikey: admin,
              Authorization: "Bearer " + admin,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ email }),
          },
        );
        if (!r.ok) {
          // Another request may have completed registration between the lookup and the mail request.
          if ((await share(email)) !== "shared")
            throw new Error(
              r.status === 429
                ? "Email sending is temporarily limited. Try again later."
                : "The email service could not send an account invitation. Try again later.",
            );
        } else if ((await share(email, true)) !== "shared")
          throw new Error("Email sent. Retry to finish sharing the trip.");
      }
      results.push({ email, ok: true });
    } catch (error) {
      results.push({
        email,
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Could not invite this traveler.",
      });
    }
  }
  return reply({ results });
});
