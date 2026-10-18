/** Synthetic fixtures and mocked providers only; these tests do not call a live model or map. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchDiscovery } from "../../src/lib/discovery-search";
import { validateGeneratedChoices } from "../../src/lib/domain";
import { generateChoices } from "../../src/lib/model";
import { walkingRoute } from "../../src/lib/routing";
import { searchRequestSchema, type Category, type Poi, type SearchRequest, type WalkingLeg } from "../../src/lib/types";

vi.mock("../../src/lib/model", () => ({ generateChoices: vi.fn() }));
vi.mock("../../src/lib/routing", () => ({ walkingRoute: vi.fn() }));

const origin = { longitude: 71.43, latitude: 51.13 };
const startTime = "2026-10-19T07:00:00Z";
function fixture(id: string, category: Category = "landmark"): Poi {
  return { id, name: `Synthetic ${id}; not a real place`, description: "Synthetic discovery fixture", category, location: origin,
    features: { outlets: null, wheelchair: null, indoor: null, quiet: null }, hours: null, openingHours: null, address: null, photos: [],
    sourceUrl: "https://example.org/discovery", fetchedAt: startTime, confirmedAt: null, contentHash: id,
    evidence: [{ id: `${id}:category`, poiId: id, field: "category", value: category,
      sourceUrl: "https://example.org/discovery", fetchedAt: startTime, confirmedAt: null }] };
}
function restaurant(id: string, cuisines: string[] = []): Poi {
  const poi = fixture(id, "other");
  poi.sourceFacts = { venueType: "restaurant", cuisines };
  poi.evidence.push({ ...poi.evidence[0], id: `${id}:venue`, field: "venue_type", value: "restaurant" },
    ...cuisines.map((value) => ({ ...poi.evidence[0], id: `${id}:cuisine:${value}`, field: "cuisine" as const, value })));
  return poi;
}
function request(extra: Partial<SearchRequest> = {}) {
  return searchRequestSchema.parse({ query: "Покажи достопримечательности", origin, startTime, availableMinutes: 60, ...extra });
}
function options(extra: Partial<Parameters<typeof searchDiscovery>[2]> = {}) {
  return { demo: false, database: false, retrieval: "local-hybrid", warnings: [], candidateCount: 4,
    deadline: AbortSignal.timeout(5000), startTime, started: performance.now(), ...extra };
}
function route(seconds = 60) {
  vi.mocked(walkingRoute).mockImplementation(async (_origin, pois, returning) => {
    const ids = ["start", ...pois.map((poi) => poi.id), ...(returning ? ["start"] : [])];
    return ids.slice(1).map((id, i): WalkingLeg => ({ fromId: ids[i], toId: id, profile: "walking", provider: "MOCK pedestrian",
      seconds, metres: 80 }));
  });
}
function rank(ids: string[]) {
  vi.mocked(generateChoices).mockImplementation(async (_context, pois, _signal, telemetry) => {
    if (telemetry) { telemetry.provider = "ollama"; telemetry.model = "MOCK local model"; }
    return validateGeneratedChoices(ids.map((id) => { const poi = pois.find((item) => item.id === id)!; return {
      poiId: id, evidenceIds: [`${id}:category`], activity: poi.category === "park" ? "walk" : poi.category === "cafe" ? "coffee" : "look", visitMinutes: 10,
    }; }), pois);
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(generateChoices).mockRejectedValue(new Error("MOCK_MODEL_UNAVAILABLE"));
  vi.mocked(walkingRoute).mockResolvedValue(null);
});

describe("independent discovery alternatives", () => {
  it("returns three ranked visits, never a joint itinerary, with one route per option", async () => {
    route(); rank(["c", "a", "b"]);
    const context = request({ returnToStart: true });
    const result = await searchDiscovery(context, ["a", "b", "c", "d"].map((id) => fixture(id)), options());
    expect(result.mode).toBe("live"); expect(result.kind).toBe("recommendations"); expect(result.resultKind).toBe("alternatives");
    expect(result.items.map((poi) => poi.id)).toEqual(["c", "a", "b"]);
    expect(result).not.toHaveProperty("journey");
    expect(result.plan).toMatchObject({ status: "unverified", totalMinutes: null, travelMinutes: null, visitMinutes: 0, legs: [], returnToStart: true });
    expect(walkingRoute).toHaveBeenCalledTimes(3);
    for (const call of vi.mocked(walkingRoute).mock.calls) { expect(call[0]).toEqual(origin); expect(call[1]).toHaveLength(1); expect(call[2]).toBe(true); }
    expect(result.items.every((poi) => poi.warnings.join().includes("17 мин"))).toBe(true);
  });
  it("labels source-based fallback degraded when generation is unavailable", async () => {
    route();
    const result = await searchDiscovery(request(), [fixture("a")], options());
    expect(result.mode).toBe("degraded"); expect(result.kind).toBe("degraded"); expect(result.provenance.generation).toBe("template");
    expect(result.items.map((poi) => poi.id)).toEqual(["a"]); expect(result.warnings.join()).toContain("Модель недоступна");
  });
  it("makes neither generation nor routing calls in demo", async () => {
    const result = await searchDiscovery(request(), [fixture("a")], options({ demo: true }));
    expect(result.mode).toBe("demo"); expect(result.kind).toBe("recommendations"); expect(result.resultKind).toBe("alternatives");
    expect(result.plan.totalMinutes).toBeNull(); expect(result.items[0].openingStatus).toBe("unknown");
    expect(generateChoices).not.toHaveBeenCalled(); expect(walkingRoute).not.toHaveBeenCalled();
  });
  it("does not fabricate routes or a live result when routing is unavailable", async () => {
    rank(["a"]);
    const result = await searchDiscovery(request(), [fixture("a")], options());
    expect(result.items).toHaveLength(1); expect(result.mode).toBe("degraded"); expect(result.plan.totalMinutes).toBeNull(); expect(result.plan.legs).toEqual([]);
    expect(result.items[0].warnings.join()).toContain("не подтверждены");
  });
  it("cannot confirm opening without a verified arrival route", async () => {
    const poi = fixture("a");
    poi.hours = { coverageStart: "2026-10-19T00:00:00Z", coverageEnd: "2026-10-20T00:00:00Z",
      intervals: [{ start: "2026-10-19T00:00:00Z", end: "2026-10-20T00:00:00Z" }], evidenceId: "a:hours" };
    poi.evidence.push({ ...poi.evidence[0], id: "a:hours", field: "opening_hours", value: "24/7" });
    const result = await searchDiscovery(request({ confirmedOpen: true }), [poi], options());
    expect(result.kind).toBe("no_match"); expect(result.items).toEqual([]); expect(result.diagnostics.exclusions?.opening_unknown).toBe(1);
  });
  it("checks the full visit after walking, rejecting a venue that closes during it", async () => {
    route(120);
    const poi = fixture("a");
    poi.hours = { coverageStart: "2026-10-19T00:00:00Z", coverageEnd: "2026-10-20T00:00:00Z",
      intervals: [{ start: "2026-10-19T06:00:00Z", end: "2026-10-19T07:10:00Z" }], evidenceId: "a:hours" };
    poi.evidence.push({ ...poi.evidence[0], id: "a:hours", field: "opening_hours", value: "11:00-12:10" });
    const result = await searchDiscovery(request(), [poi], options());
    expect(result.kind).toBe("no_match"); expect(result.diagnostics.exclusions?.opening_closed).toBe(1);
  });
  it("includes return in each option's budget rather than dropping it to fit", async () => {
    route(600);
    const context = request({ availableMinutes: 30, returnToStart: true,
      journeyStages: [{ kind: "restaurant", cuisines: [] }] });
    const result = await searchDiscovery(context, [restaurant("meal")], options());
    expect(result.items).toEqual([]); expect(result.context.returnToStart).toBe(true); expect(result.diagnostics.exclusions?.time_budget).toBe(1);
    expect(vi.mocked(walkingRoute).mock.calls[0][2]).toBe(true);
  });
  it("retains restaurant type and every requested cuisine as owned evidence", async () => {
    route(); rank(["meal"]);
    const context = request({ query: "Где поесть итальянской кухни?", journeyStages: [{ kind: "restaurant", cuisines: ["italian", "pizza"] }] });
    const result = await searchDiscovery(context, [restaurant("meal", ["italian", "pizza"])], options());
    expect(result.items[0].evidenceIds).toEqual(["meal:category", "meal:venue", "meal:cuisine:italian", "meal:cuisine:pizza"]);
    expect(result.items[0].visitMinutes).toBe(25); expect(result.items[0].idea).toContain("не подтверждены"); expect(result.items[0].warnings.join()).toContain("31 мин");
  });
  it("rejects unsupported restaurant/cuisine candidates before calling providers", async () => {
    const unproven = restaurant("meal", ["italian"]); unproven.evidence = unproven.evidence.filter((item) => item.field !== "cuisine");
    const context = request({ journeyStages: [{ kind: "restaurant", cuisines: ["italian"] }] });
    const result = await searchDiscovery(context, [unproven, fixture("park", "park")], options());
    expect(result.kind).toBe("no_match"); expect(result.items).toEqual([]); expect(generateChoices).not.toHaveBeenCalled(); expect(walkingRoute).not.toHaveBeenCalled();
  });
  it("preserves excluded venues, categories and unconfirmed mandatory features", async () => {
    const context = request({ requiredFeatures: ["outlets"], excludedPoiIds: ["excluded"], excludedCategories: ["cafe"] });
    const result = await searchDiscovery(context, [fixture("unknown"), fixture("excluded"), fixture("cafe", "cafe")], options());
    expect(result.items).toEqual([]); expect(result.context.requiredFeatures).toEqual(["outlets"]);
    expect(generateChoices).not.toHaveBeenCalled(); expect(walkingRoute).not.toHaveBeenCalled();
  });
  it("rejects hallucinated model IDs and falls back to owned candidates", async () => {
    route();
    vi.mocked(generateChoices).mockResolvedValue([{ poiId: "invented", evidenceIds: ["a:category"], activity: "look", visitMinutes: 10,
      name: "Fake", location: origin, reasons: [], idea: "Fake" }]);
    const result = await searchDiscovery(request(), [fixture("a")], options());
    expect(result.items.map((poi) => poi.id)).toEqual(["a"]); expect(result.mode).toBe("degraded"); expect(result.provenance.generation).toBe("template");
  });
  it("rejects another venue's evidence and never copies its claims", async () => {
    route();
    vi.mocked(generateChoices).mockResolvedValue([{ poiId: "a", evidenceIds: ["b:category"], activity: "look", visitMinutes: 10,
      name: "Fake", location: origin, reasons: [], idea: "Fake" }]);
    const result = await searchDiscovery(request(), [fixture("a"), fixture("b")], options());
    expect(result.provenance.generation).toBe("template"); expect(result.items[0].evidenceIds).toEqual(["a:category"]);
  });
  it("rejects impossible visit budgets before model or routing work", async () => {
    const result = await searchDiscovery(request({ availableMinutes: 14 }), [fixture("a")], options());
    expect(result.kind).toBe("no_match"); expect(result.items).toEqual([]); expect(result.diagnostics.exclusions?.time_budget).toBe(1);
    expect(generateChoices).not.toHaveBeenCalled(); expect(walkingRoute).not.toHaveBeenCalled();
  });
});
