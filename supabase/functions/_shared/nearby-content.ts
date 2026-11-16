import { minutes, safeSource, type NearbyResult, type PlanningContext } from "./nearby.ts";

/** Never present a character-sliced fragment as a complete source sentence. */
export function sentenceExcerpt(value: string, preferredLength = 300): string {
  const text = value.replace(/\s+/gu, " ").trim();
  const sentences = [...new Intl.Segmenter(undefined, { granularity: "sentence" }).segment(text)]
    .map(item => item.segment.trim()).filter(sentence => /[.!?。！？][”’"')\]」』]*$/u.test(sentence) && !/(?:\.{2,}|…)[”’"')\]」』]*$/u.test(sentence));
  let excerpt = "";
  for (const sentence of sentences) {
    if (!excerpt && sentence.length <= 1200) excerpt = sentence;
    else if (excerpt && excerpt.length + sentence.length + 1 <= preferredLength) excerpt += " " + sentence;
    else break;
  }
  return excerpt;
}

export function recommendationLocation(result: Pick<NearbyResult, "kind" | "address" | "researchArea">, context: Pick<PlanningContext, "destinations" | "area">): string {
  if (result.kind !== "guide" && result.kind !== "dish" && result.address && result.address !== "Address needs confirmation from the venue") return result.address;
  const area = result.researchArea || (result.kind === "guide" ? result.address : context.area);
  return context.destinations.find(destination => area.toLowerCase().includes(destination.split(/[,，]/u)[0].trim().toLowerCase()))
    || (context.destinations.length === 1 ? context.destinations[0] : "")
    || area.split("·").at(-1)!.split(/[,，]/u).slice(-2).join(",").trim();
}

export function recommendationTitle(result: NearbyResult, context: Pick<PlanningContext, "destinations" | "area">): string {
  return result.kind === "guide" ? recommendationLocation(result, context) : result.name;
}

/** Replace repeated stock notes with this recommendation's own evidence. */
export function distinctRecommendationThoughts(results: NearbyResult[]): NearbyResult[] {
  const seen = new Set<string>();
  return results.map(result => {
    let fitNote = result.fitNote?.trim() || "";
    const key = fitNote.toLocaleLowerCase().replace(/\s+/gu, " ");
    if (!key || seen.has(key) || /^(This option appears in the retrieved sources|We broadened the search)/u.test(fitNote)) {
      const evidence = result.facts.find(fact => safeSource(fact.sourceUrl));
      const complete = evidence && sentenceExcerpt(evidence.detail, 220);
      const excerpt = complete && complete.length + result.name.length + 2 <= 400 ? complete : "";
      fitNote = `${result.name}${excerpt ? `: ${excerpt}` : evidence ? ` — explore the details at ${new URL(evidence.sourceUrl).hostname}.` : ": review this stop alongside your plans."}`;
    }
    seen.add(key); seen.add(fitNote.toLocaleLowerCase().replace(/\s+/gu, " "));
    return { ...result, fitNote };
  });
}

export function recommendationNotes(result: NearbyResult, context: Pick<PlanningContext, "destinations" | "area">): string {
  const lines = [result.kind === "guide" ? `Explore ${recommendationLocation(result, context)} — ${result.name}` : result.kind === "dish" ? `Food to try: ${result.name}` : result.name];
  const used = new Set<string>();
  const add = (value: string) => {
    const clean = value.trim(), key = clean.toLocaleLowerCase().replace(/\s+/gu, " ");
    if (clean && !used.has(key)) { lines.push(clean); used.add(key); }
  };
  if (result.kind === "guide") add("An exploration idea; choose a specific activity and confirm its location, access and price.");
  else if (result.kind === "dish") add(`A specific dish to seek out in ${recommendationLocation(result, context)}; no restaurant is selected.`);
  else if (result.fitNote && !result.fitNote.startsWith("Found during research")) add(result.fitNote);
  for (const fact of result.facts.filter(fact => safeSource(fact.sourceUrl))) {
    add(fact.sourceUrl);
    const detail = fact.topic === "Guide excerpt" ? sentenceExcerpt(fact.detail) : fact.detail.trim();
    if (detail && !lines.some(line => line.includes(detail))) add(`${fact.topic}: ${detail}`);
  }
  // Keep essential links and specific details before optional confirmations.
  for (const concern of result.concerns) if (!/^(Sources were found|Confirm opening hours for the trip date)/u.test(concern)) add(`Confirm: ${concern}`);
  let notes = "";
  for (const line of lines) if (notes.length + line.length + 1 <= 1800) notes += (notes ? "\n" : "") + line;
  return notes;
}

export function recommendationSlot(result: NearbyResult, gaps: { start: string; end: string }[]) {
  const duration = Number.isInteger(result.durationMinutes) && result.durationMinutes >= 15 && result.durationMinutes <= 240 ? result.durationMinutes : 60;
  const proposed = result.proposedTime;
  if (proposed && minutes(proposed.end) - minutes(proposed.start) === duration && gaps.some(gap => minutes(gap.start) <= minutes(proposed.start) && minutes(gap.end) >= minutes(proposed.end))) return proposed;
  const gap = gaps.find(gap => minutes(gap.end) - minutes(gap.start) >= duration);
  if (!gap) return null;
  const end = minutes(gap.start) + duration;
  return { start: gap.start, end: `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}` };
}

export function recommendationGroupCost(result: Pick<NearbyResult, "currency" | "pricePerPersonCents">, travelers: number): number {
  return result.currency === "USD" && result.pricePerPersonCents !== null ? result.pricePerPersonCents * travelers : 0;
}
