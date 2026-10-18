/** Bounded Astana OSM staging only. Reviewing a preview does not merge it into the application corpus. */
import { resolve } from 'node:path';
import { constants } from 'node:fs';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import type { Poi } from '../../src/lib/types';
import { inAstanaBounds } from '../../src/lib/domain';
import { dataDir, loadPois, readJson, sha256, sourceRetryDelay, writeJson } from './common';
import { planImport, provenanceFor, stablePayloadDigest, validateImport } from './import-plan';
import { extensionAmenities, normalize, type OsmElement, type OsmResponse } from './normalize';
import { enrichPhotos } from './photos';

export const CITY_BOUNDS = '50.95,71.2,51.3,71.7';
export const CITY_LIMIT = 5000;
export const CITY_MAX_BYTES = 8 * 1024 * 1024;
export const cityQuery = `[out:json][timeout:60][maxsize:134217728];(
nwr["amenity"~"^(cafe|bench|library|theatre)$"](${CITY_BOUNDS});
nwr["leisure"~"^(park|garden|playground)$"](${CITY_BOUNDS});
nwr["tourism"~"^(museum|attraction|gallery|artwork)$"](${CITY_BOUNDS});
nwr["historic"~"^(monument|memorial)$"](${CITY_BOUNDS});
nwr["shop"="mall"](${CITY_BOUNDS});
);out body center ${CITY_LIMIT};out count;`;
export const cityExtensionQuery = `[out:json][timeout:60][maxsize:134217728];
nwr["amenity"~"^(${Object.keys(extensionAmenities).join('|')})$"](${CITY_BOUNDS});
out body center ${CITY_LIMIT};out count;`;

export async function boundedSourceJson(response: Response, maximumBytes = CITY_MAX_BYTES): Promise<unknown> {
  const size = Number(response.headers.get('Content-Length'));
  if (size > maximumBytes) { await response.body?.cancel(); throw new Error('SOURCE_RESPONSE_TOO_LARGE'); }
  if (!response.body) throw new Error('SOURCE_RESPONSE_EMPTY');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) { await reader.cancel(); throw new Error('SOURCE_RESPONSE_TOO_LARGE'); }
    chunks.push(value);
  }
  const content = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { content.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(content));
}

export function normalizeCity(elements: OsmElement[], fetchedAt: string) {
  const sourceElements = elements.filter(element => element.type !== 'count');
  const sourceName = (element: OsmElement) => element.tags?.['name:ru'] ?? element.tags?.name ?? element.tags?.['name:kk'] ?? element.tags?.['name:en'];
  const outdoorLabels: Record<string, string> = { park: 'Парк без названия', garden: 'Сад без названия', playground: 'Детская площадка без названия' };
  const excludedSourceObjects = sourceElements.flatMap(element => {
    const tags = element.tags ?? {};
    const reasons = [
      ...(['private', 'no'].includes(tags.access ?? '') ? [`access=${tags.access}`] : []),
      ...(tags.disused?.trim().toLowerCase() === 'yes' ? ['disused=yes'] : []),
      ...(tags.abandoned?.trim().toLowerCase() === 'yes' ? ['abandoned=yes'] : []),
      ...(tags.opening_hours?.trim().toLowerCase() === 'closed' ? ['opening_hours=closed'] : []),
    ];
    return reasons.length ? [{ id: `osm:${element.type}/${element.id}`, reasons }] : [];
  });
  const excludedAccessIds = excludedSourceObjects.filter(record => record.reasons.some(reason => reason.startsWith('access='))).map(record => record.id);
  const excludedIds = new Set(excludedSourceObjects.map(record => record.id));
  const eligible = sourceElements.filter(element => !excludedIds.has(`osm:${element.type}/${element.id}`));
  const normal = { pois: [] as Poi[], rejected: [] as string[], duplicates: [] as string[] };
  const normalIds = new Set<string>();
  for (const element of eligible.filter(element => element.tags?.amenity !== 'bench')) {
    // A city import must not merge distinct franchise branches on matching name/proximity alone.
    const suppliedName = sourceName(element);
    const label = Object.hasOwn(outdoorLabels, element.tags?.leisure ?? '') ? outdoorLabels[element.tags!.leisure] : undefined;
    const derivedName = !suppliedName && label ? `${label} (OSM ${element.type}/${element.id})` : undefined;
    // This derived display label never changes the retained raw source tags or provenance names.
    const normalizedElement = suppliedName || derivedName ? { ...element, tags: { ...element.tags, name: suppliedName ?? derivedName! } } : element;
    const one = normalize([normalizedElement], fetchedAt);
    normal.rejected.push(...one.rejected); normal.duplicates.push(...one.duplicates);
    for (const poi of one.pois) {
      if (normalIds.has(poi.id)) normal.duplicates.push(poi.id);
      else { normalIds.add(poi.id); normal.pois.push(poi); }
    }
  }
  const benches: Poi[] = [];
  const rejected = [...normal.rejected];
  const seen = new Set(normal.pois.map(poi => poi.id));
  for (const element of eligible.filter(element => element.tags?.amenity === 'bench')) {
    const id = `osm:${element.type}/${element.id}`;
    const location = { longitude: element.lon ?? element.center?.lon ?? NaN, latitude: element.lat ?? element.center?.lat ?? NaN };
    if (seen.has(id)) { normal.duplicates.push(id); continue; }
    if (!['node', 'way', 'relation'].includes(element.type) || !Number.isSafeInteger(element.id) || element.id <= 0 || !inAstanaBounds(location)
      || location.longitude < 71.2 || location.longitude > 71.7 || location.latitude < 50.9 || location.latitude > 51.3) { rejected.push(id); continue; }
    seen.add(id);
    const sourceUrl = `https://www.openstreetmap.org/${element.type}/${element.id}`;
    const tags = element.tags ?? {};
    const core = { id, name: sourceName(element) ?? `Скамейка (OSM ${element.type}/${element.id})`,
      description: 'Скамейка отмечена участниками OpenStreetMap. Это производное описание тега amenity=bench; состояние, доступность и удобство не проверены.',
      location, category: 'other' as const, features: { outlets: null, wheelchair: null, indoor: null, quiet: null }, hours: null,
      openingHours: null, address: [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(', ') || null, sourceUrl };
    benches.push({ ...core, evidence: [{ id: `${id}:category`, poiId: id, field: 'category', value: 'other', sourceUrl, fetchedAt, confirmedAt: null }],
      photos: [], fetchedAt, confirmedAt: null, contentHash: sha256(core) });
  }
  const schemaRejected: string[] = [];
  const pois = [...normal.pois, ...benches].filter(poi => {
    if (validateImport([poi]).length) { schemaRejected.push(poi.id); return false; }
    return true;
  }).sort((a, b) => a.id.localeCompare(b.id));
  return { pois, rejected, duplicates: normal.duplicates, schemaRejected,
    excludedAccessIds,
    excludedSourceObjects,
    skippedUnlabelledNonBench: eligible.filter(element => element.tags?.amenity !== 'bench' && !sourceName(element) && !Object.hasOwn(outdoorLabels, element.tags?.leisure ?? '')).length };
}

/** Extension sources may add stable IDs, but cannot revise an owner's existing payloads. */
export function appendOnlyCitySource(source: Poi[], current: Poi[]) {
  const existing = new Map(current.map(poi => [poi.id, poi]));
  return { incoming: source.filter(poi => !existing.has(poi.id)),
    existingSourceCount: source.filter(poi => existing.has(poi.id)).length,
    ignoredKnownUpdates: source.filter(poi => existing.has(poi.id) && stablePayloadDigest(poi) !== stablePayloadDigest(existing.get(poi.id)!)).map(poi => poi.id),
  };
}

export function cityResponseStatus(response: OsmResponse) {
  if (!Array.isArray(response.elements) || response.remark) throw new Error('INCOMPLETE_OVERPASS_RESPONSE');
  const count = response.elements.find(element => element.type === 'count');
  const total = Number(count?.tags?.total);
  const received = response.elements.filter(element => element.type !== 'count').length;
  const countValid = Boolean(count) && Number.isSafeInteger(total) && total >= 0;
  return { received, sourceTotal: countValid ? total : null, truncated: countValid && total > received,
    complete: countValid && total === received && received <= CITY_LIMIT };
}

async function fetchCity(endpoint: string, query = cityQuery): Promise<OsmResponse> {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['overpass-api.de', 'overpass.private.coffee', 'maps.mail.ru'].includes(url.hostname)) throw new Error('UNAPPROVED_OVERPASS_ENDPOINT');
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: Response;
    try {
      response = await fetch(endpoint, { method: 'POST', redirect: 'error',
        headers: { 'User-Agent': 'SpotLocalPrototype/0.1 (Astana bounded research import)', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(90_000) });
    } catch {
      if (attempt === 2) throw new Error('OVERPASS_NETWORK_UNAVAILABLE');
      await new Promise(resolve => setTimeout(resolve, 4000 * (2 ** attempt))); continue;
    }
    if (response.ok) return await boundedSourceJson(response) as OsmResponse;
    const delay = sourceRetryDelay(response.status, response.headers.get('Retry-After'), endpoint, attempt);
    await response.body?.cancel();
    if (delay === null || attempt === 2) throw new Error(`OVERPASS_HTTP_${response.status}`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  throw new Error('OVERPASS_UNAVAILABLE');
}

async function main() {
  const fromSnapshot = process.argv.includes('--from-snapshot');
  const dryRun = process.argv.includes('--dry-run');
  const applyReviewed = process.argv.includes('--apply-reviewed');
  const extension = process.argv.includes('--extension');
  if (applyReviewed && (!fromSnapshot || dryRun)) throw new Error('Reviewed merge requires --from-snapshot --apply-reviewed without --dry-run.');
  const suffix = extension ? 'astana-city-extension' : 'astana-city';
  const reportPrefix = extension ? 'city-extension' : 'city-import';
  const query = extension ? cityExtensionQuery : cityQuery;
  const rawPath = resolve(dataDir, `raw/overpass-${suffix}.json`);
  const endpoint = process.env.OVERPASS_URL ?? 'https://overpass-api.de/api/interpreter';
  const snapshot = fromSnapshot ? await readJson<{ fetchedAt: string; endpoint: string; response: OsmResponse }>(rawPath)
    : { fetchedAt: new Date().toISOString(), endpoint, response: await fetchCity(endpoint, query) };
  const status = cityResponseStatus(snapshot.response);
  const current = await loadPois();
  const result = normalizeCity(snapshot.response.elements, snapshot.fetchedAt);
  const enriched = await enrichPhotos(result.pois, true, false);
  const existing = new Map(current.map(poi => [poi.id, poi]));
  const sourcePois = enriched.map(poi => {
    const photos = [...(existing.get(poi.id)?.photos ?? []), ...poi.photos];
    const unique = new Map(photos.map(photo => [photo.sourceUrl, photo]));
    return { ...poi, photos: [...unique.values()].slice(0, 10) };
  });
  const appendOnly = appendOnlyCitySource(sourcePois, current);
  const incoming = extension ? appendOnly.incoming : sourcePois;
  const plan = planImport(incoming, current);
  const provenance = provenanceFor(snapshot.response.elements, incoming, snapshot.fetchedAt).map(record => ({ ...record,
    nameOrigin: record.tags.name || record.tags['name:ru'] || record.tags['name:kk'] || record.tags['name:en'] ? 'source_name'
      : record.tags.amenity === 'bench' ? 'derived_from_amenity_tag_and_stable_osm_id' : 'derived_from_leisure_tag_and_stable_osm_id' }));
  const preview = { checkedAt: new Date().toISOString(), mode: fromSnapshot ? 'real-source-snapshot' : 'public-source-http', dryRun,
    stageOnly: true, applicationDatasetChanged: false, databaseWrites: 0, embeddingRequests: 0, appendOnly: extension,
    source: 'OpenStreetMap/Overpass', endpoint: snapshot.endpoint, bounds: CITY_BOUNDS, fetchedAt: snapshot.fetchedAt,
    limits: { outputElements: CITY_LIMIT, responseBytes: CITY_MAX_BYTES, maximumAttempts: 3, concurrentRequests: 1 },
    ...status, accepted: incoming.length, ...plan.counts, totalAfterReviewedMerge: plan.pois.length,
    acceptedSourceRecords: sourcePois.length, existingSourceCount: appendOnly.existingSourceCount,
    ignoredKnownUpdates: extension ? appendOnly.ignoredKnownUpdates : [],
    categories: Object.fromEntries([...new Set(incoming.map(poi => poi.category))].map(category => [category, incoming.filter(poi => poi.category === category).length])),
    benches: incoming.filter(poi => poi.description.includes('amenity=bench')).length,
    coverage: plan.coverage, rejected: result.rejected, schemaRejected: result.schemaRejected, duplicates: result.duplicates,
    excludedAccessIds: result.excludedAccessIds,
    excludedSourceObjects: result.excludedSourceObjects,
    skippedUnlabelledNonBench: result.skippedUnlabelledNonBench,
    preservedExistingPhotos: plan.pois.filter(poi => existing.get(poi.id)?.photos.length).reduce((total, poi) => total + (existing.get(poi.id)?.photos.length ?? 0), 0),
    existingPayloadsPreservedExactly: current.every(poi => plan.pois.some(candidate => candidate.id === poi.id && (extension ? JSON.stringify(candidate) === JSON.stringify(poi) : stablePayloadDigest(candidate) === stablePayloadDigest(poi)))),
    currentDatasetDigest: sha256(current), proposedDatasetDigest: sha256(plan.pois),
    warnings: ['This is bounded OpenStreetMap coverage, not all places or all benches in Astana. Source mapping, hours, accessibility and current condition may be incomplete.',
      ...(status.complete ? [] : ['Source count is missing/mismatched or output was truncated. Do not merge this staged result.']),
      ...(result.skippedUnlabelledNonBench ? ['Unlabelled indoor/attraction objects are counted but not turned into invented named venues.'] : []),
      'Unnamed parks, gardens, playgrounds and benches use explicitly derived OSM labels; their condition and public accessibility are not guaranteed. Objects explicitly marked access=private/no, disused=yes, abandoned=yes or opening_hours=closed are excluded. Unknown access is not evidence of public access.'],
    outputs: { raw: `data/raw/overpass-${suffix}.json`, incoming: `data/staging/${suffix}-pois.json`, provenance: `data/staging/${suffix}-provenance.json`, preview: `data/reports/${reportPrefix}-preview.json` },
  };
  if (!dryRun) {
    if (!fromSnapshot) await writeJson(rawPath, { ...snapshot, bounds: CITY_BOUNDS, query });
    await writeJson(resolve(dataDir, `staging/${suffix}-pois.json`), incoming);
    await writeJson(resolve(dataDir, `staging/${suffix}-provenance.json`), { schemaVersion: '1', records: provenance });
    await writeJson(resolve(dataDir, `reports/${reportPrefix}-preview.json`), preview);
  }
  if (applyReviewed) {
    if (!status.complete || result.schemaRejected.length || plan.counts.updated || (!extension && current.some(poi => !incoming.some(candidate => candidate.id === poi.id
      && stablePayloadDigest(candidate) === stablePayloadDigest(poi))))) throw new Error('REVIEWED_MERGE_BLOCKED: source must be complete and preserve every existing payload/photo.');
    const finalPois = plan.pois.map(poi => existing.get(poi.id) ?? poi);
    if (validateImport(finalPois).length) throw new Error('REVIEWED_MERGE_INVALID_SCHEMA');
    const backupName = extension ? 'pois-before-city-extension.json' : 'pois.json';
    const backupPath = resolve('work/baseline-20261018/original/data', backupName);
    const manifestPath = resolve('work/baseline-20261018/original/data', `${reportPrefix}-merge-manifest.json`);
    await mkdir(resolve(backupPath, '..'), { recursive: true });
    try { await copyFile(resolve(dataDir, 'pois.json'), backupPath, constants.COPYFILE_EXCL); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    const backup = await readJson<Poi[]>(backupPath);
    if (backup.some(poi => !finalPois.some(candidate => candidate.id === poi.id && JSON.stringify(candidate) === JSON.stringify(poi)))) throw new Error('BASELINE_BACKUP_MISMATCH: existing source records were modified; review required.');
    const manifest = { savedAt: new Date().toISOString(), originalRecords: backup.length,
      originalPhotos: backup.reduce((total, poi) => total + poi.photos.length, 0),
      originalFileSha256: sha256(await readFile(backupPath, 'utf8')), source: `data/raw/overpass-${suffix}.json`,
      received: status.received, sourceTotal: status.sourceTotal, sourceComplete: status.complete, inserted: plan.counts.inserted,
      finalRecords: finalPois.length, finalPhotos: finalPois.reduce((total, poi) => total + poi.photos.length, 0),
      originalRecordsPreservedExactly: true, databaseWrites: 0, embeddingRequests: 0 };
    await writeJson(manifestPath, manifest);
    const previousProvenance = await readJson<{ records: { id: string }[] }>(resolve(dataDir, 'provenance.json'));
    const provenanceRecords = new Map(previousProvenance.records.map(record => [record.id, record]));
    for (const record of provenance) provenanceRecords.set(record.id, record);
    await writeJson(resolve(dataDir, 'provenance.json'), { schemaVersion: '1', source: 'OpenStreetMap', records: [...provenanceRecords.values()].sort((a, b) => a.id.localeCompare(b.id)) });
    await writeJson(resolve(dataDir, 'pois.json'), finalPois);
    const merge = { ...manifest, checkedAt: new Date().toISOString(), mode: 'reviewed-real-source-snapshot-merge',
      datasetSha256: sha256(await readFile(resolve(dataDir, 'pois.json'), 'utf8')),
      categories: Object.fromEntries([...new Set(finalPois.map(poi => poi.category))].map(category => [category, finalPois.filter(poi => poi.category === category).length])),
      benches: finalPois.filter(poi => poi.description.includes('amenity=bench')).length,
      coverage: planImport(finalPois, finalPois).coverage, warnings: preview.warnings, backupPath: `work/baseline-20261018/original/data/${backupName}` };
    await writeJson(resolve(dataDir, `reports/${reportPrefix}-merge.json`), merge);
    console.log(JSON.stringify(merge, null, 2)); return;
  }
  console.log(JSON.stringify(preview, null, 2));
  if (!status.complete) process.exitCode = 1;
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/collect-city.ts')) main().catch(error => {
  console.error(error instanceof Error ? error.message : 'City staging failed. Existing application data was not changed.'); process.exitCode = 1;
});
