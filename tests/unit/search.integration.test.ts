/** Pipeline tests use explicit synthetic fixtures and mocked providers; never counted as live DB tests. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchPlaces } from "../../src/lib/search";
import { searchRequestSchema, type Poi, type WalkingLeg } from "../../src/lib/types";
import { generateChoices, embedQuery } from "../../src/lib/model";
import { nearby, hybridRetrieve, supabaseConfigured } from "../../src/lib/retrieval";
import { walkingRoute } from "../../src/lib/routing";

vi.mock("../../src/lib/model", () => ({ generateChoices: vi.fn(), embedQuery: vi.fn() }));
vi.mock("../../src/lib/retrieval", () => ({ nearby: vi.fn(), hybridRetrieve: vi.fn(), supabaseConfigured: vi.fn(), lexicalRank: (pois: Poi[]) => pois }));
vi.mock("../../src/lib/routing", () => ({ walkingRoute: vi.fn() }));

const origin = { longitude: 71.43, latitude: 51.13 };
function fixture(id: string): Poi {
  return { id, name: `Fixture ${id} (not a real place)`, description: "Synthetic test park", category: "park", location: origin,
    features: { outlets: null, wheelchair: null, indoor: null, quiet: null }, hours: null, openingHours: null, address: null, photos: [],
    sourceUrl: "https://example.org/fixture", fetchedAt: "2026-10-16T00:00:00Z", confirmedAt: null, contentHash: id,
    evidence: [{ id: `${id}:category`, poiId: id, field: "category", value: "park", sourceUrl: "https://example.org/fixture", fetchedAt: "2026-10-16T00:00:00Z", confirmedAt: null }] };
}
const fixtures = ["a", "b", "c", "d"].map(fixture);
const request = (extra: Record<string, unknown> = {}) => searchRequestSchema.parse({ query: "Хочу прогуляться", origin, availableMinutes: 60, ...extra });
function routed() {
  vi.mocked(walkingRoute).mockImplementation(async (_origin, pois, returning) => {
    const ids = ["start", ...pois.map((poi) => poi.id), ...(returning ? ["start"] : [])];
    return ids.slice(1).map((id, i): WalkingLeg => ({ fromId: ids[i], toId: id, profile: "walking", provider: "MOCK pedestrian provider",
      seconds: 60, metres: 80, geometry: { type: "LineString", coordinates: [[71.43, 51.13], [71.4301, 51.1301]] } }));
  });
}
function mealAndPark() {
  const meal = fixture("meal");
  meal.name = "Synthetic meal venue (not a real place)";
  meal.category = "other";
  meal.evidence[0].value = "other";
  meal.sourceFacts = { venueType: "restaurant", cuisines: [] };
  meal.evidence.push({ ...meal.evidence[0], id: "meal:venue", field: "venue_type", value: "restaurant" });
  return [meal, fixture("park")];
}
beforeEach(() => {
  vi.stubEnv("APP_MODE", "live");
  vi.stubEnv("RETRIEVAL_PROVIDER", "supabase");
  vi.clearAllMocks();
  vi.mocked(supabaseConfigured).mockReturnValue(false);
  vi.mocked(nearby).mockResolvedValue({ mode: "snapshot", items: fixtures.map((poi) => structuredClone(poi)), warnings: [] });
  vi.mocked(generateChoices).mockRejectedValue(new Error("MODEL_UNAVAILABLE"));
  vi.mocked(embedQuery).mockRejectedValue(new Error("EMBEDDING_UNAVAILABLE"));
  vi.mocked(walkingRoute).mockResolvedValue(null);
});
afterEach(() => vi.unstubAllEnvs());

describe("provider-mocked end-to-end search pipeline", () => {
  it("builds a complete meal and walk without named venues, retaining source evidence", async () => {
    vi.mocked(nearby).mockResolvedValue({ mode: "snapshot", items: mealAndPark(), warnings: [] });
    routed();
    const result = await searchPlaces(request({ query: "Хочу поесть и погулять" }));
    expect(result.context.journeyStages.map((stage) => stage.kind)).toEqual(["restaurant", "park"]);
    expect(result.items.map((poi) => poi.id)).toEqual(["meal", "park"]);
    expect(result.items[0].evidenceIds).toContain("meal:venue");
    expect(result.journey?.status).toBe("complete");
    expect(result.resultKind).toBe("itinerary");
    expect(result.mode).toBe("degraded"); // The local model is explicitly mocked unavailable.
    expect(result.plan.totalMinutes).toBe(42);
  });
  it("does not return a walk-only success when a meal has no source-confirmed venue", async () => {
    const [unverifiedMeal, park] = mealAndPark();
    unverifiedMeal.evidence = unverifiedMeal.evidence.filter((evidence) => evidence.field !== "venue_type");
    vi.mocked(nearby).mockResolvedValue({ mode: "snapshot", items: [unverifiedMeal, park], warnings: [] });
    const result = await searchPlaces(request({ query: "поесть и погулять" }));
    expect(result.kind).toBe("no_match"); expect(result.items).toEqual([]);
    expect(result.context.journeyStages.map((stage) => stage.kind)).toEqual(["restaurant", "park"]);
    expect(generateChoices).not.toHaveBeenCalled(); expect(walkingRoute).not.toHaveBeenCalled();
  });
  it("rejects a meal and walk that cannot fit even before routing", async () => {
    const result = await searchPlaces(request({ query: "поесть и погулять", availableMinutes: 30 }));
    expect(result.kind).toBe("no_match"); expect(result.items).toEqual([]);
    expect(result.context.journeyStages.map((stage) => stage.kind)).toEqual(["restaurant", "park"]);
    expect(nearby).not.toHaveBeenCalled(); expect(embedQuery).not.toHaveBeenCalled();
    expect(generateChoices).not.toHaveBeenCalled(); expect(walkingRoute).not.toHaveBeenCalled();
  });
  it("keeps mandatory feature constraints when inferring a meal and walk", async () => {
    vi.mocked(nearby).mockResolvedValue({ mode: "snapshot", items: mealAndPark(), warnings: [] });
    const result = await searchPlaces(request({ query: "поесть и погулять", requiredFeatures: ["outlets"] }));
    expect(result.kind).toBe("no_match"); expect(result.items).toEqual([]);
    expect(result.context.requiredFeatures).toEqual(["outlets"]);
    expect(result.context.journeyStages.map((stage) => stage.kind)).toEqual(["restaurant", "park"]);
    expect(generateChoices).not.toHaveBeenCalled(); expect(walkingRoute).not.toHaveBeenCalled();
  });
  it("uses a labelled snapshot and never invents walking time", async () => {
    const result = await searchPlaces(request());
    expect(result.mode).toBe("degraded"); expect(result.provenance.dataSource).toBe("real_snapshot"); expect(result.items).toHaveLength(3);
    expect(result.plan.status).toBe("unverified"); expect(result.plan.totalMinutes).toBeNull(); expect(result.plan.legs).toEqual([]);
  });
  it("unknown mandatory outlets produce empty results without model calls", async () => {
    const result = await searchPlaces(request({ query: "Розетка обязательна", requiredFeatures: ["outlets"] }));
    expect(result.items).toEqual([]); expect(generateChoices).not.toHaveBeenCalled(); expect(walkingRoute).not.toHaveBeenCalled();
  });
  it("halving available time reduces the number of places", async () => {
    routed();
    const full = await searchPlaces(request()); const short = await searchPlaces(request({ availableMinutes: 30 }));
    expect(full.items).toHaveLength(3); expect(short.items).toHaveLength(1); expect(short.plan.totalMinutes).toBeLessThanOrEqual(30);
  });
  it("includes return leg in budget and map geometry", async () => {
    routed(); const result = await searchPlaces(request({ returnToStart: true }));
    expect(result.plan.legs.at(-1)?.toId).toBe("start"); expect(result.plan.travelMinutes).toBe(result.items.length + 1);
    expect(result.plan.status).toBe("fits_estimate");
  });
  it("replacement preserves remaining places and excludes replaced ID", async () => {
    routed(); const result = await searchPlaces(request({ excludedPoiIds: ["b"], keepPoiIds: ["a", "c"] }));
    expect(result.items.map((poi) => poi.id)).toEqual(["a", "c", "d"]);
  });
  it("retained places still must satisfy new mandatory requirements", async () => {
    const valid = fixture("d"); valid.features.outlets = true;
    valid.evidence.push({ ...valid.evidence[0], id: "d:outlets", field: "outlets", value: true });
    vi.mocked(nearby).mockResolvedValue({ mode: "snapshot", items: [fixture("a"), valid], warnings: [] });
    const result = await searchPlaces(request({ keepPoiIds: ["a"], requiredFeatures: ["outlets"] }));
    expect(result.items.map((poi) => poi.id)).toEqual(["d"]); expect(result.warnings.join()).toContain("сохранённых");
  });
  it("open-now is insufficient when the full visit crosses closure", async () => {
    const poi = fixture("a"); poi.openingHours = "10:00-12:00";
    poi.evidence.push({ ...poi.evidence[0], id: "a:hours", field: "opening_hours", value: poi.openingHours });
    vi.mocked(nearby).mockResolvedValue({ mode: "snapshot", items: [poi], warnings: [] });
    routed();
    const result = await searchPlaces(request({ confirmedOpen: true, startTime: "2026-10-16T06:50:00Z" }));
    expect(result.items).toEqual([]);
  });
  it("confirmed-open cannot pass without an arrival route", async () => {
    const poi = fixture("a"); poi.openingHours = "24/7";
    poi.evidence.push({ ...poi.evidence[0], id: "a:hours", field: "opening_hours", value: "24/7" });
    vi.mocked(nearby).mockResolvedValue({ mode: "snapshot", items: [poi], warnings: [] });
    expect((await searchPlaces(request({ confirmedOpen: true }))).items).toEqual([]);
  });
  it("Supabase geo reading without embeddings is retrieval-only", async () => {
    vi.mocked(supabaseConfigured).mockReturnValue(true);
    vi.mocked(nearby).mockResolvedValue({ mode: "live", items: fixtures, warnings: [] });
    const result = await searchPlaces(request());
    expect(result.mode).toBe("degraded"); expect(result.diagnostics.retrieval).toBe("supabase-lexical");
  });
  it("database errors fall back explicitly instead of claiming live AI", async () => {
    vi.mocked(supabaseConfigured).mockReturnValue(true);
    vi.mocked(embedQuery).mockResolvedValue(Array(768).fill(0));
    vi.mocked(hybridRetrieve).mockRejectedValue(new Error("DATABASE_UNAVAILABLE"));
    const result = await searchPlaces(request()); expect(result.mode).toBe("degraded"); expect(result.provenance.dataSource).toBe("real_snapshot");
  });
  it("an origin outside Astana fails validation", () => expect(() => request({ origin: { longitude: 0, latitude: 0 } })).toThrow());
  it("a short walk ranks a nearby matching place ahead of a distant same-category candidate", async () => {
    const far = fixture("far"); far.location = { ...origin, longitude: origin.longitude + 0.03 };
    const close = fixture("close"); close.location = { ...origin, longitude: origin.longitude + 0.001 };
    vi.mocked(nearby).mockResolvedValue({ mode: "snapshot", items: [far, close], warnings: [] });
    const result = await searchPlaces(request({ availableMinutes: 30 })); expect(result.items.map((p) => p.id)).toEqual(["close"]);
  });
  it("tries an unused nearby candidate when selected walks cannot fit, with three routing calls maximum", async () => {
    vi.mocked(walkingRoute).mockImplementation(async (_origin, pois, returning) => {
      const ids = ["start", ...pois.map((p) => p.id), ...(returning ? ["start"] : [])];
      return ids.slice(1).map((id, i) => ({ fromId: ids[i], toId: id, profile: "walking", provider: "MOCK walking", seconds: pois.some((p) => p.id === "a") ? 1800 : 60, metres: 100 }));
    });
    const result = await searchPlaces(request({ availableMinutes: 45, returnToStart: true }));
    expect(result.items.map((p) => p.id)).toEqual(["c"]); expect(result.plan.status).toBe("fits_estimate"); expect(walkingRoute).toHaveBeenCalledTimes(3);
    expect(result.context.returnToStart).toBe(true);
  });
});
