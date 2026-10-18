import { semanticIntentSchema, type SemanticIntent } from "./semantic-intent";
import { interpretRequest, searchRequestSchema, type SearchRequest } from "./types";
import { requestedCuisines } from "./journey";

/** Capability and boolean-operator gates validate meaning; they never invent a positive activity. */
export function requestCapabilityIssue(query: string): "ambiguous" | "unsupported" | undefined {
  if (/(?:закаж|выз(?:ов|вать|ви)|позов|заброни|оформ|куп(?:и|ить)|\b(?:book|call|order|reserve|buy)\b).{0,40}(?:такси|столик|билет|\b(?:taxi|ticket|table)\b)/iu.test(query)) return "unsupported";
  if (/(?:^|[\s,;.!?])(?:или|or|немесе)(?=[\s,;.!?]|$)/iu.test(query)) return "ambiguous";
  return undefined;
}

/** The model describes activities only. It has no authority over hard context or source facts. */
export function applySemanticIntent(input: SearchRequest, output: SemanticIntent): { context: SearchRequest; issue?: string } {
  const base = interpretRequest(input);
  const parsed = semanticIntentSchema.safeParse(output);
  if (!parsed.success) return { context: base, issue: "invalid" };
  const capabilityIssue = requestCapabilityIssue(input.query);
  if (capabilityIssue) return { context: base, issue: capabilityIssue };
  const intent = parsed.data;
  if (intent.action === "clarify") return { context: base, issue: intent.issue };
  // At the three-stop boundary, a longer clause chain may hide a dropped goal.
  // This is a conservative complexity refusal, not a phrase-to-activity parser.
  const clauses = input.query.split(/[,;\n]+|\s+(?:потом|затем|далее|then|next|содан кейін)\s+/iu)
    .filter((clause) => /[\p{L}\p{N}]/u.test(clause) && !/^(?:а|и|and|but)$/iu.test(clause.trim()));
  if (intent.stages.length === 3 && clauses.length > 3) return { context: base, issue: "ambiguous" };
  // Constraint-only turns keep the activity contract, order, cuisines and discovery mode.
  if (intent.action === "refine") return { context: base };
  if ((!intent.stages.length && !intent.interests.length) || (intent.discovery && intent.stages.length > 1)) {
    return { context: base, issue: "ambiguous" };
  }
  if (intent.stages.length && intent.interests.length) return { context: base, issue: "unsupported" };
  // A semantic interpretation cannot erase an explicit mandatory activity recognized in this turn.
  // Prior activities may be replaced by a new request; prior hard filters cannot.
  const explicit = interpretRequest({ ...input, journeyStages: [], interests: [] });
  const temporal = /сначала|сперва|затем|потом|после|перед|\b(?:first|then|before|after)\b|алдымен|содан/iu.test(input.query);
  const order = temporal && intent.stages.length > 1 ? "ordered" : intent.order;
  for (const kind of ["cafe", "park", "restaurant"] as const) {
    if (intent.stages.filter((stage) => stage.kind === kind).length < explicit.journeyStages.filter((stage) => stage.kind === kind).length) {
      return { context: base, issue: "incomplete" };
    }
  }
  // Protect an explicit first/then sequence. Relative phrases such as "park after coffee"
  // deliberately remain the semantic model's job instead of using mention order.
  if (explicit.journeyStages.length > 1 && /сначала|затем|потом|first|then|алдымен|содан/iu.test(input.query)
    && !/после|перед|before|after/iu.test(input.query)) {
    let cursor = 0;
    for (const stage of intent.stages) if (stage.kind === explicit.journeyStages[cursor]?.kind) cursor++;
    if (order !== "ordered" || cursor !== explicit.journeyStages.length) return { context: base, issue: "incomplete" };
  }
  const stages = intent.stages.map((stage) => {
    if (stage.kind !== "restaurant") return stage;
    const inherited = input.journeyStages.filter((previous) => previous.kind === "restaurant").flatMap((previous) => previous.cuisines);
    const declared = requestedCuisines(input.query);
    return { ...stage, cuisines: [...new Set([...stage.cuisines, ...inherited, ...declared])] };
  });
  const context = searchRequestSchema.safeParse({ ...base, journeyStages: stages, journeyOrder: order,
    interests: intent.interests, searchMode: intent.discovery ? "discovery" : "plan" });
  if (!context.success) return { context: base, issue: "invalid" };
  return { context: context.data };
}
