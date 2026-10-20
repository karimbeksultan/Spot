import { z } from "zod";
import type { Category, Feature, OpeningState, PlanBudget, Poi, WalkingLeg } from "./domain";
import { inAstanaBounds } from "./domain";
import { parseJourney } from "./journey";
export type { Point, TriState, Feature, Category, Evidence, OpeningCoverage, Poi, Constraints, OpeningState, Visit, WalkingLeg, Budget, PlanBudget, GroundedChoice } from "./domain";

export const categories = ["park", "cafe", "museum", "landmark", "playground", "other"] as const;
export const features = ["outlets", "wheelchair", "indoor", "quiet"] as const;
export const pointSchema = z.object({ longitude: z.number().finite().min(-180).max(180), latitude: z.number().finite().min(-90).max(90) }).strict();
export const astanaPointSchema = pointSchema.refine(inAstanaBounds, "Сейчас поиск работает только в Астане.");
const httpsUrl = z.string().url().max(4000).refine((value) => new URL(value).protocol === "https:");
const photoSchema = z.object({ url: httpsUrl.refine((value) => ["upload.wikimedia.org", "thumb.wikimedia.org", "commons.wikimedia.org"].includes(new URL(value).hostname)),
  sourceUrl: httpsUrl, author: z.string().max(2000), license: z.string().max(1000), licenseUrl: httpsUrl.optional(), caption: z.string().max(500).optional(), attribution: z.string().max(3000) });
export const poiSchema: z.ZodType<Poi> = z.object({
  id: z.string().min(1).max(100), name: z.string().min(1).max(400), description: z.string().max(5000),
  location: astanaPointSchema, category: z.enum(categories),
  features: z.object({ outlets: z.boolean().nullable(), wheelchair: z.boolean().nullable(), indoor: z.boolean().nullable(), quiet: z.boolean().nullable() }),
  evidence: z.array(z.object({ id: z.string().min(1).max(200), poiId: z.string().min(1).max(100),
    field: z.enum(["category", "opening_hours", "venue_type", "cuisine", ...features]), value: z.union([z.string().max(2000), z.boolean()]),
    sourceUrl: httpsUrl, fetchedAt: z.string().datetime({ offset: true }), confirmedAt: z.string().datetime({ offset: true }).nullable(),
  })).min(1).max(30),
  hours: z.null(), openingHours: z.string().max(2000).nullable(), address: z.string().max(1000).nullable(),
  photos: z.array(photoSchema).max(10),
  sourceUrl: httpsUrl, fetchedAt: z.string().datetime({ offset: true }), confirmedAt: z.string().datetime({ offset: true }).nullable(), contentHash: z.string().min(1).max(128),
  sourceFacts: z.object({ venueType: z.string().max(80).nullable(), cuisines: z.array(z.string().max(80)).max(12) }).optional(),
}).refine((poi) => poi.evidence.every((evidence) => evidence.poiId === poi.id)
  && poi.evidence.some((evidence) => evidence.field === "category" && evidence.value === poi.category)
  && Object.entries(poi.features).every(([field, value]) => value === null || poi.evidence.some((evidence) => evidence.field === field && evidence.value === value)),
"POI fields must match their evidence");
/** An invalid optional photo becomes a neutral placeholder, never a missing real place. */
export function parsePoi(raw: unknown) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return poiSchema.safeParse(raw);
  const record = raw as Record<string, unknown>;
  const photos = (Array.isArray(record.photos) ? record.photos : []).slice(0, 10).flatMap((photo) => {
    const parsed = photoSchema.safeParse(photo); return parsed.success ? [parsed.data] : [];
  });
  return poiSchema.safeParse({ ...record, photos });
}
export const searchRequestSchema = z.object({
  query: z.string().trim().max(1200).default(""),
  origin: astanaPointSchema,
  originChoice: z.object({ poiId: z.string().min(1).max(100), useAsStart: z.boolean() }).strict().optional(),
  availableMinutes: z.number().int().min(1).max(240).default(60),
  returnToStart: z.boolean().default(false),
  requiredFeatures: z.array(z.enum(features)).max(4).default([]),
  excludedCategories: z.array(z.enum(categories)).max(6).default([]),
  excludedPoiIds: z.array(z.string().max(100)).max(50).default([]),
  keepPoiIds: z.array(z.string().max(100)).max(3).default([]),
  maxDistanceMetres: z.number().int().min(100).max(8000).default(3000),
  confirmedOpen: z.boolean().default(false),
  startTime: z.string().datetime({ offset: true }).optional(),
  interests: z.array(z.enum(categories)).max(6).default([]),
  language: z.enum(["ru", "kk", "en"]).default("ru"),
  budgetKzt: z.number().int().min(0).max(1_000_000).nullable().default(null),
  strictBudget: z.boolean().default(false),
  transport: z.literal("walking").default("walking"),
  groupSize: z.number().int().min(1).max(5).default(1),
  airportDeadline: z.string().datetime({ offset: true }).nullable().default(null),
  journeyStages: z.array(z.object({ kind: z.enum(["cafe", "park", "restaurant"]), cuisines: z.array(z.string().regex(/^[a-z_]{2,40}$/)).max(6).default([]) }).strict()).max(3).default([]),
  journeyOrder: z.enum(["ordered", "any"]).default("ordered"),
  searchMode: z.enum(["plan", "discovery"]).default("plan"),
}).strict();
export type SearchRequest = z.infer<typeof searchRequestSchema>;
export type Recommendation = Poi & {
  why: string; idea: string; visitMinutes: number; evidenceIds: string[];
  distanceMetres: number; openingStatus: OpeningState; warnings: string[];
};
type SearchResponseBase = {
  originCandidates?: { poiId: string; name: string; location: { longitude: number; latitude: number }; sourceUrl: string }[];
  namedOrigin?: { poiId: string; name: string; usedAsStart: boolean };
  journey?: { status: "complete" | "unverified" | "incomplete"; stages: { index: number; kind: "cafe" | "park" | "restaurant"; poiId: string | null; evidenceIds: string[] }[] };
  mode: "demo" | "live" | "degraded";
  resultKind: "alternatives" | "itinerary";
  items: Recommendation[];
  context: SearchRequest;
  plan: PlanBudget & { returnToStart: boolean; legs: WalkingLeg[] };
  warnings: string[];
  provenance: { dataSource: "real_snapshot" | "supabase"; retrieval: string; generation: string; clock: string };
  diagnostics: { candidateCount: number; retrieval: string; generation: string; provider?: string; model?: string; promptVersion?: string;
    usage?: { inputTokens: number | null; outputTokens: number | null; actualCostUsd: number | null; reservedUsd: number }; understanding?: string; understandingModel?: string; understandingPromptVersion?: string; understandingFailure?: "timeout" | "unavailable" | "invalid_output" | "incomplete_output" | "config" | "memory"; exclusions?: Record<string, number>; elapsedMs?: number };
};
export type SearchResponse = SearchResponseBase & (
  { kind: "recommendations" | "no_match" | "degraded"; clarification?: never }
  | { kind: "clarification"; clarification: { code: string; question: string; fields: string[] } }
  | { kind: "error"; error: { code: string; message: string }; clarification?: never }
);
export type PoiResponse = { mode: "live" | "snapshot"; items: Poi[]; warnings: string[] };

const categoryPatterns: [RegExp, Category[]][] = [
  [/кофе|кофейн|кафе|напиток|капучино|латте|coffee|кофе|кофехана/iu, ["cafe"]],
  [/реб[её]н|детьми|детям|семь[её]й|детск|child|family|балам|баламен|бала/iu, ["playground", "park", "museum"]],
  [/музе|выстав|экспозиц|искусств|museum|мұражай/iu, ["museum"]],
  [/прогул|гуля|воздух|парк|набережн|дерев|зел[её]н|walk|park|серуен|саябақ/iu, ["park", "landmark"]],
  [/архитектур|достопримеч|фотограф|здани/iu, ["landmark"]],
];

/** Deterministic extraction only adds hard constraints; it never silently relaxes existing ones. */
export function interpretRequest(input: SearchRequest): SearchRequest {
  const required = new Set<Feature>(input.requiredFeatures);
  const excluded = new Set<Category>(input.excludedCategories);
  const interests = new Set<Category>(input.interests);
  const text = input.query.toLocaleLowerCase("ru");
  if (/(розетк.{0,24}(обязатель|нужн|необходим|керек|міндет)|(?:нужн|обязатель|необходим).{0,24}розетк|required.{0,15}(outlet|socket)|(outlet|socket).{0,15}(required|must))/u.test(text)) required.add("outlets");
  if (/(?:need|must|required|mandatory).{0,24}(?:outlet|socket)|(?:outlet|socket).{0,24}(?:needed|required|mandatory|must)/u.test(text)) required.add("outlets");
  if (/(доступн.{0,18}коляск|безбарьер|коляск.{0,18}обязатель)/u.test(text)) required.add("wheelchair");
  if (/wheelchair.{0,24}(?:access|required|must|need)|(?:need|required|must).{0,24}wheelchair|(?:мүгедек|арбамен).{0,24}(?:қолжетімді|керек|міндет)/u.test(text)) required.add("wheelchair");
  if (/(только\s+(?:внутри\s+|в\s+)?помещени|помещени.{0,15}обязатель|indoor[s]?\s+only|only\s+indoor|тек\s+ғимарат)/u.test(text)) required.add("indoor");
  if (/(тишин.{0,15}обязатель|обязатель.{0,15}тих)/u.test(text)) required.add("quiet");
  if (/(?:quiet|silent).{0,20}(?:required|must|mandatory)|(?:need|required|must).{0,20}(?:quiet|silent)|тыныш.{0,24}(?:міндет|керек)/u.test(text)) required.add("quiet");
  if (/без\s+(кафе|кофеен|кофейн)|не\s+хочу\s+(кофе|кафе)|no\s+caf[eé]|without\s+coffee|кофесіз/u.test(text)) excluded.add("cafe");
  for (const [pattern, additions] of categoryPatterns) if (pattern.test(text)) additions.forEach((category) => interests.add(category));
  const explicitMinutes = text.match(/\b(\d{1,3})\s*(?:минут|мин\b|minutes?|mins?\b)/u);
  let availableMinutes = input.availableMinutes;
  if (explicitMinutes) availableMinutes = Math.max(1, Math.min(240, Number(explicitMinutes[1])));
  if (/вдвое\s+меньше|половин[ау]\s+времени/u.test(text)) availableMinutes = Math.max(1, Math.floor(input.availableMinutes / 2));
  if (/есть\s+час(?:\s|$|,|\.)/u.test(text)) availableMinutes = 60;
  const money = text.match(/(?:budget|бюджет)\s*(\d{1,7})|(?:до|не более|under)\s*(\d{1,7})\s*(?:₸|тенге|kzt|тг)/u);
  const budgetKzt = money ? Number(money[1] ?? money[2]) : input.budgetKzt;
  const strictBudget = input.strictBudget || /строг.{0,15}бюджет|не более\s*\d+\s*(?:₸|тенге|kzt|тг)|strict.{0,10}budget|under\s*\d+\s*kzt|бюджет.{0,10}қатаң/u.test(text);
  const journey = parseJourney(text, input.journeyStages, input.journeyOrder);
  return { ...input, ...journey, availableMinutes, budgetKzt, strictBudget, requiredFeatures: [...required], excludedCategories: [...excluded], interests: [...interests],
    returnToStart: input.returnToStart || /вернуться|вернут[ьи]ся|возврат|обратно|return|қайту/u.test(text),
    confirmedOpen: input.confirmedOpen || /точно\s+открыт|подтвержд[её]нно\s+открыт|только\s+открыт|ноч[ьи]|ночную|night|түн|open\s+now/u.test(text),
    maxDistanceMetres: /поменьше\s+ходить|меньше\s+ходить/u.test(text) ? Math.min(input.maxDistanceMetres, 1200) : input.maxDistanceMetres,
  };
}
