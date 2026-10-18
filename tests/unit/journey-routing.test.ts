/** Atomic mandatory-stage plans, with synthetic POIs and mocked model/routing. No provider requests. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hoursFor } from "../../src/lib/hours";
import { searchJourney } from "../../src/lib/journey-search";
import { generateChoices } from "../../src/lib/model";
import { walkingRoute } from "../../src/lib/routing";
import { searchRequestSchema, type Poi, type SearchRequest, type WalkingLeg } from "../../src/lib/types";

vi.mock("../../src/lib/model", () => ({ generateChoices: vi.fn() }));
vi.mock("../../src/lib/routing", () => ({ walkingRoute: vi.fn() }));

const origin = { longitude: 71.43, latitude: 51.13 };
const clock = "2026-10-18T07:00:00Z"; // 12:00 in Astana, fixed independently of execution time.
function fixture(id: string, category: "cafe" | "park", offset = 0, openingHours: string | null = null): Poi {
  const sourceUrl = "https://example.org/explicit-synthetic-test-fixture";
  const fetchedAt = "2026-10-18T00:00:00Z";
  const poi: Poi = { id, category, name: `${id} (synthetic; not a real venue)`, description: "Explicit synthetic test fixture",
    location: { ...origin, longitude: origin.longitude + offset }, features: { outlets: null, wheelchair: null, indoor: null, quiet: null },
    evidence: [{ id: `${id}:category`, poiId: id, field: "category", value: category, sourceUrl, fetchedAt, confirmedAt: null }],
    hours: null, openingHours, address: null, photos: [], sourceUrl, fetchedAt, confirmedAt: null, contentHash: id };
  if (openingHours) {
    poi.evidence.push({ ...poi.evidence[0], id: `${id}:hours`, field: "opening_hours", value: openingHours });
    poi.hours = hoursFor(poi, clock);
  }
  return poi;
}
function context(extra: Partial<SearchRequest> = {}): SearchRequest {
  return searchRequestSchema.parse({ origin, startTime: clock, availableMinutes: 60, returnToStart: true,
    journeyStages: [{ kind: "cafe", cuisines: [] }, { kind: "park", cuisines: [] }], journeyOrder: "ordered", ...extra });
}
function legs(pois: Poi[], returning: boolean, seconds = 60): WalkingLeg[] {
  const ids = ["start", ...pois.map(poi => poi.id), ...(returning ? ["start"] : [])];
  return ids.slice(1).map((id, i) => ({ fromId: ids[i], toId: id, profile: "walking", provider: "MOCK: not a real routing measurement",
    seconds, metres: 80, geometry: { type: "LineString", coordinates: [[71.43, 51.13], [71.4301, 51.1301]] } }));
}
function search(request: SearchRequest, candidates: Poi[], demo = false, deadline = new AbortController().signal) {
  return searchJourney(request, candidates, { demo, database: false, retrieval: "local-hybrid", warnings: [], candidateCount: candidates.length,
    deadline, startTime: clock, started: performance.now() });
}
let networkAttempts = 0;
beforeEach(() => {
  vi.resetAllMocks(); networkAttempts = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => { networkAttempts++; throw Error("OFFLINE_JOURNEY_TEST_NETWORK_FORBIDDEN"); });
  vi.mocked(generateChoices).mockImplementation(async (_context, candidates) => {
    const cafe = candidates.find(poi => poi.category === "cafe")!;
    // Deliberately incomplete ranking: the server must retain the other mandatory stage.
    return [{ poiId: cafe.id, evidenceIds: [cafe.evidence[0].id], activity: "coffee", visitMinutes: 8,
      name: cafe.name, location: cafe.location, reasons: [], idea: "Synthetic model ranking" }];
  });
  vi.mocked(walkingRoute).mockImplementation(async (_origin, pois, returning) => legs(pois, returning));
});
afterEach(() => { expect(networkAttempts).toBe(0); vi.restoreAllMocks(); });

describe("mandatory journeys with mocked walking routes", () => {
  it("keeps cafe AND park when the model ranks only the cafe", async () => {
    const result = await search(context(), [fixture("cafe-a", "cafe"), fixture("park-a", "park", 0.001)]);
    expect(generateChoices).toHaveBeenCalledTimes(1);
    expect(result.items.map(poi => poi.category)).toEqual(["cafe", "park"]);
    expect(result.journey?.status).toBe("complete"); expect(result.resultKind).toBe("itinerary");
    expect(result.journey?.stages.map(stage => stage.poiId)).toEqual(result.items.map(poi => poi.id));
    for (const stage of result.journey!.stages) {
      const poi = result.items[stage.index];
      expect(stage.evidenceIds.length).toBeGreaterThan(0);
      expect(stage.evidenceIds.every(id => poi.evidence.some(e => e.id === id && e.poiId === poi.id))).toBe(true);
    }
  });

  it("rejects every complete combination when all three routes exceed the time limit", async () => {
    const candidates = [fixture("cafe-a", "cafe"), fixture("cafe-b", "cafe", 0.001), fixture("park-a", "park", 0.002), fixture("park-b", "park", 0.003)];
    vi.mocked(walkingRoute).mockImplementation(async (_origin, pois, returning) => legs(pois, returning, 3600));
    const result = await search(context(), candidates);
    expect(walkingRoute).toHaveBeenCalledTimes(3);
    expect(result.diagnostics.exclusions?.routing_attempts).toBe(3);
    expect(result.kind).toBe("no_match"); expect(result.items).toEqual([]);
    expect(result.journey?.status).toBe("incomplete");
    expect(result.journey?.stages.every(stage => stage.poiId === null)).toBe(true);
    expect(result.plan.legs).toEqual([]); expect(result.plan.status).not.toBe("fits_estimate");
  });

  it("rejects a park that is open at departure but closes during the second-stage visit", async () => {
    const cafe = fixture("cafe-a", "cafe", 0, "10:00-20:00");
    const park = fixture("park-a", "park", 0.001, "10:00-12:15");
    expect(park.hours).not.toBeNull();
    // 12:01 café arrival + 8-minute visit + 1-minute leg => park 12:10–12:20.
    const result = await search(context({ confirmedOpen: true }), [cafe, park]);
    expect(result.items).toEqual([]); expect(result.kind).toBe("no_match");
    expect(result.diagnostics.exclusions?.opening_closed).toBeGreaterThan(0);
    expect(result.journey?.status).toBe("incomplete"); expect(walkingRoute).toHaveBeenCalledTimes(1);
  });

  it("replans an entire journey after a closure without keeping a successful cafe subset", async () => {
    const candidates = [fixture("cafe-a", "cafe", 0, "24/7"), fixture("park-closed", "park", 0.001, "10:00-12:15"),
      fixture("park-open", "park", 0.002, "24/7")];
    const result = await search(context({ confirmedOpen: true }), candidates);
    expect(result.items.map(poi => poi.id)).toEqual(["cafe-a", "park-open"]);
    expect(result.items.every(poi => poi.openingStatus === "open")).toBe(true);
    expect(walkingRoute).toHaveBeenCalledTimes(2); expect(result.journey?.status).toBe("complete");
  });

  it("counts all visits, the return leg and the five-minute reserve at the exact budget boundary", async () => {
    const candidates = [fixture("cafe-a", "cafe"), fixture("park-a", "park", 0.001)];
    const fits = await search(context({ availableMinutes: 26 }), candidates);
    expect(fits.plan).toMatchObject({ status: "fits_estimate", visitMinutes: 18, travelMinutes: 3, reserveMinutes: 5,
      totalMinutes: 26, returnToStart: true });
    expect(fits.plan.legs.map(leg => [leg.fromId, leg.toId])).toEqual([["start", "cafe-a"], ["cafe-a", "park-a"], ["park-a", "start"]]);
    expect((await search(context({ availableMinutes: 25 }), candidates)).items).toEqual([]);
    const noReturn = await search(context({ availableMinutes: 25, returnToStart: false }), candidates);
    expect(noReturn.plan.status).toBe("fits_estimate"); expect(noReturn.plan.totalMinutes).toBe(25);
    expect(noReturn.plan.legs).toHaveLength(2);
  });

  it("labels both stages as unverified alternatives when a walking route is unavailable", async () => {
    vi.mocked(walkingRoute).mockResolvedValue(null);
    const result = await search(context(), [fixture("cafe-a", "cafe"), fixture("park-a", "park", 0.001)]);
    expect(result.items.map(poi => poi.category)).toEqual(["cafe", "park"]);
    expect(result.journey?.status).toBe("unverified"); expect(result.resultKind).toBe("alternatives");
    expect(result.plan.status).toBe("unverified"); expect(result.plan.totalMinutes).toBeNull();
    expect(result.plan.travelMinutes).toBeNull(); expect(result.plan.legs).toEqual([]); expect(result.mode).toBe("degraded");
  });

  it("does not call a model or routing for an impossible five-minute journey", async () => {
    const result = await search(context({ availableMinutes: 5 }), [fixture("cafe-a", "cafe"), fixture("park-a", "park", 0.001)]);
    expect(result.context.availableMinutes).toBe(5); expect(result.kind).toBe("no_match"); expect(result.items).toEqual([]);
    expect(generateChoices).not.toHaveBeenCalled(); expect(walkingRoute).not.toHaveBeenCalled();
  });

  it("does not call a model or routing if one mandatory stage has no eligible candidate", async () => {
    const result = await search(context(), [fixture("cafe-a", "cafe")]);
    expect(result.items).toEqual([]); expect(result.journey?.status).toBe("incomplete");
    expect(generateChoices).not.toHaveBeenCalled(); expect(walkingRoute).not.toHaveBeenCalled();
  });

  it("does not ask a model to invent missing cuisine evidence or silently retain only the park", async () => {
    const restaurant = fixture("restaurant-a", "cafe"); restaurant.category = "other"; restaurant.evidence[0].value = "other";
    restaurant.sourceFacts = { venueType: "restaurant", cuisines: ["italian", "pizza"] };
    for (const [field, value] of [["venue_type", "restaurant"], ["cuisine", "italian"], ["cuisine", "pizza"]] as const) {
      restaurant.evidence.push({ ...restaurant.evidence[0], id: `${restaurant.id}:${field}:${value}`, field, value });
    }
    const result = await search(context({ journeyStages: [{ kind: "restaurant", cuisines: ["sami"] }, { kind: "park", cuisines: [] }] }),
      [restaurant, fixture("park-a", "park", 0.001)]);
    expect(result.kind).toBe("no_match"); expect(result.items).toEqual([]);
    expect(result.journey?.stages.every(stage => stage.poiId === null)).toBe(true);
    expect(generateChoices).not.toHaveBeenCalled(); expect(walkingRoute).not.toHaveBeenCalled();
  });
});
