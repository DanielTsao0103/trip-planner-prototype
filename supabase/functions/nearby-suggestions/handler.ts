import { distinctRecommendationThoughts } from "../_shared/nearby-content.ts";
import { planningContext, parseSearchLocation, reviewCandidates, type PlanningTrip, type PlanningContext, type EmptyReason, type ReviewRejections } from "../_shared/nearby.ts";
import { assertContextFits, researchWithFreeProviders, ResearchError } from "./providers.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
export type TripSnapshot = { tripID: string; revision: number; start_date: string; end_date: string; timezone: string; destinations: string[]; content: PlanningTrip };
export type ResearchGateway = {
  actor(): Promise<string | null>; trip(id: string): Promise<TripSnapshot | null>;
  reserve(actor: string): Promise<string>; finish(id: string, outcome: "complete" | "failed"): Promise<void>;
  feedbackSignal?(): Promise<{ responses: number; tripSatisfactionRate: number; wouldRecommendRate: number } | null>;
};
export function createNearbyHandler(config: { enabled: boolean; groq?: string; tavily?: string }, gateway: (authorization: string) => ResearchGateway, fetcher: typeof fetch = fetch) {
  // Cached content is private to the authenticated actor and exact current trip
  // snapshot. Every hit still rechecks the actor, membership and revision.
  const cache = new Map<string, { expires: number; body: Record<string, unknown> }>();
  const pending = new Map<string, Promise<Record<string, unknown>>>();
  const cacheLifetime = 120_000;
  return async (request: Request): Promise<Response> => {
    const started = performance.now();
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return reply({ message: "Use POST." }, 405);
    let service: ResearchGateway | undefined;
    try {
      service = gateway(request.headers.get("Authorization") || "");
      const actor = await service.actor();
      if (!actor) return reply({ message: "Sign in to research places for your trip." }, 401);
      let body;
      try { const text = await request.text(); if (text.length > 4096) return reply({ message: "Request too large." }, 413); body = JSON.parse(text); }
      catch { return reply({ message: "Invalid research request." }, 400); }
      if (!body || typeof body.tripId !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(body.tripId) || !["lunch", "dinner", "activity"].includes(body.intent) || typeof body.date !== "string" || !Number.isInteger(body.revision) || (body.anchorId !== undefined && (typeof body.anchorId !== "string" || body.anchorId.length > 100))) return reply({ message: "Choose a trip, day and category." }, 400);
      // Existing database membership rules authorize the authoritative snapshot.
      const row = await service.trip(body.tripId);
      if (!row?.content) return reply({ message: "This trip is unavailable or you no longer have access." }, 403);
      if (row.revision !== body.revision) return reply({ message: "The trip changed. Wait for the latest changes to load, then try again." }, 409);
      let searchLocation;
      try { searchLocation = parseSearchLocation(body.location); }
      catch { return reply({ message: "Choose a valid search location." }, 400); }
      let context: PlanningContext;
      try { context = planningContext({ ...row.content, id: row.tripID, start: row.start_date, end: row.end_date, zone: row.timezone, destinations: row.destinations }, actor, body.date, body.intent, body.anchorId, new Date(), searchLocation); }
      catch { return reply({ message: "Choose a day within this trip." }, 400); }
      if (!context.area) return reply({ results: [], emptyReason: "missing_area", checkedAt: new Date().toISOString() });
      if (!config.enabled || !config.groq || !config.tavily) return reply({ message: "Nearby research is not connected yet. Your trip and preferences are ready; please try again once the service is enabled." }, 503);
      assertContextFits(context); // Reject oversized context before consuming any quota.
      const key = JSON.stringify([actor, body.tripId, row.revision, context]);
      const cached = cache.get(key);
      if (cached && cached.expires > Date.now()) return reply({ ...cached.body, cached: true, elapsedMs: Math.round(performance.now() - started) });
      if (cached) cache.delete(key);
      const inFlight = pending.get(key);
      if (inFlight) return reply({ ...await inFlight, cached: true, elapsedMs: Math.round(performance.now() - started) });
      const generate = async () => {
        let reservation: string | undefined;
        try {
          // Aggregate feedback is optional context, never a serial gate before a
          // useful search. Bound its wait and avoid it entirely for cached hits.
          const feedback = service!.feedbackSignal?.().catch(() => null);
          if (feedback) {
            let timer: ReturnType<typeof setTimeout> | undefined;
            try { context.feedbackSignal = await Promise.race([feedback, new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 250); })]); }
            finally { if (timer) clearTimeout(timer); }
          }
          reservation = await service!.reserve(actor);
          const research = await researchWithFreeProviders(context, { groq: config.groq!, tavily: config.tavily! }, fetcher);
          const rejected: ReviewRejections = {};
          const reviewed = reviewCandidates(research.candidates, context, research.sources, rejected);
          const results = distinctRecommendationThoughts(reviewed);
          if (research.candidateCount && !research.candidates.length) rejected.invalid = research.candidateCount;
          const reasons = Object.keys(rejected) as (keyof ReviewRejections)[];
          const emptyReason: EmptyReason | undefined = results.length ? undefined : !research.sourceCount ? "no_sources" : !research.candidateCount ? "no_candidates" : reasons.length === 1 ? reasons[0] : "filtered";
          await service!.finish(reservation, "complete");
          const resultBody = { results, emptyReason, diagnostics: { sourcesFound: research.sourceCount, sourcesUsed: research.sources.length, candidatesReturned: research.candidateCount, recoveryAttempted: research.recoveryAttempted, rejected, yelpStatus: research.yelpStatus, yelpSourcesUsed: research.yelpSourcesUsed }, checkedAt: new Date().toISOString(), revision: row.revision };
          // Do not retain an empty/provider-failed answer that prevents retry.
          if (results.length) {
            for (const [oldKey, value] of cache) if (value.expires <= Date.now()) cache.delete(oldKey);
            while (cache.size >= 64) cache.delete(cache.keys().next().value!);
            cache.set(key, { expires: Date.now() + cacheLifetime, body: resultBody });
          }
          return resultBody;
        } catch (error) {
          if (reservation) await service!.finish(reservation, "failed").catch(() => undefined);
          const failure = error instanceof ResearchError ? error : new ResearchError("Research could not be completed with reliable sources. Please try later.");
          if (reservation) Object.assign(failure, { attemptUsed: true });
          throw failure;
        }
      };
      const work = generate();
      pending.set(key, work);
      try { return reply({ ...await work, cached: false, elapsedMs: Math.round(performance.now() - started) }); }
      finally { pending.delete(key); }
    } catch (error) {
      return reply({ message: error instanceof ResearchError ? error.message : "Research could not be completed with reliable sources. Please try later.", ...(error && typeof error === "object" && "attemptUsed" in error ? { attemptUsed: true } : {}) }, error instanceof ResearchError ? error.status : 502);
    }
  };
}
