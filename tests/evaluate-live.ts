/** Actual HTTP → embedding → Supabase hybrid RPC → model → route integration; no mocks. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { parsePoi, type Poi, type SearchResponse } from "../src/lib/types";

const reportPath = path.join(process.cwd(), "data", "reports", "live-rag-evaluation.json");
const base = new URL(process.env.SPOT_BASE_URL || "http://127.0.0.1:3000");
if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) || !["http:", "https:"].includes(base.protocol)
  || base.username || base.password) throw new Error("SPOT_BASE_URL must be the local Spot app URL.");

type Case = { id: string; query: string; originId: string; minutes: number; returnToStart: boolean; expectedEmpty: boolean };
const cases: Case[] = [
  { id: "mega_45_return", query: "Я возле Mega Silk Way, есть 45 минут, хочу прогуляться и вернуться", originId: "osm:way/499328514", minutes: 45, returnToStart: true, expectedEmpty: false },
  { id: "child_60_botanical", query: "Я с ребёнком, есть час, хочу что-нибудь интересное неподалёку", originId: "osm:way/1196402246", minutes: 60, returnToStart: false, expectedEmpty: false },
  { id: "mandatory_outlets", query: "Хочу кофе в тихом месте рядом, розетка обязательна", originId: "osm:way/1196402246", minutes: 60, returnToStart: false, expectedEmpty: true },
];
type CaseResult = {
  id: string; query: string; publicOriginId: string; status: "passed" | "failed"; latencyMs: number;
  mode?: string; retrieval?: string; generation?: string; returnedPoiIds?: string[];
  planStatus?: string; totalMinutes?: number | null; checks: Record<string, boolean>; error?: string;
};

async function main() {
  const raw: unknown = JSON.parse(await readFile(path.join(process.cwd(), "data", "pois.json"), "utf8"));
  if (!Array.isArray(raw)) throw new Error("Collected POI corpus is missing or invalid.");
  const corpus = new Map<string, Poi>();
  for (const item of raw) { const parsed = parsePoi(item); if (parsed.success) corpus.set(parsed.data.id, parsed.data); }
  if (corpus.size !== raw.length) throw new Error("Every collected POI must validate before evaluating live output.");
  const startedAt = new Date().toISOString();
  const results: CaseResult[] = [];
  const save = async (finished: boolean) => {
    await mkdir(path.dirname(reportPath), { recursive: true });
    const latencies = results.map((result) => result.latencyMs).sort((a, b) => a - b);
    const report = { startedAt, finishedAt: finished ? new Date().toISOString() : null,
      status: !finished ? "running" : results.every((result) => result.status === "passed") ? "passed" : "failed",
      endpoint: base.origin, corpusSize: corpus.size, plannedQueries: cases.length, completedQueries: results.length,
      passedQueries: results.filter((result) => result.status === "passed").length,
      methodology: "Sequential actual HTTP requests to local Spot with browser Origin header, using public OSM presets. No model/database/routing mocks. Nonempty cases require live Supabase hybrid + validated Ollama output + actual pedestrian plan within budget. The empty mandatory-outlet case requires hybrid retrieval and preserved hard constraints; generation is correctly skipped. Grounded identities/evidence and content hashes are checked against the collected corpus. This is an integration acceptance sample, not an independent human usefulness study.",
      p50Ms: latencies.length ? latencies[Math.floor(latencies.length * 0.5)] : null,
      p95Ms: latencies.length ? latencies[Math.ceil(latencies.length * 0.95) - 1] : null,
      results,
    };
    await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  };
  await save(false);
  for (const test of cases) {
    const started = performance.now();
    const result: CaseResult = { id: test.id, query: test.query, publicOriginId: test.originId, status: "failed", latencyMs: 0, checks: {} };
    try {
      const origin = corpus.get(test.originId);
      if (!origin) throw new Error(`Public origin ${test.originId} is not in the verified corpus.`);
      const response = await fetch(new URL("/api/search", base), { method: "POST", headers: { "Content-Type": "application/json", Origin: base.origin },
        body: JSON.stringify({ query: test.query, origin: origin.location, availableMinutes: test.minutes, returnToStart: test.returnToStart }),
        signal: AbortSignal.timeout(180_000),
      });
      result.checks.httpSucceeded = response.ok;
      if (!response.ok) throw new Error(`HTTP ${response.status}; inspect the local app without exposing credentials.`);
      const data = await response.json() as SearchResponse;
      if (!Array.isArray(data.items) || !data.diagnostics || !data.context || !data.plan) throw new Error("Unexpected API contract.");
      result.mode = data.mode; result.retrieval = data.diagnostics.retrieval; result.generation = data.diagnostics.generation;
      result.returnedPoiIds = data.items.map((poi) => poi.id); result.planStatus = data.plan.status; result.totalMinutes = data.plan.totalMinutes;
      result.checks.realHybridRetrieval = data.diagnostics.retrieval === "supabase-hybrid";
      result.checks.timeAndReturnPreserved = data.context.availableMinutes === test.minutes && data.context.returnToStart === test.returnToStart;
      result.checks.uniquePoiIds = new Set(result.returnedPoiIds).size === data.items.length;
      result.checks.knownGroundedFacts = data.items.every((poi) => {
        const source = corpus.get(poi.id);
        return source !== undefined && source.name === poi.name && source.category === poi.category && source.contentHash === poi.contentHash
          && source.location.longitude === poi.location.longitude && source.location.latitude === poi.location.latitude
          && Object.entries(source.features).every(([field, value]) => poi.features[field as keyof typeof poi.features] === value)
          && poi.evidence.every((evidence) => source.evidence.some((original) => original.id === evidence.id && original.poiId === evidence.poiId
            && original.field === evidence.field && original.value === evidence.value))
          && poi.evidenceIds.length > 0 && poi.evidenceIds.every((id) => source.evidence.some((evidence) => evidence.id === id && evidence.poiId === poi.id));
      });
      result.checks.hardConstraintsPreserved = data.items.every((poi) => data.context.requiredFeatures.every((feature) => poi.features[feature] === true
        && poi.evidence.some((evidence) => evidence.poiId === poi.id && evidence.field === feature && evidence.value === true))
        && !data.context.excludedPoiIds.includes(poi.id) && !data.context.excludedCategories.includes(poi.category)
        && (!data.context.confirmedOpen || poi.openingStatus === "open"));
      if (test.expectedEmpty) {
        result.checks.emptyWithoutRelaxingOutlets = data.items.length === 0 && data.context.requiredFeatures.includes("outlets");
        result.checks.noInventedEmptyRoute = data.plan.legs.length === 0;
      } else {
        result.checks.actualValidatedGeneration = data.mode === "live" && data.diagnostics.generation === "ollama-validated";
        result.checks.oneToThreePlaces = data.items.length >= 1 && data.items.length <= 3;
        const expectedIds = ["start", ...data.items.map((poi) => poi.id), ...(test.returnToStart ? ["start"] : [])];
        result.checks.actualPedestrianLegs = data.plan.legs.length === expectedIds.length - 1
          && data.plan.legs.every((leg, index) => leg.fromId === expectedIds[index] && leg.toId === expectedIds[index + 1]
            && leg.profile === "walking" && leg.provider.length > 0 && Number.isFinite(leg.seconds) && leg.seconds >= 0
            && leg.geometry?.type === "LineString" && leg.geometry.coordinates.length >= 2);
        const visitMinutes = data.items.reduce((sum, poi) => sum + poi.visitMinutes, 0);
        const travelMinutes = Math.ceil(data.plan.legs.reduce((sum, leg) => sum + leg.seconds, 0) / 60);
        result.checks.completeBudget = data.plan.status === "fits_estimate" && data.plan.travelMinutes === travelMinutes
          && data.plan.visitMinutes === visitMinutes && data.plan.reserveMinutes >= 0
          && data.plan.totalMinutes === visitMinutes + travelMinutes + data.plan.reserveMinutes && data.plan.totalMinutes <= test.minutes;
      }
      result.status = Object.values(result.checks).every(Boolean) ? "passed" : "failed";
    } catch (error) { result.error = error instanceof Error ? error.message.slice(0, 300) : "Integration request failed."; }
    result.latencyMs = Math.round(performance.now() - started);
    results.push(result); await save(false);
    console.log(`${result.id}: ${result.status} (${result.latencyMs} ms); ${Object.entries(result.checks).filter(([, passed]) => !passed).map(([name]) => name).join(", ") || result.error || "all checks passed"}`);
  }
  await save(true);
  const passed = results.filter((result) => result.status === "passed").length;
  console.log(`Live acceptance: ${passed}/${cases.length}. Report: data/reports/live-rag-evaluation.json`);
  if (passed !== cases.length) process.exitCode = 1;
}
void main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Live evaluation failed."); process.exitCode = 1; });
