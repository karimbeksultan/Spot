import { describe, expect, it } from 'vitest';
import { appendOnlyCitySource, boundedSourceJson, CITY_BOUNDS, CITY_LIMIT, cityExtensionQuery, cityQuery, cityResponseStatus, normalizeCity } from '../../scripts/data/collect-city';
import { planImport } from '../../scripts/data/import-plan';
import type { OsmElement } from '../../scripts/data/normalize';

const fetchedAt = '2026-10-18T18:00:00Z';
const bench: OsmElement = { type: 'node', id: 8300, lat: 51.17, lon: 71.43, tags: { amenity: 'bench' } };
const count = (total: number): OsmElement => ({ type: 'count', id: 0, tags: { total: String(total) } });
describe('bounded Astana city staging', () => {
  it('selects Astana public categories with an output cap and count', () => {
    expect(cityQuery).toContain(CITY_BOUNDS);
    expect(cityQuery).toContain('cafe|bench|library|theatre');
    expect(cityQuery).toContain('park|garden|playground');
    expect(cityQuery).toContain(`out body center ${CITY_LIMIT};out count;`);
    expect(cityQuery).not.toMatch(/Sochi|Сочи/u);
  });
  it('creates an explicitly derived bench label from a real OSM identity, without amenities claims', () => {
    const result = normalizeCity([bench, count(1)], fetchedAt);
    expect(result.pois).toHaveLength(1);
    expect(result.pois[0]).toMatchObject({ id: 'osm:node/8300', name: 'Скамейка (OSM node/8300)', category: 'other',
      sourceUrl: 'https://www.openstreetmap.org/node/8300', openingHours: null, confirmedAt: null });
    expect(Object.values(result.pois[0].features)).toEqual([null, null, null, null]);
    expect(result.pois[0].description).toContain('amenity=bench');
  });
  it('does not collapse adjacent benches or same-name branches', () => {
    const cafe: OsmElement = { ...bench, id: 8400, tags: { amenity: 'cafe', name: 'Branch' } };
    const result = normalizeCity([bench, { ...bench, id: 8301, lat: 51.17001 }, cafe, { ...cafe, type: 'way', id: 8401, lat: 51.17001 }], fetchedAt);
    expect(result.pois).toHaveLength(4);
    expect(result.duplicates).toHaveLength(0);
  });
  it('deduplicates only stable IDs and keeps invalid positions out', () => {
    const result = normalizeCity([bench, bench, { ...bench, id: 8302, lat: 71.43, lon: 51.17 }], fetchedAt);
    expect(result.pois).toHaveLength(1);
    expect(result.duplicates).toEqual(['osm:node/8300']);
    expect(result.rejected).toEqual(['osm:node/8302']);
  });
  it('labels unnamed outdoor source objects while keeping unnamed indoor venues excluded', () => {
    const result = normalizeCity([{ ...bench, tags: { leisure: 'park' } }], fetchedAt);
    expect(result.pois).toHaveLength(1);
    expect(result.pois[0].name).toBe('Парк без названия (OSM node/8300)');
    expect(result.pois[0].category).toBe('park');
    const unnamedCafe = normalizeCity([{ ...bench, tags: { amenity: 'cafe' } }], fetchedAt);
    expect(unnamedCafe.pois).toHaveLength(0);
    expect(unnamedCafe.skippedUnlabelledNonBench).toBe(1);
  });
  it('excludes source objects explicitly marked private or inaccessible', () => {
    const result = normalizeCity([{ ...bench, tags: { leisure: 'playground', access: 'private' } }], fetchedAt);
    expect(result.pois).toHaveLength(0);
    expect(result.excludedAccessIds).toEqual(['osm:node/8300']);
  });
  it('maps restaurants honestly to other and does not invent indoor, outlets or prices', () => {
    const restaurant: OsmElement = { ...bench, tags: { name: 'Тестовый ресторан', amenity: 'restaurant', opening_hours: '10:00-23:00', 'addr:street': 'Тестовая', 'addr:housenumber': '12' } };
    const result = normalizeCity([restaurant], fetchedAt);
    expect(result.pois).toHaveLength(1);
    expect(result.pois[0]).toMatchObject({ category: 'other', openingHours: '10:00-23:00', address: 'Тестовая, 12' });
    expect(result.pois[0].category).not.toBe('cafe');
    expect(result.pois[0].description).toContain('Тип по источнику: restaurant (amenity)');
    expect(Object.values(result.pois[0].features)).toEqual([null, null, null, null]);
    expect(result.pois[0]).not.toHaveProperty('priceKzt');
    expect(result.pois[0].evidence.some(evidence => evidence.field === 'opening_hours' && evidence.value === '10:00-23:00')).toBe(true);
  });
  it('queries only the new explicit amenity types for the separate extension', () => {
    expect(cityExtensionQuery).toContain(CITY_BOUNDS);
    expect(cityExtensionQuery).toContain('restaurant|fast_food|food_court|ice_cream|bar|pub|cinema|arts_centre|community_centre|fountain|marketplace');
    expect(cityExtensionQuery).not.toContain('cafe|bench');
    expect(cityExtensionQuery).toContain(`out body center ${CITY_LIMIT};out count;`);
  });
  it('does not treat object prototype keys as supported source amenity types', () => {
    expect(normalizeCity([{ ...bench, tags: { name: 'Тест', amenity: 'constructor' } }], fetchedAt).pois).toHaveLength(0);
    expect(normalizeCity([{ ...bench, tags: { amenity: 'restaurant', leisure: 'constructor' } }], fetchedAt).pois).toHaveLength(0);
  });
  it('reports disused, abandoned and explicitly closed source objects before staging', () => {
    const restaurant: OsmElement = { ...bench, tags: { name: 'Тест', amenity: 'restaurant' } };
    const result = normalizeCity([
      { ...restaurant, id: 8500, tags: { ...restaurant.tags, disused: 'yes' } },
      { ...restaurant, id: 8501, tags: { ...restaurant.tags, abandoned: 'yes' } },
      { ...restaurant, id: 8502, tags: { ...restaurant.tags, opening_hours: 'closed' } },
    ], fetchedAt);
    expect(result.pois).toHaveLength(0);
    expect(result.excludedSourceObjects).toEqual([
      { id: 'osm:node/8500', reasons: ['disused=yes'] },
      { id: 'osm:node/8501', reasons: ['abandoned=yes'] },
      { id: 'osm:node/8502', reasons: ['opening_hours=closed'] },
    ]);
  });
  it('append-only extension ignores known source updates and preserves every current payload', () => {
    const current = normalizeCity([{ ...bench, tags: { name: 'Тест', amenity: 'cafe' } }], fetchedAt).pois;
    const incoming = [{ ...current[0], description: 'Changed source description', contentHash: 'changed' }, ...normalizeCity([{ ...bench, id: 8600, tags: { name: 'Новый ресторан', amenity: 'restaurant' } }], fetchedAt).pois];
    const extension = appendOnlyCitySource(incoming, current);
    expect(extension.ignoredKnownUpdates).toEqual([current[0].id]);
    expect(extension.incoming.map(poi => poi.id)).toEqual(['osm:node/8600']);
    const plan = planImport(extension.incoming, current);
    expect(plan.pois.find(poi => poi.id === current[0].id)).toEqual(current[0]);
    expect(plan.counts.updated).toBe(0);
  });
  it('detects missing counts and truncated source output', () => {
    expect(cityResponseStatus({ elements: [bench, count(1)] })).toMatchObject({ complete: true, received: 1, sourceTotal: 1, truncated: false });
    expect(cityResponseStatus({ elements: [bench, count(2)] })).toMatchObject({ complete: false, truncated: true });
    expect(cityResponseStatus({ elements: [bench] })).toMatchObject({ complete: false, sourceTotal: null });
    expect(() => cityResponseStatus({ elements: [], remark: 'runtime error' })).toThrow('INCOMPLETE');
  });
  it('enforces response byte limits even without a trusted Content-Length', async () => {
    await expect(boundedSourceJson(new Response('0123456789'), 5)).rejects.toThrow('SOURCE_RESPONSE_TOO_LARGE');
    await expect(boundedSourceJson(new Response('{}', { headers: { 'Content-Length': '100' } }), 5)).rejects.toThrow('SOURCE_RESPONSE_TOO_LARGE');
    expect(await boundedSourceJson(new Response('{"elements":[]}'), 100)).toEqual({ elements: [] });
  });
});
