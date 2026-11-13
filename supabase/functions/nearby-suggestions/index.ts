import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { createNearbyHandler } from "./handler.ts";
import { ResearchError } from "./providers.ts";

Deno.serve(request => {
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return createNearbyHandler({ enabled: Deno.env.get("NEARBY_AI_ENABLED") === "true", groq: Deno.env.get("GROQ_API_KEY"), tavily: Deno.env.get("TAVILY_API_KEY") }, authorization => {
    const client = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const admin = () => { if (!serviceKey) throw new ResearchError("Research is not configured yet.", 503); return createClient(url, serviceKey, { auth: { persistSession: false } }); };
    return {
      async actor() { const { data, error } = await client.auth.getUser(); return error ? null : data.user?.id || null; },
      async trip(id) { const { data, error } = await client.rpc("nearby_trip_context", { p_trip_id: id }); return error ? null : data; },
      async reserve(actor) { const { data, error } = await admin().rpc("reserve_nearby_generation", { p_actor: actor }); if (error) throw new ResearchError(error.code === "P0001" ? error.message : "Research limits are unavailable. Please try later.", error.code === "P0001" ? 429 : 503); return data as string; },
      async finish(id, outcome) { await admin().rpc("finish_nearby_generation", { p_request: id, p_outcome: outcome }); },
    };
  })(request);
});
