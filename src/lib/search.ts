import { assessBudget, checkConstraints, openingForVisit, straightLineMetres, validateGeneratedChoices } from "./domain";
import { hoursFor } from "./hours";
import { embedQuery, generateChoices } from "./model";
import { hybridRetrieve, lexicalRank, loadSnapshot, nearby, supabaseConfigured } from "./retrieval";
import { localHybridRetrieve } from "./local-index";
import { walkingRoute } from "./routing";
import { interpretRequest, searchRequestSchema, type Category, type Poi, type Recommendation, type SearchRequest, type SearchResponse } from "./types";
import { appMode, DEMO_TIME, primaryProvider, requestSignal } from "./server/config";
import type { GenerationTelemetry } from "./server/providers";
import { groundedCopy } from "./grounded-copy";
import { matchesStage } from "./journey";
import { searchJourney } from "./journey-search";
import { interpretSemanticIntent, semanticIntentModel, semanticIntentFailure, SEMANTIC_PROMPT_VERSION, type IntentFailure } from "./semantic-intent";
import { applySemanticIntent, requestCapabilityIssue } from "./request-understanding";
import { searchDiscovery } from "./discovery-search";
import { localRuntimeMemoryStop } from "./local-runtime-status";
import { hasNamedOriginStatement, resolveNamedOrigin } from "./named-origin";

const activities: Record<Category, string> = { park: "walk", cafe: "coffee", museum: "explore", landmark: "look", playground: "play", other: "look" };
const visitDuration: Record<Category, number> = { park: 15, cafe: 20, museum: 30, landmark: 10, playground: 20, other: 10 };
const stopWords = new Set(["хочу", "рядом", "есть", "минут", "неподалёку", "неподалеку", "что-нибудь", "интересное", "место", "места", "поблизости", "посоветуй", "найди", "сейчас", "час"]);
function hasQueryMatch(poi: Poi, context: SearchRequest): boolean {
  if (context.interests.length || !context.query.trim()) return true;
  const terms = (context.query.toLowerCase().match(/[\p{L}]{4,}/gu) ?? []).filter((word) => !stopWords.has(word));
  if (!terms.length || /времени|поменьше|вдвое|открыт|розет|коляск|помещен|вернуться|indoor|outlet|walking|серуен|саябақ/u.test(context.query)) return true;
  const document = `${poi.name} ${poi.description}`.toLowerCase();
  return terms.some((word) => document.includes(word.slice(0, 5)));
}
/** Resolve an explicit named start only from the validated snapshot, before inference. */
export async function searchPlaces(input: SearchRequest, signal?: AbortSignal): Promise<SearchResponse> {
  signal?.throwIfAborted();
  const request = searchRequestSchema.parse(input);
  if (!hasNamedOriginStatement(request.query)) return searchAtOrigin(request, signal);
  const named = resolveNamedOrigin(request.query, await loadSnapshot());
  signal?.throwIfAborted();
  if (!named) return searchAtOrigin(request, signal);
  const choice = request.originChoice;
  const chosen = named.candidates.find((candidate) => candidate.poiId === choice?.poiId);
  // A source name is location context even while waiting for confirmation.
  const query = named.nameSpan ? request.query.slice(0, named.nameSpan.start) + "[ориентир]" + request.query.slice(named.nameSpan.end) : request.query;
  // Existing UI presets may already specify this exact reference point; preserve their coordinates.
  const alreadySelected = named.candidates.length === 1 && straightLineMetres(request.origin, named.candidates[0].location) <= 1;
  if (!chosen && !alreadySelected) {
    const demo = appMode() === "demo";
    const context = interpretRequest({ ...request, query });
    context.query = request.query;
    const clock = context.startTime ?? (demo ? DEMO_TIME : new Date().toISOString());
    context.startTime = clock;
    const question = context.language === "en"
      ? named.candidates.length ? "Use this OSM place as your starting reference? Confirm it or keep the selected start. The point may be the building centre, not its entrance."
        : "The named starting place was not found exactly in this snapshot. Select a start on the map and remove the location phrase from the query; no coordinates have been guessed."
      : context.language === "kk"
        ? named.candidates.length ? "Осы OSM нысанын бастапқы бағдар ретінде қолданамыз ба? Растаңыз немесе таңдалған бастапқы нүктені сақтаңыз. Нүкте кіреберіс емес, ғимарат ортасы болуы мүмкін."
          : "Аталған бастапқы орын деректерден дәл табылмады. Картадан нүкте таңдап, сұраудан орын туралы тіркесті алып тастаңыз. Координаталар болжанбады."
        : named.candidates.length ? "Начать у найденного объекта OSM? Подтвердите его или оставьте выбранный старт. Точка может быть центром здания, а не входом."
          : "Названный старт не найден точно в нашем снимке. Выберите точку на карте и уберите фразу о местоположении из запроса. Координаты не подставлялись.";
    return { kind: "clarification", mode: demo ? "demo" : "degraded", resultKind: "alternatives", items: [], context,
      originCandidates: named.candidates, clarification: { code: named.candidates.length ? "origin_confirmation" : "origin_not_found", question, fields: ["origin"] },
      plan: { ...assessBudget([], null, { availableMinutes: context.availableMinutes, reserveMinutes: 5, returnToStart: context.returnToStart }), returnToStart: context.returnToStart, legs: [] }, warnings: [],
      provenance: { dataSource: "real_snapshot", retrieval: "not_run", generation: "not_run", clock },
      diagnostics: { candidateCount: 0, retrieval: "not_run", generation: "not_run", understanding: "not_run" } };
  }
  const candidate = chosen ?? named.candidates[0];
  const useAsStart = chosen ? choice!.useAsStart : true;
  const origin = chosen && useAsStart ? candidate.location : request.origin;
  // Mask only the proven name span. Keep every surrounding instruction, time and hard condition.
  const result = await searchAtOrigin({ ...request, origin, query }, signal);
  return { ...result, context: { ...result.context, query: request.query },
    namedOrigin: { poiId: candidate.poiId, name: candidate.name, usedAsStart: useAsStart } };
}

async function searchAtOrigin(input: SearchRequest, signal?: AbortSignal): Promise<SearchResponse> {
  const started = performance.now();
  const demo = appMode() === "demo";
  // CPU-only local RAG loads three models serially. Cloud and demo retain their existing limit.
  const deadline = requestSignal(signal, !demo && primaryProvider() === "ollama" ? 90_000 : 60_000); deadline.throwIfAborted();
  let context = interpretRequest(searchRequestSchema.parse(input));
  const startTime = context.startTime ?? (demo ? DEMO_TIME : new Date().toISOString());
  context.startTime = startTime;
  const empty = (warnings: string[]): SearchResponse => ({ kind: "no_match", mode: demo ? "demo" : "degraded", resultKind: "alternatives", items: [], context,
    ...(context.journeyStages.length ? { journey: { status: "incomplete" as const, stages: context.journeyStages.map((stage, index) => ({ index, kind: stage.kind, poiId: null, evidenceIds: [] })) } } : {}),
    plan: { ...assessBudget([], null, { availableMinutes: context.availableMinutes, reserveMinutes: 5, returnToStart: context.returnToStart }), returnToStart: context.returnToStart, legs: [] }, warnings,
    provenance: { dataSource: "real_snapshot", retrieval: "not_run", generation: "not_run", clock: startTime }, diagnostics: { candidateCount: 0, retrieval: "not_run", generation: "not_run", elapsedMs: Math.round(performance.now() - started) } });
  if (/вылет|аэропорт|airport|flight|әуежай|ұшақ/iu.test(context.query) || context.airportDeadline) {
    const result = empty([]);
    const question = context.language === "en" ? "When must you be back at the airport, and how will you travel? Flight time includes transfer and airport buffers. This prototype cannot verify that transfer."
      : context.language === "kk" ? "Әуежайға қашан қайту керек және қандай көлікпен барасыз? Трансфер мен әуежайдағы уақыт қорын есептеу қажет. Бұл прототип трансферді тексере алмайды."
      : "К какому времени нужно вернуться в аэропорт и на каком транспорте? До вылета нужны запас и трансфер. Этот прототип проверяет только пешие прогулки и не может подтвердить трансфер.";
    return { ...result, kind: "clarification", clarification: { code: "airport_buffer_transport", question, fields: ["airportDeadline", "transport"] } };
  }
  if (/заброни|брон[ьи]|резервир|\bbook\b|reservation|брондау/iu.test(context.query)) {
    const result = empty([]);
    return { ...result, kind: "clarification", clarification: { code: "booking_unsupported", fields: ["query"], question: context.language === "en" ? "Booking is not connected. Would you like a walking plan without a reservation?"
      : context.language === "kk" ? "Бронь жасау қосылмаған. Броньсыз серуен жоспарын іздейміз бе?" : "Бронирование не подключено. Найти пеший план без оформления брони?" } };
  }
  // Cheap, certain refusals precede any model. Demo remains fully deterministic.
  if (context.availableMinutes < 10) return empty(["Указанный бюджет меньше 10 минут. Он сохранён; посещение с запасом и пешим путём подтвердить нельзя."]);
  const explicitCurrentTurn = interpretRequest({ ...input, journeyStages: [], interests: [] });
  if (explicitCurrentTurn.journeyStages.reduce((sum, stage) => sum + ({ cafe: 8, park: 10, restaurant: 25 })[stage.kind], 5) > context.availableMinutes) return empty(["На все обязательные этапы не хватает времени даже без пешего пути. Указанный бюджет сохранён."]);
  // An impossible hard amenity condition needs neither intent inference nor embeddings.
  if (!demo && process.env.RETRIEVAL_PROVIDER === "local" && context.requiredFeatures.length) {
    const possible = (await loadSnapshot()).some((poi) => straightLineMetres(context.origin, poi.location) <= context.maxDistanceMetres
      && !context.excludedCategories.includes(poi.category) && !context.excludedPoiIds.includes(poi.id)
      && context.requiredFeatures.every((feature) => poi.features[feature] === true));
    if (!possible) {
      const result = empty(["По обязательным условиям подтверждённых вариантов не найдено. Условия сохранены."]);
      return { ...result, provenance: { ...result.provenance, retrieval: "local-constraints-no-match" },
        diagnostics: { ...result.diagnostics, retrieval: "local-constraints-no-match", understanding: "not_run" } };
    }
  }
  let understanding = demo ? "deterministic-demo" : "not_run";
  let understandingModel: string | undefined;
  let understandingFailure: IntentFailure | undefined;
  if (!demo && context.query.trim()) {
    let issue: string | undefined = requestCapabilityIssue(context.query);
    try {
      if (!issue) {
        understandingModel = semanticIntentModel();
        const intent = await interpretSemanticIntent(input, deadline);
        const understood = applySemanticIntent(input, intent);
        context = { ...understood.context, startTime };
        issue = understood.issue;
        understanding = issue ? "ollama-clarification" : "ollama-validated";
      } else understanding = "capability-clarification";
    } catch (error) {
      deadline.throwIfAborted();
      understandingFailure = semanticIntentFailure(error);
      if (understandingFailure === "unavailable" && await localRuntimeMemoryStop()) understandingFailure = "memory";
      issue = understandingFailure === "timeout" ? "timeout" : understandingFailure === "memory" ? "memory" : "unavailable"; understanding = "unavailable";
    }
    if (issue) {
      const failureQuestion = understandingFailure === "memory" ? {
        ru: "Локальная модель остановлена защитой из-за нехватки оперативной памяти. Закройте ненужные приложения, освободите не менее 3,5 ГБ RAM и перезапустите Ollama. Ваши условия сохранены.",
        en: "The local model was stopped by its low-memory guard. Close unused apps, free at least 3.5 GiB of RAM, and restart Ollama. Your conditions are preserved.",
        kk: "Жергілікті модель жедел жад жетіспегендіктен қорғаныс арқылы тоқтатылды. Қажетсіз қолданбаларды жауып, кемінде 3,5 ГиБ RAM босатыңыз және Ollama қызметін қайта іске қосыңыз. Шарттарыңыз сақталды.",
      } : understandingFailure === "timeout" ? {
        ru: "Локальная модель не успела разобрать запрос за отведённое время. Повторите поиск: холодный запуск на этом устройстве может быть медленным. Ваши условия сохранены.",
        en: "The local model did not finish in time. Please try the search again; a cold start on this device can be slow. Your conditions are preserved.",
        kk: "Жергілікті модель сұрауды уақытында талдап үлгермеді. Іздеуді қайталаңыз: осы құрылғыда алғашқы іске қосылу баяу болуы мүмкін. Шарттарыңыз сақталды.",
      } : {
        ru: "Не удалось получить проверенный ответ локальной модели. Проверьте Ollama и повторите поиск. Ваши условия сохранены.",
        en: "A validated response from the local model was not available. Check Ollama and try the search again. Your conditions are preserved.",
        kk: "Жергілікті модельден тексерілген жауап алынбады. Ollama қызметін тексеріп, іздеуді қайталаңыз. Шарттарыңыз сақталды.",
      };
      const question = understandingFailure ? failureQuestion[context.language] : context.language === "en" ? "I could not reliably interpret every requested activity. Please clarify the activities and their order (up to three stops); booking and unsupported activities cannot be planned."
        : context.language === "kk" ? "Барлық сұралған әрекетті сенімді түсіндіре алмадым. Әрекеттерді және ретін нақтылаңыз (үш аялдамаға дейін); бронь жасау мен қолдау көрсетілмейтін әрекеттер жоспарланбайды."
        : "Не удалось надёжно понять все действия. Уточните, чем хотите заняться и в каком порядке (до трёх остановок). Бронирование и неподдерживаемые действия пока не планируются.";
      const result = empty([]);
      return { ...result, kind: "clarification", clarification: { code: `intent_${issue}`, question, fields: ["query"] },
        diagnostics: { ...result.diagnostics, understanding, understandingModel, understandingFailure, understandingPromptVersion: SEMANTIC_PROMPT_VERSION } };
    }
  }
  if (context.journeyStages.some((s) => context.excludedCategories.includes(s.kind === "restaurant" ? "other" : s.kind))) {
    return { ...empty([]), kind: "clarification", clarification: { code: "conflicting_stages", fields: ["journeyStages", "excludedCategories"], question: context.language === "en" ? "A required stage is also excluded. Which condition should change?" : context.language === "kk" ? "Міндетті кезең сонымен бірге алынып тасталған. Қай шартты өзгертеміз?" : "Обязательный этап одновременно запрещён. Какое условие изменить?" } };
  }
  if (context.availableMinutes < 10) return empty(["Указанный бюджет меньше 10 минут. Он сохранён; посещение с запасом и пешим путём подтвердить нельзя."]);
  if (context.journeyStages.reduce((sum, stage) => sum + ({ cafe: 8, park: 10, restaurant: 25 })[stage.kind], 5) > context.availableMinutes) return empty(["На все обязательные этапы не хватает времени даже без пешего пути. Указанный бюджет сохранён."]);
  if (context.strictBudget) return empty([context.language === "en" ? "No verified prices in this dataset: a strict KZT budget cannot be guaranteed. Constraints are preserved."
    : context.language === "kk" ? "Деректерде расталған бағалар жоқ: теңгемен қатаң бюджетті растау мүмкін емес. Шарттар сақталды."
    : "В данных нет подтверждённых цен: строгий бюджет в KZT проверить нельзя. Неизвестная цена не считается нулевой; условия сохранены."]);
  const warnings: string[] = [];
  if (/погод|дожд|холод|weather|rain|ауа рай|жаңбыр/iu.test(context.query)) warnings.push("Прогноз погоды не подключён. Погода не проверялась; обязательные условия можно задать вручную.");
  if (context.budgetKzt !== null) warnings.push("Цены неизвестны: денежный бюджет не подтверждён.");
  let candidates: Poi[] = [];
  let retrieval = "snapshot-lexical";
  let database = false;
  if (!demo && process.env.RETRIEVAL_PROVIDER === "supabase" && supabaseConfigured()) {
    try { candidates = await hybridRetrieve(context, await embedQuery(context.query || "Интересные места для прогулки в Астане", deadline), deadline); retrieval = "supabase-hybrid"; database = true; }
    catch { warnings.push("Семантический поиск недоступен; используем доступный географический и текстовый поиск."); }
  }
  if (!database) {
    const result = await nearby(context.origin, context.maxDistanceMetres, 5000, deadline);
    candidates = lexicalRank(result.items, context); database = result.mode === "live";
    retrieval = database ? "supabase-lexical" : "snapshot-lexical";
    warnings.push(...result.warnings);
  }
  if (!demo && process.env.RETRIEVAL_PROVIDER !== "supabase") {
    try {
      const all = (await loadSnapshot()).filter((poi) => straightLineMetres(context.origin, poi.location) <= context.maxDistanceMetres
        && (context.journeyStages.length ? context.journeyStages.some((stage) => matchesStage(poi, stage)) : !context.interests.length || context.interests.includes(poi.category)) && !context.excludedCategories.includes(poi.category)
        && !context.excludedPoiIds.includes(poi.id) && context.requiredFeatures.every((feature) => poi.features[feature] === true));
      if (!all.length || context.journeyStages.some((stage) => !all.some((poi) => matchesStage(poi, stage)))) { candidates = []; retrieval = "local-constraints-no-match"; }
      else {
        const local = await localHybridRetrieve(context, await embedQuery(context.query || "Прогулка по Астане", deadline), all, lexicalRank(all, context), deadline);
        // Keep each hard stage represented even if a common category dominates RRF's top40.
        const balanced = context.journeyStages.flatMap((stage) => all.filter((poi) => matchesStage(poi, stage))
          .sort((a, b) => straightLineMetres(context.origin, a.location) - straightLineMetres(context.origin, b.location)).slice(0, 4));
        candidates = [...new Map([...local.items, ...balanced].map((poi) => [poi.id, poi])).values()]; retrieval = "local-hybrid";
      }
    } catch { warnings.push("Локальный векторный индекс или embedding-модель недоступны. Использован географический и текстовый поиск по реальному снимку."); }
  }
  if (context.keepPoiIds.some((id) => !candidates.some((poi) => poi.id === id))) {
    const preserved = await nearby(context.origin, context.maxDistanceMetres, 5000, deadline);
    if ((preserved.mode === "live") === database) {
      const known = new Set(candidates.map((poi) => poi.id));
      candidates.push(...preserved.items.filter((poi) => context.keepPoiIds.includes(poi.id) && !known.has(poi.id)));
    }
  }
  const candidateCount = candidates.length;
  const constraints = { requiredFeatures: context.requiredFeatures, excludedCategories: context.excludedCategories,
    excludedPoiIds: context.excludedPoiIds, confirmedOpen: context.confirmedOpen, maximumStraightLineMetres: context.maxDistanceMetres };
  const exclusions: Record<string, number> = {};
  const originalRanks = new Map(candidates.map((poi, i) => [poi.id, i]));
  candidates = candidates.map((poi) => ({ ...poi, hours: hoursFor(poi, startTime) }))
    .filter((poi) => { const result = checkConstraints(poi, context.origin, { ...constraints, confirmedOpen: false }); for (const reason of result.failures) exclusions[reason] = (exclusions[reason] ?? 0) + 1; return result.accepted; })
    .filter((poi) => { if (context.confirmedOpen && !poi.hours) { exclusions.opening_unknown = (exclusions.opening_unknown ?? 0) + 1; return false; } return true; })
    .filter((poi) => context.journeyStages.length > 0 || hasQueryMatch(poi, context))
    .filter((poi) => context.journeyStages.length ? context.journeyStages.some((stage) => matchesStage(poi, stage)) : context.interests.length === 0 || context.interests.includes(poi.category))
    .sort((a, b) => {
      const first = context.keepPoiIds.indexOf(a.id); const second = context.keepPoiIds.indexOf(b.id);
      const retained = (first < 0 ? 99 : first) - (second < 0 ? 99 : second);
      // Proximity is ranking input, never a claimed walking duration. Exact named matches keep priority.
      const exact = (poi: Poi) => poi.name.toLocaleLowerCase("ru") === context.query.trim().toLocaleLowerCase("ru");
      return retained || Number(exact(b)) - Number(exact(a))
        || ((originalRanks.get(a.id) ?? 0) / 3 + straightLineMetres(context.origin, a.location) / 250)
          - ((originalRanks.get(b.id) ?? 0) / 3 + straightLineMetres(context.origin, b.location) / 250);
    })
    .slice(0, context.journeyStages.length ? 5000 : 12);
  if (context.searchMode === "discovery" || context.journeyStages.length) {
    const execute = context.searchMode === "discovery" ? searchDiscovery : searchJourney;
    const result = await execute(context, candidates, { demo, database, retrieval, warnings, candidateCount, deadline, startTime, started });
    return { ...result, diagnostics: { ...result.diagnostics, understanding, understandingModel, ...(!demo ? { understandingPromptVersion: SEMANTIC_PROMPT_VERSION } : {}) } };
  }
  const maximumPlaces = context.availableMinutes >= 55 ? 3 : context.availableMinutes >= 35 ? 2 : 1;
  const perPlace = Math.max(5, Math.floor((context.availableMinutes - 8) / maximumPlaces) - 5);
  const template = (pois = candidates.slice(0, maximumPlaces)) => validateGeneratedChoices(pois.map((poi) => ({
    poiId: poi.id, evidenceIds: poi.evidence.filter((evidence) => evidence.poiId === poi.id && evidence.field === "category" && evidence.value === poi.category).map((evidence) => evidence.id).slice(0, 1),
    activity: activities[poi.category], visitMinutes: Math.min(visitDuration[poi.category], perPlace),
  })), candidates, context.availableMinutes);
  let generation = "template";
  const telemetry: GenerationTelemetry = {};
  let choices: ReturnType<typeof validateGeneratedChoices> = [];
  if (candidates.length) {
    if (demo) choices = template();
    else try { choices = (await generateChoices(context, candidates, deadline, telemetry)).slice(0, maximumPlaces); generation = `${telemetry.provider ?? "ollama"}-validated`; }
    catch { choices = template(); warnings.push("Ограниченный режим: генерация не разрешена, недоступна или ответ отклонён проверкой. Использованы проверяемые шаблоны."); }
  }
  if (candidates.length && !choices.length) { choices = template(); generation = "template-after-empty"; warnings.push("Модель не выбрала варианты. Показан проверяемый резервный подбор с сохранением обязательных условий."); }
  const kept = template(candidates.filter((poi) => context.keepPoiIds.includes(poi.id)).slice(0, maximumPlaces));
  choices = [...kept.map((choice) => choices.find((candidate) => candidate.poiId === choice.poiId) ?? choice),
    ...choices.filter((choice) => !kept.some((candidate) => candidate.poiId === choice.poiId))].slice(0, maximumPlaces);
  let selected = choices.map((choice) => ({ poi: candidates.find((poi) => poi.id === choice.poiId)!, choice: { ...choice, visitMinutes: Math.min(choice.visitMinutes, perPlace) } }));
  const attemptedIds = new Set(selected.map(({ poi }) => poi.id));
  const budget = { availableMinutes: context.availableMinutes, reserveMinutes: 5, returnToStart: context.returnToStart };
  let legs = selected.length ? await walkingRoute(context.origin, selected.map(({ poi }) => poi), context.returnToStart, deadline) : null;
  let plan = assessBudget(selected.map(({ choice }) => ({ poiId: choice.poiId, minutes: choice.visitMinutes })), legs, budget);
  // Bounded recomputation. Every removed place is excluded; remaining constraints never change.
  for (let attempt = 0; attempt < 3 && selected.length; attempt++) {
    let elapsedSeconds = 0;
    const invalid = new Set<string>();
    for (let i = 0; i < selected.length; i++) {
      const { poi, choice } = selected[i];
      if (legs) elapsedSeconds += legs[i]?.seconds ?? 0;
      const arrival = legs ? new Date(Date.parse(startTime) + elapsedSeconds * 1000).toISOString() : undefined;
      const checked = checkConstraints(poi, context.origin, constraints, arrival ? { arrival, minutes: choice.visitMinutes } : undefined);
      if (!checked.accepted) { invalid.add(poi.id); for (const reason of checked.failures) exclusions[reason] = (exclusions[reason] ?? 0) + 1; }
      elapsedSeconds += choice.visitMinutes * 60;
    }
    if (plan.status === "too_long" && selected.length) { invalid.add(selected.at(-1)!.poi.id); exclusions.time_budget = (exclusions.time_budget ?? 0) + 1; }
    if (!invalid.size) break;
    selected = selected.filter(({ poi }) => !invalid.has(poi.id));
    // At most three routing calls in total. After an infeasible singleton, try one unused
    // nearby retrieved candidate instead of falsely declaring the entire shortlist impossible.
    if (!selected.length && attempt < 2) {
      const alternative = candidates.find((poi) => !attemptedIds.has(poi.id));
      if (alternative) {
        const choice = template([alternative])[0];
        selected = [{ poi: alternative, choice }]; attemptedIds.add(alternative.id);
        warnings.push("Выбор изменён после проверки времени и условий. Обязательные условия сохранены.");
      }
    }
    legs = selected.length ? await walkingRoute(context.origin, selected.map(({ poi }) => poi), context.returnToStart, deadline) : null;
    plan = assessBudget(selected.map(({ choice }) => ({ poiId: choice.poiId, minutes: choice.visitMinutes })), legs, budget);
  }
  let elapsedSeconds = 0;
  const items: Recommendation[] = selected.map(({ poi, choice }, i) => {
    if (legs) elapsedSeconds += legs[i].seconds;
    const arrival = new Date(Date.parse(startTime) + elapsedSeconds * 1000).toISOString();
    const openingStatus = legs ? openingForVisit(poi, arrival, choice.visitMinutes) : "unknown";
    elapsedSeconds += choice.visitMinutes * 60;
    const distance = Math.round(straightLineMetres(context.origin, poi.location));
    return { ...poi, ...groundedCopy(poi, choice, context.language, distance), visitMinutes: choice.visitMinutes,
      evidenceIds: choice.evidenceIds, distanceMetres: Math.round(straightLineMetres(context.origin, poi.location)), openingStatus,
      warnings: [...(openingStatus === "unknown" ? ["Часы на время визита не подтверждены."] : []),
        ...(poi.confirmedAt === null ? ["Дата подтверждения сведений неизвестна."] : [])],
    };
  });
  if (context.keepPoiIds.some((id) => !items.some((poi) => poi.id === id))) warnings.push("Часть сохранённых мест пришлось убрать после повторной проверки времени, области и обязательных условий.");
  if (!items.length) warnings.push(context.requiredFeatures.length || context.confirmedOpen
    ? "По обязательным условиям подтверждённых вариантов не найдено. Условия сохранены; их можно изменить вручную."
    : "Подходящих мест в выбранной области и бюджете не найдено. Попробуйте другую стартовую точку или запрос.");
  deadline.throwIfAborted();
  const live = (database || retrieval === "local-hybrid") && generation.endsWith("-validated") && plan.status === "fits_estimate";
  return { mode: demo ? "demo" : live ? "live" : "degraded", kind: !items.length ? "no_match" : !demo && !live ? "degraded" : "recommendations",
    resultKind: legs && plan.status === "fits_estimate" ? "itinerary" : "alternatives",
    items, context, plan: { ...plan, returnToStart: context.returnToStart, legs: legs ?? [] }, warnings: [...new Set(warnings)],
    provenance: { dataSource: database ? "supabase" : "real_snapshot", retrieval, generation, clock: startTime },
    diagnostics: { candidateCount, retrieval, generation, ...telemetry, understanding, understandingModel, ...(!demo ? { understandingPromptVersion: SEMANTIC_PROMPT_VERSION } : {}), exclusions, elapsedMs: Math.round(performance.now() - started) } };
}
