import { parsePoi, type Poi } from '../../src/lib/types';
import { documentFor, sha256, validatePois } from './common';
import type { OsmElement } from './normalize';

/** Fetch times describe ingestion, not a change to the source facts or the embedding document. */
export function stablePayloadDigest(poi: Poi): string {
  const { fetchedAt: _fetchedAt, evidence, ...record } = poi;
  void _fetchedAt;
  return sha256({ ...record, evidence: evidence.map(({ fetchedAt: _time, ...fact }) => { void _time; return fact; }) });
}

export function validateImport(pois: Poi[]): string[] {
  const errors = validatePois(pois);
  for (const poi of pois) {
    if (!parsePoi(poi).success) errors.push(`POI schema invalid: ${poi.id}`);
    if (!/^osm:(?:node|way|relation)\/\d+$/.test(poi.id)
      || poi.sourceUrl !== `https://www.openstreetmap.org/${poi.id.slice(4)}`) errors.push(`OSM source identity invalid: ${poi.id}`);
  }
  return errors;
}

/** Absence from a small/partial response is never a deletion instruction. */
export function planImport(incoming: Poi[], existing: Poi[]) {
  const errors = validateImport(incoming);
  if (errors.length) throw new Error(errors.join('\n'));
  const previous = new Map(existing.map(poi => [poi.id, poi]));
  const result = new Map(previous);
  const counts = { inserted: 0, updated: 0, unchanged: 0, retainedAbsent: 0, deleted: 0 };
  const changedIds: string[] = [];
  for (const poi of incoming) {
    const old = previous.get(poi.id);
    if (!old) { counts.inserted++; changedIds.push(poi.id); }
    else if (stablePayloadDigest(old) === stablePayloadDigest(poi)) counts.unchanged++;
    else { counts.updated++; changedIds.push(poi.id); }
    result.set(poi.id, poi);
  }
  const receivedIds = new Set(incoming.map(poi => poi.id));
  const retainedIds = [...previous.keys()].filter(id => !receivedIds.has(id));
  counts.retainedAbsent = retainedIds.length;
  const pois = [...result.values()].sort((a, b) => a.id.localeCompare(b.id));
  return { pois, counts, changedIds, retainedIds,
    inputDigest: sha256(incoming.map(poi => ({ id: poi.id, digest: stablePayloadDigest(poi) }))),
    outputDigest: sha256(pois.map(poi => ({ id: poi.id, digest: stablePayloadDigest(poi) }))),
    coverage: { accepted: incoming.length, withOpeningHours: incoming.filter(poi => poi.openingHours !== null).length,
      withAddress: incoming.filter(poi => poi.address !== null).length, withPhotos: incoming.filter(poi => poi.photos.length > 0).length,
      confirmedOutlets: incoming.filter(poi => poi.features.outlets === true).length,
      unknownOutlets: incoming.filter(poi => poi.features.outlets === null).length,
      independentlyConfirmed: incoming.filter(poi => poi.confirmedAt !== null).length },
  };
}

export function provenanceFor(elements: OsmElement[], pois: Poi[], fetchedAt: string) {
  const byId = new Map(elements.map(element => [`osm:${element.type}/${element.id}`, element]));
  return pois.flatMap(poi => {
    const source = byId.get(poi.id);
    if (!source) return [];
    const entries = Object.entries(source.tags ?? {}).sort(([a], [b]) => a.localeCompare(b));
    const tags = Object.fromEntries(entries.slice(0, 128).map(([key, value]) => [key.slice(0, 200), value.normalize('NFKC').trim().slice(0, 2048)]));
    const names = Object.fromEntries(entries.filter(([key]) => key === 'name' || /^name:(?:ru|kk|en)$/.test(key)).map(([key, value]) => [key, value]));
    const aliases = [...new Set(entries.filter(([key]) => /^(?:alt_name|official_name|short_name)(?::(?:ru|kk|en))?$/.test(key))
      .flatMap(([, value]) => value.split(';').map(part => part.trim()).filter(Boolean)))].slice(0, 32);
    return [{ id: poi.id, source: 'OpenStreetMap', sourceId: `${source.type}/${source.id}`, sourceUrl: poi.sourceUrl,
      attribution: '© OpenStreetMap contributors', license: 'ODbL 1.0', licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
      fetchedAt, sourceUpdatedAt: source.timestamp ?? null, independentlyConfirmedAt: poi.confirmedAt,
      location: poi.location, coordinateMethod: source.lat !== undefined && source.lon !== undefined ? 'source_point' : 'source_object_center',
      names, aliases, tags, contentHash: poi.contentHash, documentHash: sha256(documentFor(poi)),
      descriptionOrigin: 'derived_from_source_tags',
      quality: { tagsTruncated: entries.length > 128 || entries.some(([key, value]) => key.length > 200 || value.length > 2048),
        sourceUpdateTimeKnown: Boolean(source.timestamp), independentlyConfirmed: poi.confirmedAt !== null },
    }];
  });
}
