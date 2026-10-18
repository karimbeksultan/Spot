import { describe, expect, it } from 'vitest';
import policy from '../../data/scope-exclusions.json';
import { ASTANA_SCOPE_EXCLUSION_COUNT, isAstanaCandidate } from '../../src/lib/place-scope';

const outsideCity = ['osm:node/13751850910', 'osm:way/1499433763', 'osm:way/1499557515', 'osm:relation/20456082', 'osm:way/1101719378'];
describe('Astana source-city scope quarantine', () => {
  for (const id of outsideCity) it(`excludes the source-city mismatch ${id}`, () => expect(isAstanaCandidate({ id })).toBe(false));
  it('keeps normal Astana source records eligible', () => {
    for (const id of ['osm:way/230401645', 'osm:way/499328514', 'osm:way/1196402246']) expect(isAstanaCandidate({ id })).toBe(true);
  });
  it('has a bounded, unique and source-attributed evidence list', () => {
    expect(ASTANA_SCOPE_EXCLUSION_COUNT).toBe(5);
    expect(policy.entries.map(entry => entry.poiId).sort()).toEqual([...outsideCity].sort());
    expect(policy.entries.every(entry => ['Косшы', 'Қосшы'].includes(entry.evidenceValue)
      && entry.sourceUrl === `https://www.openstreetmap.org/${entry.poiId.slice(4)}`
      && entry.checkKind === 'source_city_tag_review' && Number.isFinite(Date.parse(entry.checkedAt)))).toBe(true);
  });
});
