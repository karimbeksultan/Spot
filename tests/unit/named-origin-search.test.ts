import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { searchPlaces } from "../../src/lib/search";
import { searchRequestSchema, type Poi } from "../../src/lib/types";
import { loadSnapshot, nearby } from "../../src/lib/retrieval";
import { interpretSemanticIntent } from "../../src/lib/semantic-intent";
import { embedQuery, generateChoices } from "../../src/lib/model";

vi.mock("../../src/lib/retrieval", () => ({ loadSnapshot: vi.fn(), nearby: vi.fn(), lexicalRank: (pois: Poi[]) => pois, supabaseConfigured: () => false }));
vi.mock("../../src/lib/model", () => ({ embedQuery: vi.fn(), generateChoices: vi.fn() }));
vi.mock("../../src/lib/semantic-intent", async (original) => ({ ...await original<typeof import("../../src/lib/semantic-intent")>(), interpretSemanticIntent: vi.fn() }));
vi.mock("../../src/lib/routing", () => ({ walkingRoute: vi.fn(async (_origin: { longitude: number; latitude: number }, pois: Poi[]) => pois.map((poi, index) => ({
  fromId: index ? pois[index-1].id : "start", toId: poi.id, seconds: 60, metres: 70,
  profile: "walking", provider: "synthetic test route", geometry: { type: "LineString", coordinates: [[71.4196527, 51.0992346], [71.4197, 51.0993]] },
}))) }));
const selected = { longitude: 71.4165705, latitude: 51.1061652 };
function poi(id: string, name: string): Poi {
  return { id, name, description: "Synthetic fixture", location: { longitude: 71.4196527, latitude: 51.0992346 },
    category: "other", features: { outlets: null, wheelchair: null, indoor: null, quiet: null }, hours: null, openingHours: null,
    address: null, photos: [], sourceUrl: "https://example.org/fixture", fetchedAt: "2026-10-20T00:00:00Z", confirmedAt: null,
    contentHash: id, evidence: [{ id: `${id}:category`, poiId: id, field: "category", value: "other", sourceUrl: "https://example.org/fixture", fetchedAt: "2026-10-20T00:00:00Z", confirmedAt: null }] };
}
const ballet = poi("fixture:ballet", "Астана балет");
const meal = poi("fixture:meal", "Synthetic restaurant");
meal.sourceFacts = { venueType: "restaurant", cuisines: [] };
meal.evidence.push({ ...meal.evidence[0], id: "meal:venue", field: "venue_type", value: "restaurant" });
const query = "нахожусь около Астана балет хочу поесть где нибудь есть 45 минут";
const request = (extra: Record<string, unknown> = {}) => searchRequestSchema.parse({ query, origin: selected, availableMinutes: 60, ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("APP_MODE", "live"); vi.stubEnv("RETRIEVAL_PROVIDER", "supabase");
  vi.mocked(loadSnapshot).mockResolvedValue([ballet, meal]);
  vi.mocked(nearby).mockResolvedValue({ mode: "snapshot", items: [meal], warnings: [] });
  vi.mocked(interpretSemanticIntent).mockResolvedValue({ action: "replace", stages: [{ kind: "restaurant", cuisines: [] }], interests: [], order: "any", discovery: true, issue: "none" });
  vi.mocked(generateChoices).mockRejectedValue(new Error("No real models in this test"));
});
afterEach(() => vi.unstubAllEnvs());

describe("named start confirmation before inference (mock providers)", () => {
  it("asks about the actual snapshot candidate without running any provider or changing the selected start", async () => {
    const result = await searchPlaces(request({ returnToStart: true, requiredFeatures: ["outlets"], startTime: "2026-10-20T10:04:00+05:00" }));
    expect(result.kind).toBe("clarification"); expect(result.clarification?.code).toBe("origin_confirmation");
    expect(result.originCandidates).toEqual([{ poiId: ballet.id, name: ballet.name, location: ballet.location, sourceUrl: ballet.sourceUrl }]);
    expect(result.context).toMatchObject({ query, origin: selected, availableMinutes: 45, returnToStart: true, requiredFeatures: ["outlets"], startTime: "2026-10-20T10:04:00+05:00" });
    expect(interpretSemanticIntent).not.toHaveBeenCalled(); expect(nearby).not.toHaveBeenCalled(); expect(embedQuery).not.toHaveBeenCalled();
  });
  it("uses only source coordinates after confirmation and treats the named building as context rather than an activity", async () => {
    const result = await searchPlaces(request({ originChoice: { poiId: ballet.id, useAsStart: true } }));
    expect(result.context).toMatchObject({ query, origin: ballet.location, availableMinutes: 45, searchMode: "discovery", journeyStages: [{ kind: "restaurant", cuisines: [] }] });
    expect(result.namedOrigin).toEqual({ poiId: ballet.id, name: ballet.name, usedAsStart: true });
    expect(vi.mocked(interpretSemanticIntent).mock.calls[0][0].query).toBe("нахожусь около [ориентир] хочу поесть где нибудь есть 45 минут");
    expect(result.items.map((item) => item.id)).toEqual([meal.id]);
  });
  it.each(["Парк Победы", "Итальянский ресторан"])("does not inherit activities or cuisines from the unconfirmed start name %s", async (name) => {
    vi.mocked(loadSnapshot).mockResolvedValue([poi("fixture:named-start", name), meal]);
    const original = `Я у ${name} хочу поесть есть 45 минут`;
    const result = await searchPlaces(request({ query: original }));
    expect(result.clarification?.code).toBe("origin_confirmation");
    expect(result.context.query).toBe(original);
    expect(result.context.interests).not.toContain("park");
    expect(result.context.journeyStages.every((stage) => stage.kind !== "park" && stage.cuisines.length === 0)).toBe(true);
    expect(interpretSemanticIntent).not.toHaveBeenCalled();
  });
  it("honours an explicit decision to keep the UI start without losing the query or its time", async () => {
    const result = await searchPlaces(request({ originChoice: { poiId: ballet.id, useAsStart: false } }));
    expect(result.context).toMatchObject({ origin: selected, query, availableMinutes: 45 });
    expect(result.namedOrigin?.usedAsStart).toBe(false);
  });
  it("does not treat a previous or invented POI decision as confirmation of a different named place", async () => {
    const result = await searchPlaces(request({ originChoice: { poiId: "invented", useAsStart: true } }));
    expect(result.clarification?.code).toBe("origin_confirmation"); expect(interpretSemanticIntent).not.toHaveBeenCalled();
  });
  it("does not substitute coordinates for an unknown named start", async () => {
    const result = await searchPlaces(request({ query: "Я у неизвестного театра хочу поесть" }));
    expect(result.clarification?.code).toBe("origin_not_found"); expect(result.originCandidates).toEqual([]);
    expect(result.context.origin).toEqual(selected); expect(interpretSemanticIntent).not.toHaveBeenCalled();
  });
  it("retains an already selected exact UI preset without adding another confirmation step", async () => {
    const result = await searchPlaces(request({ origin: { ...ballet.location, longitude: ballet.location.longitude + 0.000001 } }));
    expect(result.context.origin.longitude).toBe(ballet.location.longitude + 0.000001);
    expect(result.namedOrigin?.usedAsStart).toBe(true); expect(interpretSemanticIntent).toHaveBeenCalledOnce();
  });
  it("keeps duplicate exact names ambiguous unless a specific source POI is chosen", async () => {
    vi.mocked(loadSnapshot).mockResolvedValue([ballet, { ...ballet, id: "fixture:second-ballet" }]);
    const result = await searchPlaces(request({ origin: ballet.location }));
    expect(result.originCandidates).toHaveLength(2); expect(result.clarification?.code).toBe("origin_confirmation");
  });
  it("keeps demo free from model calls after named-origin confirmation", async () => {
    vi.stubEnv("APP_MODE", "demo");
    const result = await searchPlaces(request({ originChoice: { poiId: ballet.id, useAsStart: true } }));
    expect(result.mode).toBe("demo"); expect(interpretSemanticIntent).not.toHaveBeenCalled(); expect(embedQuery).not.toHaveBeenCalled(); expect(generateChoices).not.toHaveBeenCalled();
  });
});
