/** Audit metadata from the existing permitted source snapshot; no network or database calls. */
import { resolve } from 'node:path';
import { dataDir, loadPois, readJson, writeJson } from './common';
import { provenanceFor } from './import-plan';
import type { OsmResponse } from './normalize';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const pois = await loadPois();
  const snapshot = await readJson<{ fetchedAt: string; responses: OsmResponse[] }>(resolve(dataDir, 'raw/overpass.json'));
  if (!Array.isArray(snapshot.responses) || snapshot.responses.some(response => !Array.isArray(response.elements) || response.remark)) throw new Error('Incomplete source snapshot; provenance file retained.');
  const records = provenanceFor(snapshot.responses.flatMap(response => response.elements), pois, snapshot.fetchedAt);
  const result = { schemaVersion: '1', source: 'OpenStreetMap', records };
  if (!dryRun) await writeJson(resolve(dataDir, 'provenance.json'), result);
  console.log(JSON.stringify({ dryRun, source: 'existing-real-source-snapshot', records: records.length,
    missingSourceRecords: pois.filter(poi => !records.some(record => record.id === poi.id)).length,
    sourceUpdateTimesKnown: records.filter(record => record.sourceUpdatedAt !== null).length,
    independentlyConfirmed: records.filter(record => record.independentlyConfirmedAt !== null).length,
    poiPayloadsChanged: 0, embeddingRequests: 0, databaseWrites: 0, networkRequests: 0,
    output: dryRun ? null : 'data/provenance.json' }, null, 2));
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Provenance audit failed'); process.exitCode = 1; });
