import type { Poi, SearchRequest } from "./types";
import { straightLineMetres } from "./domain";

export type JourneyStage = SearchRequest["journeyStages"][number];
/** Bounded intent grammar. Ambiguous alternatives remain alternatives, never an implicit AND. */
export function parseJourney(text: string, previous: JourneyStage[], order: SearchRequest["journeyOrder"]) {
  const patterns: [JourneyStage["kind"], RegExp][] = [
    ["cafe", /кофе|каф[еé]|капучино|латте|coffee|кофехана/iu],
    ["park", /парк|саябақ|\bpark\b/iu],
    ["restaurant", /ресторан|\brestaurant\b/iu],
  ];
  let found = patterns.flatMap(([kind, pattern]) => { const match = pattern.exec(text); return match ? [{ kind, at: match.index }] : []; }).sort((a, b) => a.at - b.at);
  if (/(?:^|\s)(?:or|или|немесе)(?:\s|$)/iu.test(text)) return { journeyStages: [], journeyOrder: "any" as const };
  const negated = new Set<JourneyStage["kind"]>();
  if (/(?:не хочу|без|не предлагай|without|no)\s+(?:рестора|restaurant)/iu.test(text)) negated.add("restaurant");
  if (/(?:не хочу|без|не предлагай|without|no)\s+(?:парк|park)/iu.test(text)) negated.add("park");
  if (negated.size) {
    found = found.filter(({ kind }) => !negated.has(kind));
    if (!found.length) return { journeyStages: previous.filter((stage) => !negated.has(stage.kind)), journeyOrder: order };
  }
  const only = /(?:^|\s)(?:только|only|тек)\s+(?:парк|кафе|кофе|рестора|park|coffee|caf[eé]|restaurant|саябақ)/iu.test(text);
  // Do not reinterpret an ordinary single park/café query or an exclusion-only follow-up.
  if (!only && !negated.size && !found.some((s) => s.kind === "restaurant") && found.length < 2) return { journeyStages: previous, journeyOrder: order };
  const cuisines: string[] = [];
  for (const [pattern, value] of [[/итальян|\bitalian\b/iu, "italian"], [/пицц|\bpizza\b/iu, "pizza"], [/саам|\bsami\b/iu, "sami"], [/япон|\bjapanese\b/iu, "japanese"], [/суши|\bsushi\b/iu, "sushi"], [/грузин|\bgeorgian\b/iu, "georgian"], [/китай|\bchinese\b/iu, "chinese"], [/вьетнам|\bvietnamese\b/iu, "vietnamese"], [/корей|\bkorean\b/iu, "korean"], [/турец|\bturkish\b/iu, "turkish"], [/француз|\bfrench\b/iu, "french"], [/мексикан|\bmexican\b/iu, "mexican"], [/казах|\bkazakh\b/iu, "kazakh"], [/узбек|\buzbek\b/iu, "uzbek"], [/индий|\bindian\b/iu, "indian"]] as const) if (pattern.test(text)) cuisines.push(value);
  // Unsupported named cuisine is represented as unverified, not silently ignored.
  const adjective = text.match(/([\p{L}]+ск[\p{L}]*)\s+рестора/iu)?.[1]
    ?? text.match(/\b([a-z]+)\s+restaurant\b/iu)?.[1];
  if (!cuisines.length && (/кухн|cuisine/iu.test(text) || (adjective && !["a", "an", "the", "any", "nearby", "good", "nice", "first", "then", "in", "to"].includes(adjective.toLowerCase())))) cuisines.push("unverified");
  return { journeyStages: found.map(({ kind }) => ({ kind, cuisines: kind === "restaurant" ? cuisines : [] })),
    journeyOrder: /сначала|затем|потом|first|then|алдымен|содан/iu.test(text) ? "ordered" as const : "any" as const };
}
export function matchesStage(poi: Poi, stage: JourneyStage): boolean {
  if (stage.kind !== "restaurant") return poi.category === stage.kind;
  return poi.sourceFacts?.venueType === "restaurant"
    && poi.evidence.some((e) => e.field === "venue_type" && e.value === "restaurant" && e.poiId === poi.id)
    && stage.cuisines.every((cuisine) => poi.sourceFacts?.cuisines.includes(cuisine)
      && poi.evidence.some((e) => e.field === "cuisine" && e.value === cuisine && e.poiId === poi.id));
}
export function stageEvidence(poi: Poi, stage: JourneyStage): string[] {
  return poi.evidence.filter((e) => e.poiId === poi.id && ((e.field === "category" && e.value === poi.category)
    || (stage.kind === "restaurant" && ((e.field === "venue_type" && e.value === "restaurant") || (e.field === "cuisine" && stage.cuisines.includes(String(e.value))))))).map((e) => e.id);
}
/** Small complete combinations, ranked with distances only. Actual feasibility requires walkingRoute. */
export function journeyCombinations(candidates: Poi[], context: SearchRequest, preferred: string[]) {
  const pools = context.journeyStages.map((stage) => candidates.filter((poi) => matchesStage(poi, stage)).slice(0, 4));
  let combinations: Poi[][] = [[]];
  for (const pool of pools) combinations = combinations.flatMap((chosen) => pool.filter((poi) => !chosen.some((p) => p.id === poi.id)).map((poi) => [...chosen, poi]));
  const score = (places: Poi[]) => places.reduce((sum, poi, i) => sum + straightLineMetres(i ? places[i - 1].location : context.origin, poi.location)
    + (preferred.includes(poi.id) ? -100 : 0), context.returnToStart && places.length ? straightLineMetres(places.at(-1)!.location, context.origin) : 0);
  return combinations.sort((a, b) => score(a) - score(b)).slice(0, 3);
}
