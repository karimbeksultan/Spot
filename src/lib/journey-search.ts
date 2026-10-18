import { assessBudget, checkConstraints, openingForVisit, straightLineMetres, validateGeneratedChoices } from "./domain";
import { groundedCopy } from "./grounded-copy";
import { journeyCombinations, stageEvidence } from "./journey";
import { generateChoices } from "./model";
import { walkingRoute } from "./routing";
import type { GenerationTelemetry } from "./server/providers";
import type { Poi, Recommendation, SearchRequest, SearchResponse } from "./types";

/** A required journey is atomic: a failed stage never turns into a successful subset. */
export async function searchJourney(context: SearchRequest, candidates: Poi[], options: {
  demo: boolean; database: boolean; retrieval: string; warnings: string[]; candidateCount: number;
  deadline: AbortSignal; startTime: string; started: number;
}): Promise<SearchResponse> {
  const { demo, database, retrieval, deadline, startTime } = options;
  const warnings = [...options.warnings];
  const budget = { availableMinutes: context.availableMinutes, reserveMinutes: 5, returnToStart: context.returnToStart };
  const duration = (i: number) => ({ cafe: 8, park: 10, restaurant: 25 })[context.journeyStages[i].kind];
  let combinations = journeyCombinations(candidates, context, []);
  let generation = "template";
  const telemetry: GenerationTelemetry = {};
  // Shortlist is balanced by complete plans; Qwen may rank but cannot remove an intent stage.
  const shortlist = [...new Map(combinations.flat().map((poi) => [poi.id, poi])).values()].slice(0, 6);
  if (!demo && combinations.length && context.journeyStages.reduce((sum, _, i) => sum + duration(i), 5) <= context.availableMinutes) {
    try {
      const ranked = await generateChoices(context, shortlist, deadline, telemetry);
      combinations = journeyCombinations(candidates, context, ranked.map((c) => c.poiId));
      generation = `${telemetry.provider ?? "ollama"}-validated`;
    } catch { warnings.push("Модель недоступна или ответ отклонён; обязательные этапы проверены серверным подбором."); }
  }
  let selected: Poi[] = [];
  let legs: Awaited<ReturnType<typeof walkingRoute>> = null;
  let plan = assessBudget([], null, budget);
  const exclusions: Record<string, number> = {};
  let routingAttempts = 0;
  for (const combination of combinations) {
    deadline.throwIfAborted();
    const visits = combination.map((poi, i) => ({ poiId: poi.id, minutes: duration(i) }));
    if (visits.reduce((sum, v) => sum + v.minutes, 5) > context.availableMinutes) { exclusions.time_budget = 1; break; }
    const route = await walkingRoute(context.origin, combination, context.returnToStart, deadline); routingAttempts++;
    const candidatePlan = assessBudget(visits, route, budget);
    let elapsed = 0;
    const valid = combination.every((poi, i) => {
      elapsed += route?.[i].seconds ?? 0;
      const arrival = new Date(Date.parse(startTime) + elapsed * 1000).toISOString();
      const checked = checkConstraints(poi, context.origin, { requiredFeatures: context.requiredFeatures, excludedCategories: context.excludedCategories,
        excludedPoiIds: context.excludedPoiIds, confirmedOpen: context.confirmedOpen, maximumStraightLineMetres: context.maxDistanceMetres },
      route ? { arrival, minutes: duration(i) } : undefined);
      elapsed += duration(i) * 60;
      checked.failures.forEach((reason) => { exclusions[reason] = (exclusions[reason] ?? 0) + 1; });
      return checked.accepted;
    });
    if (candidatePlan.status === "too_long") exclusions.time_budget = (exclusions.time_budget ?? 0) + 1;
    if (valid && candidatePlan.status !== "too_long") { selected = combination; legs = route; plan = candidatePlan; break; }
  }
  let elapsed = 0;
  const items: Recommendation[] = selected.map((poi, i) => {
    const choice = validateGeneratedChoices([{ poiId: poi.id, evidenceIds: stageEvidence(poi, context.journeyStages[i]),
      activity: poi.category === "cafe" ? "coffee" : poi.category === "park" ? "walk" : "look", visitMinutes: duration(i) }], [poi], context.availableMinutes)[0];
    elapsed += legs?.[i].seconds ?? 0;
    const openingStatus = legs ? openingForVisit(poi, new Date(Date.parse(startTime) + elapsed * 1000).toISOString(), choice.visitMinutes) : "unknown";
    elapsed += choice.visitMinutes * 60;
    const distance = Math.round(straightLineMetres(context.origin, poi.location));
    const copy = groundedCopy(poi, choice, context.language, distance);
    return { ...poi, ...copy, idea: context.journeyStages[i].kind === "restaurant"
      ? context.language === "en" ? "Idea: check the menu and order a meal. Suggested time excludes any guaranteed service or reservation."
        : context.language === "kk" ? "Ұсыныс: мәзірді қарап, тамаққа тапсырыс беру. Қызмет көрсету уақыты мен бронь расталмаған."
          : "Идея: уточнить меню и поесть. Время обслуживания и наличие столика не гарантированы."
      : copy.idea,
      visitMinutes: choice.visitMinutes, evidenceIds: choice.evidenceIds, distanceMetres: distance, openingStatus,
      warnings: [...(openingStatus === "unknown" ? ["Часы на время визита не подтверждены."] : []), ...(poi.confirmedAt === null ? ["Дата подтверждения сведений неизвестна."] : [])] };
  });
  if (!items.length) warnings.push(context.language === "en" ? "No complete journey satisfies all required stages and constraints. Nothing was silently removed. Try more time or change the conditions."
    : context.language === "kk" ? "Барлық міндетті кезең мен шартқа сәйкес толық жоспар табылмады. Кезеңдер алынып тасталған жоқ. Уақытты немесе шартты өзгертіңіз."
      : "Полный план по всем обязательным этапам и условиям не найден. Этапы не удалены: попробуйте больше времени или измените условия.");
  if (context.journeyStages.some((stage) => stage.kind === "restaurant")) warnings.push("Тип и кухня указаны по тегам OSM; актуальное меню, наличие блюд, столика и время обслуживания не подтверждены.");
  if (context.keepPoiIds.some((id) => !items.some((poi) => poi.id === id))) warnings.push("Сохранённые места не вошли в полный план: условия и обязательные этапы имеют приоритет.");
  const live = (database || retrieval === "local-hybrid") && generation.endsWith("-validated") && plan.status === "fits_estimate";
  deadline.throwIfAborted();
  return { kind: !items.length ? "no_match" : !demo && !live ? "degraded" : "recommendations", mode: demo ? "demo" : live ? "live" : "degraded",
    resultKind: items.length && legs && plan.status === "fits_estimate" ? "itinerary" : "alternatives", context, items,
    journey: { status: !items.length ? "incomplete" : legs && plan.status === "fits_estimate" ? "complete" : "unverified",
      stages: context.journeyStages.map((stage, index) => ({ index, kind: stage.kind, poiId: items[index]?.id ?? null, evidenceIds: items[index]?.evidenceIds ?? [] })) },
    plan: { ...plan, returnToStart: context.returnToStart, legs: legs ?? [] }, warnings: [...new Set(warnings)],
    provenance: { dataSource: database ? "supabase" : "real_snapshot", retrieval, generation, clock: startTime },
    diagnostics: { candidateCount: options.candidateCount, retrieval, generation, ...telemetry, exclusions: { ...exclusions, routing_attempts: routingAttempts }, elapsedMs: Math.round(performance.now() - options.started) } };
}
