import { assessBudget, checkConstraints, openingForVisit, straightLineMetres, validateGeneratedChoices } from "./domain";
import { groundedCopy } from "./grounded-copy";
import { matchesStage, stageEvidence } from "./journey";
import { generateChoices } from "./model";
import { walkingRoute } from "./routing";
import type { GenerationTelemetry } from "./server/providers";
import type { Category, Poi, Recommendation, SearchRequest, SearchResponse } from "./types";

const activities: Record<Category, string> = { cafe: "coffee", park: "walk", museum: "explore", landmark: "look", playground: "play", other: "look" };
const visits: Record<Category, number> = { cafe: 8, park: 10, museum: 30, landmark: 10, playground: 15, other: 10 };

/** Discovery options are independent visits from the selected start, never one combined itinerary. */
export async function searchDiscovery(context: SearchRequest, candidates: Poi[], options: {
  demo: boolean; database: boolean; retrieval: string; warnings: string[]; candidateCount: number;
  deadline: AbortSignal; startTime: string; started: number;
}): Promise<SearchResponse> {
  const { demo, database, retrieval, deadline, startTime } = options;
  const warnings = [...options.warnings];
  const exclusions: Record<string, number> = {};
  const rejected = (reason: string) => { exclusions[reason] = (exclusions[reason] ?? 0) + 1; };
  const constraints = { requiredFeatures: context.requiredFeatures, excludedCategories: context.excludedCategories,
    excludedPoiIds: context.excludedPoiIds, confirmedOpen: context.confirmedOpen, maximumStraightLineMetres: context.maxDistanceMetres };
  const budget = { availableMinutes: context.availableMinutes, reserveMinutes: 5, returnToStart: context.returnToStart };
  const stage = context.journeyStages[0];
  const duration = (poi: Poi) => stage?.kind === "restaurant" ? 25 : visits[poi.category];
  const evidence = (poi: Poi) => stage ? stageEvidence(poi, stage)
    : poi.evidence.filter((item) => item.poiId === poi.id && item.field === "category" && item.value === poi.category).map((item) => item.id);
  const unique = [...new Map(candidates.map((poi) => [poi.id, poi])).values()];
  const shortlist = unique.filter((poi) => {
    if (context.journeyStages.length > 1 || (stage && !matchesStage(poi, stage))) { rejected("stage_mismatch"); return false; }
    if (!poi.evidence.some((item) => item.poiId === poi.id && item.field === "category" && item.value === poi.category)) { rejected("unsupported_category"); return false; }
    const checked = checkConstraints(poi, context.origin, { ...constraints, confirmedOpen: false });
    checked.failures.forEach(rejected);
    if (!checked.accepted) return false;
    if (duration(poi) + budget.reserveMinutes > context.availableMinutes) { rejected("time_budget"); return false; }
    return true;
  }).slice(0, 6);
  let ordered = shortlist;
  let generation = "template";
  const telemetry: GenerationTelemetry = {};
  if (!demo && shortlist.length) {
    try {
      const choices = await generateChoices(context, shortlist, deadline, telemetry);
      // Rebind even a mocked/provider result to owned IDs and evidence before using its order.
      const validated = validateGeneratedChoices(choices.map(({ poiId, evidenceIds, activity, visitMinutes }) =>
        ({ poiId, evidenceIds, activity, visitMinutes })), shortlist, Math.min(120, context.availableMinutes));
      if (!validated.length) throw new Error("EMPTY_DISCOVERY_RANKING");
      const ids = validated.map((choice) => choice.poiId);
      ordered = [...ids.map((id) => shortlist.find((poi) => poi.id === id)!), ...shortlist.filter((poi) => !ids.includes(poi.id))];
      generation = `${telemetry.provider ?? "ollama"}-validated`;
    } catch { warnings.push("Модель недоступна или ответ отклонён; варианты выбраны сервером с сохранением условий."); }
  }
  const items: Recommendation[] = [];
  let routingAttempts = 0;
  let allRoutesFit = true;
  for (const poi of ordered.slice(0, 3)) {
    deadline.throwIfAborted();
    // Each alternative starts at the user-selected origin; no leg links alternatives together.
    const route = demo ? null : await walkingRoute(context.origin, [poi], context.returnToStart, deadline);
    if (!demo) routingAttempts++;
    const minutes = duration(poi);
    const candidatePlan = assessBudget([{ poiId: poi.id, minutes }], route, budget);
    const verifiedRoute = candidatePlan.status === "fits_estimate";
    const arrival = verifiedRoute ? new Date(Date.parse(startTime) + route![0].seconds * 1000).toISOString() : undefined;
    const checked = checkConstraints(poi, context.origin, constraints, arrival ? { arrival, minutes } : undefined);
    checked.failures.forEach(rejected);
    if (candidatePlan.status === "too_long") rejected("time_budget");
    if (!checked.accepted || candidatePlan.status === "too_long") continue;
    const choice = validateGeneratedChoices([{ poiId: poi.id, evidenceIds: evidence(poi), activity: activities[poi.category], visitMinutes: minutes }], [poi], context.availableMinutes)[0];
    const openingStatus = arrival ? openingForVisit(poi, arrival, minutes) : "unknown";
    const distance = Math.round(straightLineMetres(context.origin, poi.location));
    const copy = groundedCopy(poi, choice, context.language, distance);
    const routeWarning = verifiedRoute
      ? context.language === "en" ? `This option alone: approximately ${candidatePlan.totalMinutes} min, including walking, visit, 5 min reserve${context.returnToStart ? " and return" : ""}.`
        : context.language === "kk" ? `Тек осы нұсқа: жол, бару, 5 минут қор${context.returnToStart ? " және қайту" : ""} бірге шамамен ${candidatePlan.totalMinutes} мин.`
          : `Только этот вариант: около ${candidatePlan.totalMinutes} мин с ходьбой, посещением, резервом 5 мин${context.returnToStart ? " и возвращением" : ""}.`
      : context.language === "en" ? "Walking and total time for this option are unverified."
        : context.language === "kk" ? "Осы нұсқаның жаяу жолы мен жалпы уақыты расталмаған."
          : "Пеший путь и общая длительность этого варианта не подтверждены.";
    items.push({ ...poi, ...copy, idea: stage?.kind === "restaurant"
      ? context.language === "en" ? "Idea: check the menu and order a meal. Current dishes, service time and table availability are unconfirmed."
        : context.language === "kk" ? "Ұсыныс: мәзірді қарап, тамаққа тапсырыс беру. Тағамдар, қызмет уақыты мен үстелдің болуы расталмаған."
          : "Идея: уточнить меню и поесть. Наличие блюд, столика и время обслуживания не подтверждены."
      : copy.idea,
      visitMinutes: minutes, evidenceIds: choice.evidenceIds, distanceMetres: distance, openingStatus,
      warnings: [routeWarning, ...(openingStatus === "unknown" ? ["Часы на время визита не подтверждены."] : []),
        ...(poi.confirmedAt === null ? ["Дата подтверждения сведений неизвестна."] : [])] });
    if (!verifiedRoute) allRoutesFit = false;
  }
  if (!items.length) warnings.push(context.language === "en" ? "No independent option meets the selected conditions. Try changing the time or conditions."
    : context.language === "kk" ? "Таңдалған шарттарға сай жеке нұсқа табылмады. Уақытты немесе шарттарды өзгертіңіз."
      : "Отдельные варианты по выбранным условиям не найдены. Попробуйте изменить время или условия.");
  if (context.keepPoiIds.some((id) => !items.some((poi) => poi.id === id))) warnings.push("Сохранённые места не вошли в варианты: условия имеют приоритет.");
  const live = items.length > 0 && (database || retrieval === "local-hybrid") && generation.endsWith("-validated") && allRoutesFit;
  deadline.throwIfAborted();
  return { kind: !items.length ? "no_match" : !demo && !live ? "degraded" : "recommendations", mode: demo ? "demo" : live ? "live" : "degraded",
    resultKind: "alternatives", context, items,
    // Adding alternative durations would misrepresent them as a single checked plan.
    plan: { status: "unverified", visitMinutes: 0, travelMinutes: null, reserveMinutes: 5, totalMinutes: null,
      returnToStart: context.returnToStart, legs: [], warnings: ["Варианты независимы: это список мест, а не общий маршрут."] },
    warnings: [...new Set(warnings)], provenance: { dataSource: database ? "supabase" : "real_snapshot", retrieval, generation, clock: startTime },
    diagnostics: { candidateCount: options.candidateCount, retrieval, generation, ...telemetry,
      exclusions: { ...exclusions, routing_attempts: routingAttempts }, elapsedMs: Math.round(performance.now() - options.started) } };
}
