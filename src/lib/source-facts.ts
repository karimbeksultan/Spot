import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Evidence, Poi } from './types';

type SourceRecord = { id: string; contentHash: string; sourceUrl: string; fetchedAt: string;
  independentlyConfirmedAt: string | null; tags: Record<string, unknown> };
const venueTypes = new Set(['restaurant', 'cafe', 'fast_food', 'food_court', 'ice_cream', 'bar', 'pub',
  'cinema', 'arts_centre', 'community_centre', 'fountain', 'marketplace', 'bench']);
const cuisineToken = /^[a-z][a-z0-9_-]{0,39}$/;
const aliases: Record<string, readonly string[]> = { italian_pizza: ['italian', 'pizza'] };
let sourceRecords: Promise<Map<string, SourceRecord>> | undefined;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value));
}
function canonicalUrl(id: string): string | null {
  return /^osm:(node|way|relation)\/[1-9]\d*$/.test(id) ? `https://www.openstreetmap.org/${id.slice(4)}` : null;
}
async function provenance(): Promise<Map<string, SourceRecord>> {
  sourceRecords ??= readFile(path.join(process.cwd(), 'data', 'provenance.json'), 'utf8').then((text) => {
    const result = new Map<string, SourceRecord>();
    if (Buffer.byteLength(text, 'utf8') > 12 * 1024 * 1024) return result;
    const document = record(JSON.parse(text));
    if (document?.schemaVersion !== '1' || document.source !== 'OpenStreetMap'
      || !Array.isArray(document.records) || document.records.length > 5000) return result;
    const seen = new Set<string>();
    for (const value of document.records) {
      const item = record(value);
      if (!item || typeof item.id !== 'string') continue;
      // An ambiguous source identity never wins by array order.
      if (seen.has(item.id)) { result.delete(item.id); continue; }
      seen.add(item.id);
      const tags = record(item.tags);
      if (item.source !== 'OpenStreetMap' || item.sourceUrl !== canonicalUrl(item.id)
        || typeof item.contentHash !== 'string' || !/^[a-f0-9]{64}$/i.test(item.contentHash)
        || !validDate(item.fetchedAt) || !tags) continue;
      const confirmed = validDate(item.independentlyConfirmedAt)
        && Date.parse(item.independentlyConfirmedAt) <= Date.parse(item.fetchedAt) ? item.independentlyConfirmedAt : null;
      result.set(item.id, { id: item.id, contentHash: item.contentHash, sourceUrl: item.sourceUrl as string,
        fetchedAt: item.fetchedAt, independentlyConfirmedAt: confirmed, tags });
    }
    return result;
  }).catch(() => new Map<string, SourceRecord>());
  return sourceRecords;
}
function cuisinesFrom(raw: unknown): string[] {
  if (typeof raw !== 'string' || raw.length > 1000) return [];
  const tokens = [...new Set(raw.split(';').map((value) => value.trim().toLowerCase()).filter(Boolean))];
  if (tokens.length > 32 || tokens.some((value) => !cuisineToken.test(value))) return [];
  const canonical = new Set<string>();
  for (const token of tokens) for (const cuisine of Object.hasOwn(aliases, token) ? aliases[token] : [token]) canonical.add(cuisine);
  // Composite italian_pizza is one documented alias, not a ninth cuisine when
  // italian and pizza already exist. The real Garden source has eight canonical
  // cuisines plus this redundant alias. Larger menus remain unconfirmed noise.
  if (canonical.size > 8) return [];
  const result = [...canonical].sort();
  for (const token of tokens) if (Object.hasOwn(aliases, token) && result.length < 8 && !result.includes(token)) result.push(token);
  return result.sort();
}
function evidenceFor(poi: Poi, source: SourceRecord, field: 'venue_type' | 'cuisine', value: string): Evidence {
  const identity = createHash('sha256').update(JSON.stringify([poi.id, poi.contentHash, source.sourceUrl, field, value])).digest('hex').slice(0, 24);
  return { id: `${poi.id}:source-facts:${field}:${identity}`, poiId: poi.id, field, value,
    sourceUrl: source.sourceUrl, fetchedAt: source.fetchedAt, confirmedAt: source.independentlyConfirmedAt };
}
function withoutDerived(poi: Poi): Poi {
  const evidence = poi.evidence.filter((item) => item.field !== 'venue_type' && item.field !== 'cuisine');
  if (poi.sourceFacts === undefined && evidence.length === poi.evidence.length) return poi;
  const { sourceFacts: omitted, ...stored } = poi;
  void omitted;
  return { ...stored, evidence };
}

/** Runtime facts are a derivative of the exact stored source, never an index-text
 * update. Preserve contentHash/payload on disk; a new process refreshes this cache.
 * Unknown/mismatched provenance cannot confirm venue or cuisine, even if a caller
 * supplied an earlier sourceFacts object. Existing category/features/photos stay intact. */
export async function enrichSourceFacts(pois: Poi[]): Promise<Poi[]> {
  const sources = await provenance();
  return pois.map((poi) => {
    const stored = withoutDerived(poi);
    const source = sources.get(poi.id);
    if (!source || source.contentHash !== poi.contentHash || source.sourceUrl !== poi.sourceUrl
      || poi.sourceUrl !== canonicalUrl(poi.id)) return stored;
    const amenity = typeof source.tags.amenity === 'string' ? source.tags.amenity.trim().toLowerCase() : null;
    let venueType = amenity && venueTypes.has(amenity) ? amenity : null;
    let cuisines = cuisinesFrom(source.tags.cuisine);
    // Every attached value must fit with its evidence without removing stored facts.
    const capacity = Math.max(0, 30 - stored.evidence.length);
    if (!capacity) venueType = null;
    cuisines = cuisines.slice(0, Math.max(0, capacity - (venueType ? 1 : 0)));
    const derived = [...(venueType ? [evidenceFor(poi, source, 'venue_type', venueType)] : []),
      ...cuisines.map((value) => evidenceFor(poi, source, 'cuisine', value))];
    return { ...stored, sourceFacts: { venueType, cuisines }, evidence: [...stored.evidence, ...derived] };
  });
}
