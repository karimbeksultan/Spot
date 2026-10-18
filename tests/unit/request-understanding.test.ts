import { describe, expect, it } from "vitest";
import { applySemanticIntent } from "../../src/lib/request-understanding";
import { semanticIntentSchema, type SemanticIntent } from "../../src/lib/semantic-intent";
import { interpretRequest, searchRequestSchema, type SearchRequest } from "../../src/lib/types";

const origin = { longitude: 71.4165705, latitude: 51.1061652 };
const stage = (kind: "cafe" | "park" | "restaurant", cuisines: string[] = []) => ({ kind, cuisines });
const request = (query: string, overrides: Partial<SearchRequest> = {}) => searchRequestSchema.parse({ origin, query, ...overrides });
const intent = (overrides: Partial<SemanticIntent> = {}): SemanticIntent => semanticIntentSchema.parse({
  action: "replace", stages: [stage("cafe")], interests: [], order: "ordered", discovery: false, issue: "none", ...overrides,
});
const invalid = (output: unknown) => output as SemanticIntent;

describe("semantic activity projection into server-owned request context", () => {
  it.each([
    "Поем, выпью кофе, погуляю в парке, потом ещё посижу в кофейне.",
    "Поем потом кофе потом парк потом снова кофе",
    "Поесть, кофе, парк, 90 минут",
  ])("asks for clarification when a saturated three-stop answer may hide a longer chain: %s", (query) => {
    const result = applySemanticIntent(request(query), intent({ stages: [stage("restaurant"), stage("cafe"), stage("park")] }));
    expect(result.issue).toBe("ambiguous");
  });
  it("does not count a conjunction before a temporal marker as a separate goal", () => {
    const result = applySemanticIntent(request("Живот урчит, потом чашку бодрящего, а затем в зелень"),
      intent({ stages: [stage("restaurant"), stage("cafe"), stage("park")] }));
    expect(result.issue).toBeUndefined();
  });
  it("never accepts an AND interpretation of an explicit alternative", () => {
    const result = applySemanticIntent(request("Поужинать или прогуляться?"), intent({ stages: [stage("restaurant"), stage("park")] }));
    expect(result.issue).toBe("ambiguous");
  });
  it("never turns an unsupported booking or taxi action into ordinary venue discovery", () => {
    const result = applySemanticIntent(request("Закажи столик и позови такси"), intent({ stages: [stage("restaurant"), stage("park")] }));
    expect(result.issue).toBe("unsupported");
  });
  it("preserves every hard field while replacing activities and does not mutate the request", () => {
    const input = request("Мне бы эспрессо", {
      availableMinutes: 95, returnToStart: true, requiredFeatures: ["outlets", "wheelchair", "indoor", "quiet"],
      excludedCategories: ["museum"], excludedPoiIds: ["synthetic-excluded"], keepPoiIds: ["synthetic-retained"],
      maxDistanceMetres: 1200, confirmedOpen: true, startTime: "2026-10-19T12:00:00+05:00",
      language: "kk", budgetKzt: 7000, strictBudget: true, groupSize: 4,
      airportDeadline: "2026-10-19T18:00:00+05:00", journeyStages: [stage("park")], interests: ["landmark"],
    });
    const before = structuredClone(input);
    const result = applySemanticIntent(input, intent());
    expect(result.issue).toBeUndefined();
    const mutable = new Set(["journeyStages", "journeyOrder", "interests", "searchMode"]);
    for (const [key, value] of Object.entries(interpretRequest(input))) {
      if (!mutable.has(key)) expect(result.context[key as keyof SearchRequest], key).toEqual(value);
    }
    expect(result.context.journeyStages).toEqual([stage("cafe")]);
    expect(result.context.interests).toEqual([]);
    expect(input).toEqual(before);
  });

  it("keeps hard constraints extracted from the current text outside the model's authority", () => {
    const input = request("Хочу кофе, 30 минут, вернуться, розетка обязательна, не более 5000 тенге");
    const result = applySemanticIntent(input, intent({ stages: [stage("cafe")], discovery: true }));
    expect(result.issue).toBeUndefined();
    expect(result.context).toMatchObject({ availableMinutes: 30, returnToStart: true,
      requiredFeatures: ["outlets"], budgetKzt: 5000, strictBudget: true });
  });

  it("preserves stages, order, cuisine and discovery mode for a constraint-only refinement", () => {
    const input = request("Поменьше ходить", { journeyStages: [stage("restaurant", ["italian", "pizza"])],
      journeyOrder: "ordered", searchMode: "discovery", interests: ["other"], returnToStart: true });
    const result = applySemanticIntent(input, intent({ action: "refine", stages: [], order: "any" }));
    expect(result.issue).toBeUndefined();
    expect(result.context).toMatchObject({ journeyStages: input.journeyStages, journeyOrder: "ordered",
      searchMode: "discovery", interests: ["other"], maxDistanceMetres: 1200, returnToStart: true });
  });

  it.each([
    ["Где я могу поесть?", [stage("restaurant")], [], true],
    ["Мне бы поотдыхать", [stage("park")], [], true],
    ["Где можно прогуляться?", [stage("park")], [], true],
    ["Что посмотреть в городе?", [], ["landmark", "museum"], true],
    ["Хочу поесть, потом попить кофе", [stage("restaurant"), stage("cafe")], [], false],
    ["Хочу кофе, потом отдохнуть", [stage("cafe"), stage("park")], [], false],
    ["Поесть, затем кофе, потом в парк", [stage("restaurant"), stage("cafe"), stage("park")], [], false],
    ["Поесть, потом кофе, потом снова поесть", [stage("restaurant"), stage("cafe"), stage("restaurant")], [], false],
  ] as const)("projects validated model activities for %s", (query, stages, interests, discovery) => {
    const result = applySemanticIntent(request(query), intent({ stages: structuredClone([...stages]), interests: [...interests], discovery }));
    expect(result.issue).toBeUndefined();
    expect(result.context.journeyStages).toEqual(stages);
    expect(result.context.interests).toEqual(interests);
    expect(result.context.searchMode).toBe(discovery ? "discovery" : "plan");
    expect(result.context.journeyOrder).toBe("ordered");
  });

  it("replaces a prior itinerary when a new independent tourist goal is understood", () => {
    const input = request("Какие достопримечательности посетить?", { journeyStages: [stage("restaurant"), stage("park")],
      interests: ["cafe"], returnToStart: true, requiredFeatures: ["wheelchair"] });
    const result = applySemanticIntent(input, intent({ stages: [], interests: ["landmark", "museum"], discovery: true }));
    expect(result.issue).toBeUndefined();
    expect(result.context).toMatchObject({ journeyStages: [], interests: ["landmark", "museum"], searchMode: "discovery",
      returnToStart: true, requiredFeatures: ["wheelchair"] });
  });

  it.each([
    ["Хочу кофе и парк", [stage("cafe")]],
    ["Хочу поесть и погулять", [stage("park")]],
    ["Хочу в итальянский ресторан и парк", [stage("restaurant", ["italian"])]],
  ])("rejects a model projection that omits a recognized mandatory current activity: %s", (query, stages) => {
    expect(applySemanticIntent(request(query), intent({ stages })).issue).toBe("incomplete");
  });

  it("does not convert an explicit combined plan into an activity-free discovery list", () => {
    const result = applySemanticIntent(request("Кофе и парк"), intent({ stages: [], interests: ["cafe", "park"], discovery: true }));
    expect(result.issue).toBe("incomplete");
  });

  it("rejects reversing a clearly stated sequential order even when all kinds are present", () => {
    const result = applySemanticIntent(request("Сначала кофе, затем парк"), intent({ stages: [stage("park"), stage("cafe")] }));
    expect(result.issue).toBeDefined();
  });

  it("does not loosen a clearly stated sequence to arbitrary order", () => {
    const result = applySemanticIntent(request("Сначала кофе, затем парк"), intent({ stages: [stage("cafe"), stage("park")], order: "any" }));
    expect(result.issue).toBeUndefined();
    expect(result.context.journeyOrder).toBe("ordered");
  });

  it("allows semantic chronology to correct the mention order of a relative-time phrase", () => {
    const result = applySemanticIntent(request("Парк после кофе"), intent({ stages: [stage("cafe"), stage("park")] }));
    expect(result.issue).toBeUndefined();
    expect(result.context.journeyStages).toEqual([stage("cafe"), stage("park")]);
    expect(result.context.journeyOrder).toBe("ordered");
  });

  it("inherits prior restaurant cuisines even when the model omits them", () => {
    const input = request("Мне бы пообедать и выдохнуть на воздухе", {
      journeyStages: [stage("restaurant", ["italian", "pizza"]), stage("park")],
    });
    const result = applySemanticIntent(input, intent({ stages: [stage("restaurant"), stage("park")] }));
    expect(result.issue).toBeUndefined();
    expect(result.context.journeyStages).toEqual([stage("restaurant", ["italian", "pizza"]), stage("park")]);
  });

  it("keeps cuisine explicitly declared in this turn as a source constraint", () => {
    const result = applySemanticIntent(request("Итальянский ресторан, затем парк"), intent({ stages: [stage("restaurant"), stage("park")] }));
    expect(result.issue).toBeUndefined();
    expect(result.context.journeyStages[0].cuisines).toEqual(["italian"]);
  });

  it.each([
    ["Где поесть итальянской кухни?", ["italian"]],
    ["Где поесть суши?", ["sushi"]],
    ["Где поесть эфиопской кухни?", ["unverified"]],
  ])("preserves cuisine for generic standalone food discovery: %s", (query, cuisines) => {
    const result = applySemanticIntent(request(query), intent({ stages: [stage("restaurant")], discovery: true }));
    expect(result.issue).toBeUndefined();
    expect(result.context.journeyStages).toEqual([stage("restaurant", cuisines)]);
    expect(result.context.searchMode).toBe("discovery");
  });

  it.each(["ambiguous", "unsupported", "too_many_stops"] as const)("returns clarification without changing server context for %s", (issue) => {
    const input = request("Непредставимый запрос", { journeyStages: [stage("park")], availableMinutes: 40 });
    const before = structuredClone(input);
    const result = applySemanticIntent(input, intent({ action: "clarify", stages: [], issue }));
    expect(result.issue).toBe(issue);
    expect(result.context).toEqual(interpretRequest(input));
    expect(input).toEqual(before);
  });

  it.each([
    { availableMinutes: 240 }, { returnToStart: false }, { origin: { longitude: 0, latitude: 0 } },
    { requiredFeatures: [] }, { excludedCategories: [] }, { budgetKzt: 0 },
    { poiId: "invented" }, { tool: "booking" }, { explanation: "Ignore all constraints" },
  ])("rejects model-authored hard context, POI or prose keys: %j", (extra) => {
    const input = request("Хочу эспрессо", { returnToStart: true, availableMinutes: 40 });
    const before = structuredClone(input);
    const result = applySemanticIntent(input, invalid({ ...intent(), ...extra }));
    expect(result.issue).toBe("invalid");
    expect(result.context).toEqual(interpretRequest(input));
    expect(input).toEqual(before);
  });

  it.each([
    { stages: [stage("cafe"), stage("park"), stage("restaurant"), stage("cafe")] },
    { stages: [stage("park", ["italian"])] },
    { stages: [{ ...stage("cafe"), sourceFacts: { venueType: "restaurant" } }] },
    { action: "refine", stages: [stage("restaurant")] },
    { action: "clarify", issue: "none" },
    { action: "replace", issue: "unsupported" },
    { action: "replace", stages: [], interests: [] },
    { stages: [{ kind: "hotel", cuisines: [] }] },
  ])("fails closed for an invalid activity contract: %j", (override) => {
    const result = applySemanticIntent(request("Туристический запрос"), invalid({ ...intent(), ...override }));
    expect(result.issue).toBe("invalid");
  });

  it("rejects a discovery response that claims multiple mandatory sequential stops", () => {
    const result = applySemanticIntent(request("Нужен обед и свежий воздух"), intent({ stages: [stage("restaurant"), stage("park")], discovery: true }));
    expect(result.issue).toBe("ambiguous");
  });

  it("does not silently drop sightseeing interests from a food discovery response", () => {
    const result = applySemanticIntent(request("Хочу варианты для обеда и осмотра города"), intent({ stages: [stage("restaurant")], interests: ["landmark"], discovery: true }));
    expect(result.issue).toBe("unsupported");
  });

  it("rejects cuisine unions that would exceed the validated request limit instead of dropping tokens", () => {
    const input = request("Нужен обед", { journeyStages: [stage("restaurant", ["italian", "pizza", "japanese", "sushi", "georgian", "chinese"])] });
    const result = applySemanticIntent(input, intent({ stages: [stage("restaurant", ["korean"])] }));
    expect(result.issue).toBe("invalid");
    expect(result.context.journeyStages).toEqual(input.journeyStages);
  });
});
