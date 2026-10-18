import type { Poi } from "../../src/lib/types";
/** Source-derived OSM identifiers are identity, not semantic meaning. Coordinates stay in geo filtering. */
export function localIndexDocument(poi: Poi): string {
  const name = poi.name.replace(/\s*\(OSM (?:node|way|relation)\/\d+\)$/u, "");
  return [name, poi.description, poi.category, poi.address, poi.openingHours ? `Часы по источнику: ${poi.openingHours}` : null,
    ...Object.entries(poi.features).filter(([, value]) => value !== null).map(([key, value]) => `${key}: ${value}`)].filter(Boolean).join(". ");
}
