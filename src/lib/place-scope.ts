import policy from '../../data/scope-exclusions.json';
import type { Poi } from './domain';

const entries = policy.entries;
if (policy.schemaVersion !== 1 || policy.policy !== 'astana_only' || !Array.isArray(entries) || entries.length > 100) throw new Error('PLACE_SCOPE_POLICY_INVALID');
const excludedIds = new Set<string>();
for (const entry of entries) {
  const identity = typeof entry.poiId === 'string' ? entry.poiId.match(/^osm:(node|way|relation)\/([1-9]\d{0,19})$/) : null;
  const sourceMatches = identity && Number.isSafeInteger(Number(identity[2]))
    && entry.sourceUrl === `https://www.openstreetmap.org/${identity[1]}/${identity[2]}`;
  const city = typeof entry.evidenceValue === 'string' ? entry.evidenceValue.normalize('NFKC').trim().toLowerCase() : '';
  if (!sourceMatches || excludedIds.has(entry.poiId) || entry.evidenceField !== 'addr:city' || !city || ['астана', 'astana'].includes(city)
    || !entry.reason?.trim() || entry.checkKind !== 'source_city_tag_review'
    || !Number.isFinite(Date.parse(entry.checkedAt)) || !Number.isFinite(Date.parse(entry.sourceFetchedAt))) throw new Error('PLACE_SCOPE_POLICY_INVALID');
  excludedIds.add(entry.poiId);
}

/** Quarantine explicit source-city mismatches; never delete source records or vectors. */
export function isAstanaCandidate(poi: Pick<Poi, 'id'>): boolean {
  return !excludedIds.has(poi.id);
}

export const ASTANA_SCOPE_EXCLUSION_COUNT = excludedIds.size;
