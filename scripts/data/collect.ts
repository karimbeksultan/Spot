import { resolve } from 'node:path';
import { dataDir, fetchJson, readJson, writeJson } from './common';
import { normalize, type OsmResponse, type OsmElement } from './normalize';
import { enrichPhotos } from './photos';
import { planImport, provenanceFor } from './import-plan';
import type { Poi } from '../../src/lib/types';

const zones = [
  { id: 'expo', bounds: '51.080,71.395,51.101,71.427' },
  { id: 'botanical', bounds: '51.099,71.405,51.117,71.435' },
  { id: 'central', bounds: '51.119,71.403,51.139,71.443' },
];
async function main() {
  const fromSnapshot = process.argv.includes('--from-snapshot');
  const dryRun = process.argv.includes('--dry-run');
  const endpoint = process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter';
  const target = new URL(endpoint);
  if (!fromSnapshot && (target.protocol !== 'https:' || target.username || target.password || target.search || target.hash
    || !['overpass-api.de', 'overpass.private.coffee', 'maps.mail.ru'].includes(target.hostname))) throw new Error('Use a documented HTTPS public Overpass endpoint from docs/data-sources.md.');
  const existing = await readJson<Poi[]>(resolve(dataDir, 'pois.json')).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return []; throw error;
  });
  const fetchedAt = new Date().toISOString(); const elements: OsmElement[] = []; const sources: unknown[] = [];
  let sourceFetchedAt = fetchedAt;
  let responses: OsmResponse[] = [];
  if (fromSnapshot) {
    const snapshot = await readJson<{ fetchedAt: string; responses: OsmResponse[] }>(resolve(dataDir,'raw/overpass.json'));
    if (!Array.isArray(snapshot.responses) || snapshot.responses.some(response => !Array.isArray(response.elements) || response.remark)) throw new Error('Incomplete source snapshot.');
    elements.push(...snapshot.responses.flatMap(r=>r.elements)); sources.push({ replay: true, fetchedAt: snapshot.fetchedAt });
    sourceFetchedAt = snapshot.fetchedAt;
    responses = snapshot.responses;
  } else for (const zone of zones) {
    const query = `[out:json][timeout:30];(nwr["name"]["amenity"~"^(cafe|library|theatre)$"](${zone.bounds});nwr["name"]["tourism"~"^(museum|attraction|gallery|artwork)$"](${zone.bounds});nwr["name"]["leisure"~"^(park|playground|garden)$"](${zone.bounds});nwr["name"]["historic"~"^(monument|memorial)$"](${zone.bounds});nwr["name"]["shop"="mall"](${zone.bounds}););out center tags;`;
    if (!dryRun) console.log(`Collecting ${zone.id} (one request; retries use backoff)...`);
    const response = await fetchJson<OsmResponse>(`${endpoint}?${new URLSearchParams({data:query})}`, {}, 65_000);
    if (!Array.isArray(response.elements) || response.remark) throw new Error(`Incomplete Overpass response for ${zone.id}; old snapshot retained.`);
    responses.push(response); elements.push(...response.elements); sources.push({zone,endpoint,query,count:response.elements.length});
  }
  const result = normalize(elements, sourceFetchedAt);
  // Dry-run validates reviewed cached metadata without HTTP photo calls or hidden report writes.
  const enriched = await enrichPhotos(result.pois, fromSnapshot || dryRun, !dryRun);
  const plan = planImport(enriched, existing);
  const report = { checkedAt: fetchedAt, dryRun, mode: fromSnapshot ? 'real-source-snapshot' : 'public-source-http',
    sourceFetchedAt, received: elements.length, count: plan.pois.length, accepted: enriched.length,
    rejected: result.rejected, duplicates: result.duplicates, ...plan.counts,
    changedIds: plan.changedIds, retainedIds: plan.retainedIds, coverage: plan.coverage,
    inputDigest: plan.inputDigest, outputDigest: plan.outputDigest, sources,
    warnings: plan.retainedIds.length ? ['Absent records retained; their previous source timestamps must not be interpreted as freshly checked.'] : [],
    embeddings: 'No embeddings generated or changed by collection; model/dimensions/version/hash are checked separately.',
  };
  if (dryRun) { console.log(JSON.stringify(report, null, 2)); return; }
  const previousProvenance = await readJson<{ records: { id: string }[] }>(resolve(dataDir, 'provenance.json')).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return { records: [] }; throw error;
  });
  const provenance = new Map(previousProvenance.records.map(record => [record.id, record]));
  for (const record of provenanceFor(elements, enriched, sourceFetchedAt)) provenance.set(record.id, record);
  // Persist POIs only after all source responses and the entire normalized payload have passed validation.
  if (!fromSnapshot) await writeJson(resolve(dataDir,'raw/overpass.json'),{ fetchedAt, sources, responses });
  await writeJson(resolve(dataDir,'pois.json'),plan.pois);
  await writeJson(resolve(dataDir, 'provenance.json'), { schemaVersion: '1', source: 'OpenStreetMap',
    records: [...provenance.values()].sort((a, b) => a.id.localeCompare(b.id)) });
  await writeJson(resolve(dataDir,'reports/collection.json'),report);
  console.log(JSON.stringify({ ...plan.counts, count: plan.pois.length, mode: report.mode, report: 'data/reports/collection.json' }, null, 2));
}
main().catch(()=>{ console.error('Collection failed. No records are deleted. Check source/schema/disk availability; use --from-snapshot --dry-run to validate the retained snapshot safely.'); process.exitCode=1; });
