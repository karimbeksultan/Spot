/** Server-only domain rules. Independent of any SDK; source text is never executable. */
export const ASTANA_TIME_ZONE = "Asia/Almaty";
export type Point = { longitude: number; latitude: number };
export type TriState = true | false | null;
export type Feature = "outlets" | "wheelchair" | "indoor" | "quiet";
export type Category = "park" | "cafe" | "museum" | "landmark" | "playground" | "other";
export type FactKey = "category" | "opening_hours" | "venue_type" | "cuisine" | Feature;
export type Evidence = {
  id: string;
  poiId: string;
  field: FactKey;
  value: string | boolean;
  sourceUrl: string;
  fetchedAt: string;
  /** Source publication/verification date, never automatically equal to fetchedAt. */
  confirmedAt: string | null;
};
export type OpeningCoverage = {
  /** Only a tested opening-hours parser may construct these absolute UTC intervals. */
  coverageStart: string;
  coverageEnd: string;
  intervals: { start: string; end: string }[];
  evidenceId: string;
};
export type Poi = {
  id: string;
  name: string;
  location: Point;
  category: Category;
  features: Record<Feature, TriState>;
  evidence: Evidence[];
  hours: OpeningCoverage | null;
  description: string;
  openingHours: string | null;
  address: string | null;
  photos: { url: string; sourceUrl: string; author: string; license: string; licenseUrl?: string; caption?: string; attribution: string }[];
  sourceUrl: string;
  fetchedAt: string;
  confirmedAt: string | null;
  contentHash: string;
  /** Derived from matching source provenance at runtime; never inferred by the LLM. */
  sourceFacts?: { venueType: string | null; cuisines: string[] };
};
export type Constraints = {
  requiredFeatures: Feature[];
  excludedCategories: Category[];
  excludedPoiIds: string[];
  confirmedOpen: boolean;
  maximumStraightLineMetres: number;
};
export type OpeningState = "open" | "closed" | "unknown";
export type Visit = { poiId: string; minutes: number };
export type WalkingLeg = {
  fromId: string;
  toId: string;
  profile: "walking";
  provider: string;
  seconds: number;
  metres: number;
  geometry?: { type: "LineString"; coordinates: [number, number][] };
};
export type Budget = {
  availableMinutes: number;
  reserveMinutes: number;
  returnToStart: boolean;
};
export type PlanBudget = {
  status: "fits_estimate" | "too_long" | "unverified";
  visitMinutes: number;
  travelMinutes: number | null;
  reserveMinutes: number;
  totalMinutes: number | null;
  warnings: string[];
};

export function validPoint(point: Point): boolean {
  return Number.isFinite(point.longitude) && Number.isFinite(point.latitude)
    && point.longitude >= -180 && point.longitude <= 180
    && point.latitude >= -90 && point.latitude <= 90;
}

/** Collection guard also catches globally valid but swapped Astana coordinates. */
export function inAstanaBounds(point: Point): boolean {
  return validPoint(point) && point.longitude >= 70.9 && point.longitude <= 71.8
    && point.latitude >= 50.85 && point.latitude <= 51.45;
}

export function straightLineMetres(a: Point, b: Point): number {
  if (!validPoint(a) || !validPoint(b)) throw new Error("INVALID_COORDINATES");
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad)
    * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 6_371_008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

function time(value: string): number {
  // A timezone suffix is mandatory: never parse an ambiguous local timestamp.
  return /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
}

export function openingForVisit(poi: Poi, arrival: string, minutes: number): OpeningState {
  const start = time(arrival);
  const end = start + minutes * 60_000;
  const hours = poi.hours;
  if (!hours || !Number.isFinite(start) || !Number.isFinite(minutes) || minutes <= 0) return "unknown";
  const evidence = poi.evidence.find((item) => item.id === hours.evidenceId);
  if (!evidence || evidence.poiId !== poi.id || evidence.field !== "opening_hours") return "unknown";
  const coverageStart = time(hours.coverageStart);
  const coverageEnd = time(hours.coverageEnd);
  if (!Number.isFinite(coverageStart) || !Number.isFinite(coverageEnd)
    || start < coverageStart || end > coverageEnd) return "unknown";
  const intervals = hours.intervals.map((interval) => ({ start: time(interval.start), end: time(interval.end) }));
  if (intervals.some((interval) => !Number.isFinite(interval.start) || !Number.isFinite(interval.end)
    || interval.end <= interval.start)) return "unknown";
  return intervals.some((interval) => interval.start <= start && interval.end >= end) ? "open" : "closed";
}

export function checkConstraints(
  poi: Poi, origin: Point, constraints: Constraints,
  visit?: { arrival: string; minutes: number },
): { accepted: boolean; failures: string[]; warnings: string[] } {
  const failures: string[] = [];
  const warnings: string[] = [];
  if (!validPoint(origin) || !inAstanaBounds(poi.location)) failures.push("invalid_coordinates");
  else if (straightLineMetres(origin, poi.location) > constraints.maximumStraightLineMetres) failures.push("outside_radius");
  if (!Number.isFinite(constraints.maximumStraightLineMetres) || constraints.maximumStraightLineMetres < 0) failures.push("invalid_radius");
  if (constraints.excludedPoiIds.includes(poi.id)) failures.push("excluded_poi");
  if (constraints.excludedCategories.includes(poi.category)) failures.push("excluded_category");
  for (const field of constraints.requiredFeatures) {
    const proven = poi.features[field] === true && poi.evidence.some((item) => item.poiId === poi.id
      && item.field === field && item.value === true);
    if (!proven) failures.push(`unconfirmed_${field}`);
  }
  const opening = visit ? openingForVisit(poi, visit.arrival, visit.minutes) : "unknown";
  if (constraints.confirmedOpen && opening !== "open") failures.push(`opening_${opening}`);
  if (!constraints.confirmedOpen && opening === "closed") failures.push("opening_closed");
  if (opening === "unknown") warnings.push("Часы работы на время визита не подтверждены.");
  return { accepted: failures.length === 0, failures, warnings };
}

export function assessBudget(visits: Visit[], legs: WalkingLeg[] | null, budget: Budget): PlanBudget {
  if (!Number.isFinite(budget.availableMinutes) || budget.availableMinutes <= 0
    || !Number.isFinite(budget.reserveMinutes) || budget.reserveMinutes < 0
    || visits.some((visit) => !Number.isFinite(visit.minutes) || visit.minutes <= 0)
    || new Set(visits.map((visit) => visit.poiId)).size !== visits.length) throw new Error("INVALID_BUDGET");
  const visitMinutes = visits.reduce((sum, visit) => sum + visit.minutes, 0);
  const base = { visitMinutes, reserveMinutes: budget.reserveMinutes };
  const expectedPairs = visits.map((visit, i) => [i === 0 ? "start" : visits[i - 1].poiId, visit.poiId]);
  if (budget.returnToStart && visits.length > 0) expectedPairs.push([visits.at(-1)!.poiId, "start"]);
  const complete = legs !== null && legs.length === expectedPairs.length && legs.every((leg, i) =>
    leg.fromId === expectedPairs[i][0] && leg.toId === expectedPairs[i][1]
    && leg.profile === "walking" && leg.provider.length > 0
    && Number.isFinite(leg.seconds) && leg.seconds >= 0 && Number.isFinite(leg.metres) && leg.metres >= 0);
  if (!complete) return { ...base,
    status: visitMinutes + budget.reserveMinutes > budget.availableMinutes ? "too_long" : "unverified",
    travelMinutes: null, totalMinutes: null,
    warnings: ["Пеший путь не рассчитан. Длительность плана и возврат во время не подтверждены."],
  };
  const travelMinutes = Math.ceil(legs!.reduce((sum, leg) => sum + leg.seconds, 0) / 60);
  const totalMinutes = visitMinutes + budget.reserveMinutes + travelMinutes;
  return { ...base, travelMinutes, totalMinutes,
    status: totalMinutes <= budget.availableMinutes ? "fits_estimate" : "too_long",
    warnings: ["Расчётная оценка времени; фактическая скорость и доступность проходов могут отличаться."],
  };
}

export type EmbeddingSpec = { model: string; dimensions: number; version: string };
export function assertEmbeddingCompatibility(query: EmbeddingSpec, corpus: EmbeddingSpec, vector: number[]): void {
  if (query.model !== corpus.model || query.dimensions !== corpus.dimensions || query.version !== corpus.version
    || !Number.isInteger(query.dimensions) || query.dimensions <= 0 || vector.length !== query.dimensions
    || !vector.every(Number.isFinite) || !vector.some((value) => value !== 0)) throw new Error("EMBEDDING_MISMATCH");
}

/** Rank existing IDs only. Scores are ranking internals, never user confidence percentages. */
export function reciprocalRankFusion(textIds: string[], semanticIds: string[], k = 60): string[] {
  if (!Number.isFinite(k) || k < 0) throw new Error("INVALID_RRF_K");
  const scores = new Map<string, number>();
  for (const ids of [textIds, semanticIds]) [...new Set(ids)].forEach((id, i) => {
    scores.set(id, (scores.get(id) ?? 0) + 1 / (k + i + 1));
  });
  return [...scores].sort(([a, scoreA], [b, scoreB]) => scoreB - scoreA || a.localeCompare(b)).map(([id]) => id);
}

const activityByCategory: Record<Category, readonly string[]> = {
  park: ["walk", "rest"], cafe: ["coffee", "rest"], museum: ["explore"],
  landmark: ["look", "photograph"], playground: ["play"], other: ["look"],
};
const activityText: Record<string, string> = {
  walk: "Идея: немного прогуляться и осмотреться.", rest: "Идея: сделать короткую паузу.",
  coffee: "Идея: посмотреть меню и выбрать напиток.", explore: "Идея: уточнить доступные экспозиции перед посещением.",
  look: "Идея: осмотреть место.", photograph: "Идея: выбрать ракурс для фотографии.",
  play: "Идея: осмотреть площадку вместе с ребёнком; пригодность оцените на месте.",
};
type ModelChoice = { poiId: string; evidenceIds: string[]; activity: string; visitMinutes: number };
export type GroundedChoice = ModelChoice & { name: string; location: Point; reasons: string[]; idea: string };

/** Intentionally no unrestricted factual prose in model output. Render facts from verified fields. */
export function validateGeneratedChoices(output: unknown, candidates: Poi[], maximumVisitMinutes = 120): GroundedChoice[] {
  if (!Array.isArray(output) || output.length > 3) throw new Error("INVALID_MODEL_OUTPUT");
  const accepted: GroundedChoice[] = [];
  const used = new Set<string>();
  for (const raw of output) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)
      || Object.keys(raw).sort().join(",") !== "activity,evidenceIds,poiId,visitMinutes") throw new Error("INVALID_MODEL_OUTPUT");
    const value = raw as ModelChoice;
    const poi = candidates.find((candidate) => candidate.id === value.poiId);
    if (!poi || used.has(poi.id) || !Number.isInteger(value.visitMinutes)
      || value.visitMinutes < 5 || value.visitMinutes > maximumVisitMinutes
      || typeof value.activity !== "string" || !activityByCategory[poi.category].includes(value.activity)
      || !Array.isArray(value.evidenceIds) || value.evidenceIds.length === 0
      || !value.evidenceIds.every((id) => typeof id === "string")) throw new Error("INVALID_MODEL_OUTPUT");
    const reasons: string[] = [];
    for (const id of new Set(value.evidenceIds)) {
      const evidence = poi.evidence.find((item) => item.id === id && item.poiId === poi.id);
      if (!evidence) throw new Error("UNSUPPORTED_EVIDENCE");
      if (evidence.field === "category" && evidence.value === poi.category) {
        const labels: Record<Category, string> = { park: "парк", cafe: "кафе", museum: "музей", landmark: "достопримечательность", playground: "детская площадка", other: "городское место" };
        reasons.push(`В источнике отмечено: ${labels[poi.category]}.`);
      }
      else if (["outlets", "wheelchair", "indoor", "quiet"].includes(evidence.field)
        && evidence.value === true && poi.features[evidence.field as Feature] === true) {
        const text: Record<Feature, string> = { outlets: "В источнике отмечены розетки.", wheelchair: "В источнике отмечен доступ для коляски.",
          indoor: "В источнике отмечено помещение.", quiet: "В источнике место описано как тихое." };
        reasons.push(text[evidence.field as Feature]);
      } else if (evidence.field === "venue_type" && evidence.value === poi.sourceFacts?.venueType) {
        reasons.push(`Тип по источнику: ${evidence.value}.`);
      } else if (evidence.field === "cuisine" && typeof evidence.value === "string" && poi.sourceFacts?.cuisines.includes(evidence.value)) {
        reasons.push(`Кухня по источнику: ${evidence.value}; меню и наличие блюд нужно уточнить.`);
      } else throw new Error("UNSUPPORTED_CLAIM");
    }
    used.add(poi.id);
    accepted.push({ ...value, name: poi.name, location: poi.location, reasons, idea: activityText[value.activity] });
  }
  return accepted;
}
