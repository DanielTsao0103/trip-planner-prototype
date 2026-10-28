export type Destination = {
  name: string; detail: string; kind: "City" | "Region" | "Country" | "Place";
  label: string; aliases: string; population: number; region: string; country: string;
};
export type WorldData = {
  countries: Record<string, string>; regions: Record<string, string>;
  cities: [string, string, string, number, string][];
};
export const normalize = (text: string) => text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const labelParts = (...parts: (string | undefined)[]) => [...new Set(parts.filter(Boolean))].join(", ");
export function buildIndex(data: WorldData): Destination[] {
  const countryPop: Record<string, number> = {}, regionPop: Record<string, number> = {};
  const cities: Destination[] = data.cities.map(([name, region, country, population, aliases]) => {
    countryPop[country] = (countryPop[country] || 0) + population;
    regionPop[region] = (regionPop[region] || 0) + population;
    const detail = labelParts(data.regions[region] === name ? undefined : data.regions[region], data.countries[country]);
    return {name, detail, label: labelParts(name, detail), kind: "City", aliases: normalize(aliases), population, region, country};
  });
  return [
    ...Object.entries(data.countries).map(([country, name]): Destination => ({ name, detail: "Country", label: name, kind: "Country", aliases: normalize(name), population: countryPop[country] || 0, country, region: "" })),
    ...Object.entries(data.regions).map(([region, name]): Destination => ({ name, detail: data.countries[region.split('.')[0]] || "", label: labelParts(name, data.countries[region.split('.')[0]]), kind: "Region", aliases: normalize(name), population: regionPop[region] || 0, region, country: region.split('.')[0] })),
    ...cities,
  ];
}
export function searchIndex(index: Destination[], query: string): {places: Destination[]; regionMatch: boolean} {
  const q = normalize(query), tokens = q.split(' ');
  const regions = index.filter(p => p.kind !== "City" && normalize(p.name) === q).sort((a,b) => b.population-a.population);
  if (regions.length) {
    const parent = regions[0];
    const cities = index.filter(p => p.kind === "City" && (parent.kind === "Country" ? p.country === parent.country : p.region === parent.region)).sort((a,b)=>b.population-a.population);
    return { places: [parent, ...cities].slice(0,8), regionMatch: true };
  }
  const score = (p: Destination) => {
    const name = normalize(p.name);
    return name === q ? 0 : name.startsWith(q) ? 1 : p.aliases.split(' ').some(a=>a.startsWith(q)) ? 2 : 3;
  };
  const places = index.filter(p => tokens.every(t => normalize(p.label).includes(t) || p.aliases.includes(t)))
    .sort((a,b) => score(a)-score(b) || b.population-a.population).slice(0,8);
  return { places, regionMatch: false };
}
let indexPromise: Promise<Destination[]> | undefined;
export function loadIndex() {
  return indexPromise ??= fetch(new URL('../public/data/destinations.json', import.meta.url).href)
    .then(response => { if (!response.ok) throw new Error('Could not load destinations'); return response.json(); })
    .then(buildIndex).catch(error => { indexPromise = undefined; throw error; });
}
export async function searchWorldwide(query: string, signal: AbortSignal): Promise<Destination[]> {
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q',query); url.searchParams.set('lang','en'); url.searchParams.set('limit','8');
  ['city','state','country','locality','district','county','other'].forEach(layer => url.searchParams.append('layer',layer));
  const response = await fetch(url, { signal, referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error('Place search is unavailable');
  const data = await response.json();
  if (!Array.isArray(data.features)) throw new Error('Invalid place search response');
  return data.features.flatMap((feature: {properties?: Record<string, string>}) => {
    const p = feature.properties;
    if (!p?.name) return [];
    const kind: Destination['kind'] = p.type === 'country' ? 'Country' : p.type === 'state' ? 'Region' : p.type === 'city' ? 'City' : 'Place';
    const detail = labelParts(p.city === p.name ? undefined : p.city, p.state === p.name ? undefined : p.state, p.country === p.name ? undefined : p.country);
    return [{name:p.name, detail:detail || kind, label:labelParts(p.name,detail), kind, aliases:normalize(p.name), population:0, region:'', country:p.countrycode || ''}];
  });
}
export function mergePlaces(local: Destination[], remote: Destination[]): Destination[] {
  const result: Destination[] = [], seen = new Set<string>();
  // Keep strong city matches and reserve room for smaller places from live search.
  for (const place of [...local.slice(0,4), ...remote, ...local.slice(4)]) {
    const key = normalize(place.label);
    if (!seen.has(key)) { seen.add(key); result.push(place); }
  }
  return result.slice(0,8);
}
