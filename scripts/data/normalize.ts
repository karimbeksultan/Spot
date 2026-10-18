import type { Poi } from '../../src/lib/types';
import { sha256 } from './common';
export type OsmElement = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; timestamp?: string; tags?: Record<string, string> };
export type OsmResponse = { elements: OsmElement[]; osm3s?: { timestamp_osm_base: string }; remark?: string };
const labels: Record<Poi['category'], string> = { park: 'Парк или сад', cafe: 'Кафе', museum: 'Музей', landmark: 'Достопримечательность', playground: 'Детская площадка', other: 'Городское место' };
export const extensionAmenities: Record<string, string> = {
  restaurant: 'Ресторан', fast_food: 'Заведение быстрого питания', food_court: 'Фуд-корт', ice_cream: 'Мороженое',
  bar: 'Бар', pub: 'Паб', cinema: 'Кинотеатр', arts_centre: 'Центр искусств', community_centre: 'Общественный центр',
  fountain: 'Фонтан', marketplace: 'Рынок',
};
function category(tags: Record<string, string>): Poi['category'] | null {
  if (tags.amenity === 'cafe') return 'cafe';
  if (Object.hasOwn(extensionAmenities, tags.amenity)) return 'other';
  if (['park', 'garden'].includes(tags.leisure)) return 'park';
  if (tags.leisure === 'playground') return 'playground';
  if (tags.tourism === 'museum') return 'museum';
  if (['attraction', 'artwork', 'gallery'].includes(tags.tourism)) return 'landmark';
  if (['monument', 'memorial'].includes(tags.historic)) return 'landmark';
  if (tags.shop === 'mall' || ['theatre', 'library'].includes(tags.amenity)) return 'other';
  return null;
}
function tri(value: string | undefined): boolean | null { return value === 'yes' ? true : value === 'no' ? false : null; }
export function normalize(elements: OsmElement[], fetchedAt: string): { pois: Poi[]; rejected: string[]; duplicates: string[] } {
  const pois: Poi[] = []; const rejected: string[] = []; const duplicates: string[] = []; const ids = new Set<string>();
  for (const el of elements) {
    const tags = el.tags ?? {}; const cat = category(tags); const lat = el.lat ?? el.center?.lat; const lon = el.lon ?? el.center?.lon;
    const id = `osm:${el.type}/${el.id}`;
    if (!['node', 'way', 'relation'].includes(el.type) || !Number.isSafeInteger(el.id) || el.id <= 0) { rejected.push(id); continue; }
    // Reviewed alias: this node duplicates Mega's building polygon (names differ by language).
    if (id === 'osm:node/4965336822') { duplicates.push(`${id} => osm:way/499328514 (reviewed bilingual alias)`); continue; }
    if (ids.has(id)) { duplicates.push(id); continue; } ids.add(id);
    if (!cat) continue;
    if (!tags.name || lat === undefined || lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon) || lat < 50.9 || lat > 51.3 || lon < 71.2 || lon > 71.7) { rejected.push(id); continue; }
    const name = tags['name:ru'] ?? tags.name;
    // Exact-name records within 35 m are usually a mapped building plus its POI node.
    const duplicate = pois.find(p => p.name.normalize('NFKC').toLowerCase() === name.normalize('NFKC').toLowerCase() && p.category === cat && Math.hypot((p.location.latitude-lat)*111320,(p.location.longitude-lon)*70000)<35);
    if (duplicate) { duplicates.push(`${id} => ${duplicate.id}`); continue; }
    const sourceUrl = `https://www.openstreetmap.org/${el.type}/${el.id}`;
    const checkDate = tags.check_date && /^\d{4}-\d{2}-\d{2}$/.test(tags.check_date) ? Date.parse(`${tags.check_date}T00:00:00Z`) : NaN;
    const confirmedAt = Number.isFinite(checkDate) && new Date(checkDate).toISOString().slice(0, 10) === tags.check_date ? `${tags.check_date}T00:00:00Z` : null;
    const features = { outlets: tri(tags['socket:power'] ?? tags.power_supply), wheelchair: tri(tags.wheelchair), indoor: tri(tags.indoor), quiet: null };
    const sourceKind = Object.hasOwn(extensionAmenities, tags.amenity) ? extensionAmenities[tags.amenity] : undefined;
    const description = `${sourceKind ?? labels[cat]} в Астане. Категория и положение отмечены участниками OpenStreetMap.${sourceKind ? ` Тип по источнику: ${tags.amenity} (amenity).` : ''}${tags.cuisine ? ` Кухня по источнику: ${tags.cuisine}.` : ''}`;
    const evidence: Poi['evidence'] = [{ id: `${id}:category`, poiId: id, field: 'category', value: cat, sourceUrl, fetchedAt, confirmedAt }];
    for (const [field,value] of Object.entries(features)) if (value !== null) evidence.push({ id: `${id}:${field}`, poiId: id, field: field as 'outlets'|'wheelchair'|'indoor'|'quiet', value, sourceUrl, fetchedAt, confirmedAt });
    if (tags.opening_hours) evidence.push({ id: `${id}:opening_hours`, poiId: id, field: 'opening_hours', value: tags.opening_hours, sourceUrl, fetchedAt, confirmedAt });
    const core = { id, name, description, location: { longitude: lon, latitude: lat }, category: cat, features, hours: null, openingHours: tags.opening_hours ?? null, address: [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(', ') || null, sourceUrl };
    pois.push({ ...core, evidence, photos: [], fetchedAt, confirmedAt, contentHash: sha256(core) });
  }
  return { pois: pois.sort((a,b)=>a.id.localeCompare(b.id)), rejected, duplicates };
}
