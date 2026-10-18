import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { searchPlaces } from '../../src/lib/search';
import { searchRequestSchema, type Poi, type SearchResponse } from '../../src/lib/types';

type Scenario = { id: string; purpose: string; request: Record<string, unknown>; expectedKind: string; expectedItems: 'none' | 'one_to_three'; expectedCategories?: string[]; expectedClarificationCode?: string };
type Dataset = { version: string; source: string; clock: string; cases: Scenario[] };
const command = process.argv[2];
const directory = process.env.SPOT_VERIFICATION_DIR;
if (!['smoke', 'eval'].includes(command) || !directory) throw new Error('Use scripts/harness/runner.mjs smoke|eval');
if (process.env.APP_MODE !== 'demo' || process.env.ALLOW_LIVE_API !== 'false') throw new Error('OFFLINE_MODE_REQUIRED');

let networkAttempts = 0;
// A real demo implementation must avoid network, rather than silently succeeding after a rejected request.
globalThis.fetch = async () => { networkAttempts += 1; throw new Error('OFFLINE_NETWORK_FORBIDDEN'); };
let knownIds = new Set<string>();
let dataDigest = '';

function inspect(result: SearchResponse) {
  assert.ok(['recommendations', 'clarification', 'no_match', 'degraded', 'error'].includes(result.kind), 'response kind');
  assert.equal(result.mode, 'demo', 'explicit offline mode');
  assert.equal(result.provenance.dataSource, 'real_snapshot', 'actual snapshot provenance');
  assert.ok(result.items.length <= 3, 'one to three alternatives maximum');
  for (const poi of result.items) {
    assert.ok(knownIds.has(poi.id), 'selected ID belongs to the actual snapshot');
    assert.ok(poi.sourceUrl.startsWith('https://'), 'source URL present');
    assert.ok(poi.evidenceIds.length > 0, 'evidence IDs present');
    assert.ok(poi.evidenceIds.every(id => poi.evidence.some(evidence => evidence.id === id && evidence.poiId === poi.id)), 'evidence IDs belong to this POI');
    for (const feature of result.context.requiredFeatures) {
      assert.equal(poi.features[feature], true, 'mandatory feature must be known true');
      assert.ok(poi.evidence.some(evidence => evidence.field === feature && evidence.value === true), 'mandatory feature must have evidence');
    }
    assert.ok(!result.context.excludedCategories.includes(poi.category), 'excluded category');
    assert.ok(!result.context.excludedPoiIds.includes(poi.id), 'excluded POI');
    if (result.context.confirmedOpen) assert.equal(poi.openingStatus, 'open', 'confirmed open across visit');
  }
  assert.deepEqual(result.plan.legs, [], 'offline demo never invents a verified route');
  assert.equal(result.plan.travelMinutes, null, 'offline demo does not invent walking minutes');
  assert.equal(networkAttempts, 0, 'offline implementation made no network attempts');
}

async function evaluate() {
  const results = [];
  for (const set of ['development', 'acceptance']) {
    const source = await readFile(`tests/eval/${set}.json`, 'utf8');
    const dataset = JSON.parse(source) as Dataset;
    for (const scenario of dataset.cases) {
      const began = performance.now();
      try {
        const request = searchRequestSchema.parse({ ...scenario.request, startTime: scenario.request.startTime ?? dataset.clock });
        const result = await searchPlaces(request, new AbortController().signal);
        inspect(result);
        assert.equal(result.kind, scenario.expectedKind, 'expected result kind');
        if (scenario.expectedItems === 'none') assert.equal(result.items.length, 0, 'expected no recommendations');
        else assert.ok(result.items.length >= 1 && result.items.length <= 3, 'expected one to three recommendations');
        if (scenario.expectedCategories) assert.ok(result.items.every(poi => scenario.expectedCategories!.includes(poi.category)), 'expected category relevance');
        if (scenario.expectedClarificationCode) assert.equal(result.clarification?.code, scenario.expectedClarificationCode, 'expected clarification');
        assert.equal(result.context.language, request.language, 'requested response language preserved');
        results.push({ id: scenario.id, set, version: dataset.version, status: 'passed', kind: result.kind,
          source: result.provenance.dataSource, retrieval: result.provenance.retrieval, generation: result.provenance.generation,
          poiIds: result.items.map(poi => poi.id), sourceUrls: result.items.map(poi => poi.sourceUrl),
          language: result.context.language, scenarioClock: request.startTime, elapsedMs: Math.round(performance.now() - began) });
      } catch (error) {
        results.push({ id: scenario.id, set, version: dataset.version, status: 'failed', reason: error instanceof Error ? error.message.split('\n')[0] : 'Evaluation failed' });
      }
    }
  }
  const report = { version: 'spot-offline-eval-v1', mode: 'demo', dataDigest, scenarioTime: 'Frozen per fixture; not current opening verification',
    source: 'Actual collected POI snapshot; synthetic development and separate acceptance requests',
    methodology: 'Deterministic assertions for result kind, known IDs, evidence membership, hard constraints, category relevance and honest route state. No LLM judge.',
    limitations: ['No live model/database/routing verification', 'No independent human usefulness score', 'Not Recall@K: no exhaustive relevance ground truth', 'Small synthetic multilingual sample is not full linguistic acceptance'],
    networkAttempts, paidRequests: 0, total: results.length, passed: results.filter(result => result.status === 'passed').length,
    failed: results.filter(result => result.status === 'failed').length, results };
  await writeFile(resolve(directory!, 'evaluation.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (report.failed || networkAttempts) process.exitCode = 1;
}

async function smoke() {
  const initial = new Request('http://127.0.0.1/api/search', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: 'Я возле Mega Silk Way, есть 45 минут, хочу прогуляться и вернуться',
      origin: { longitude: 71.4073303, latitude: 51.0890897 }, availableMinutes: 45, returnToStart: true, startTime: '2026-10-18T07:00:00Z', language: 'ru' }) });
  const request = searchRequestSchema.parse(await initial.json());
  const result = await searchPlaces(request, initial.signal);
  inspect(result);
  assert.equal(result.kind, 'recommendations');
  assert.ok(result.items.length > 0);
  const followupRequest = searchRequestSchema.parse({ ...result.context, query: 'А теперь только в помещении', requiredFeatures: ['indoor'] });
  const followup = await searchPlaces(followupRequest, initial.signal);
  inspect(followup);
  assert.equal(followup.context.availableMinutes, 45, 'follow-up preserves available time');
  assert.deepEqual(followup.context.origin, request.origin, 'follow-up preserves the chosen starting point');
  assert.equal(followup.context.returnToStart, true, 'follow-up preserves return condition');
  const strict = await searchPlaces(searchRequestSchema.parse({ ...followup.context, query: 'Розетка обязательна', requiredFeatures: ['outlets'] }), initial.signal);
  inspect(strict);
  assert.equal(strict.kind, 'no_match');
  assert.equal(strict.items.length, 0);
  const report = { version: 'spot-offline-smoke-v1', status: 'passed', mode: 'demo', dataDigest, networkAttempts, paidRequests: 0,
    scope: 'Actual search pipeline via parsed Request and AbortSignal; UI/browser and live endpoints are separate checks',
    steps: [{ action: 'initial walking request', kind: result.kind, poiIds: result.items.map(poi => poi.id) },
      { action: 'indoor follow-up preserves context', kind: followup.kind, poiIds: followup.items.map(poi => poi.id) },
      { action: 'unknown mandatory outlets', kind: strict.kind, poiIds: strict.items.map(poi => poi.id) }] };
  await writeFile(resolve(directory!, 'smoke.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}

async function main() {
  const rawSnapshot = await readFile('data/pois.json', 'utf8');
  const snapshot = JSON.parse(rawSnapshot) as Poi[];
  knownIds = new Set(snapshot.map(poi => poi.id));
  dataDigest = createHash('sha256').update(rawSnapshot).digest('hex');
  if (command === 'eval') await evaluate(); else await smoke();
}
void main().catch(error => { console.error(error instanceof Error ? error.message : 'Offline check failed'); process.exitCode = 1; });
