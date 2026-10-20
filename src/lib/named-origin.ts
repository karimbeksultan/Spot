import type { Poi } from "./types";

export type NamedOriginCandidate = Pick<Poi, "name" | "location" | "sourceUrl"> & { poiId: string };
export type NamedOriginMatch = { candidates: NamedOriginCandidate[]; matchedName?: string; nameSpan?: { start: number; end: number } };

// Only an initial assertion of the current position can suggest a start. A desired
// destination, an arbitrary mention or a model-generated location cannot do so.
const currentPosition = /^(?:(?:я\s+)?нахожусь\s+(?:около|у|возле|рядом\s+с)|я\s+(?:около|у|возле|рядом\s+с)|i\s+am\s+(?:near|at|by))\s+/iu;
const graphemes = new Intl.Segmenter("ru", { granularity: "grapheme" });

export function hasNamedOriginStatement(query: string): boolean {
  return query.length <= 1200 && currentPosition.test(query.trimStart());
}

function normalizedName(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ru").replace(/ё/gu, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/gu, " ");
}

function nameTokens(value: string, offset: number) {
  const tokens: { text: string; start: number; end: number }[] = [];
  let token: (typeof tokens)[number] | undefined;
  for (const part of graphemes.segment(value)) {
    for (const character of part.segment.normalize("NFKC").toLocaleLowerCase("ru").replace(/ё/gu, "е")) {
      if (/[\p{L}\p{N}]/u.test(character)) {
        token ??= { text: "", start: offset + part.index, end: offset + part.index };
        token.text += character;
        token.end = offset + part.index + part.segment.length;
      } else if (token) { tokens.push(token); token = undefined; }
    }
  }
  if (token) tokens.push(token);
  return tokens;
}

// These mark a new clause/condition, not a mapping from wording to an activity.
// A bare unknown continuation might be part of a longer venue name; reject it.
function reliableNameEnd(remainder: string): boolean {
  return !remainder.trim() || /^[\s]*["'»”’“.,;:!?]/u.test(remainder)
    || /^\s+(?:хочу|хотел(?:а)?|хотелось|есть|нужно|надо|мне|у\s+меня|свободно|времени|вернуться|i\s+(?:want|have|would)|want|have|with)(?=\s|[.,;:!?]|$)/iu.test(remainder)
    || /^\s+\d{1,3}\s*(?:мин(?:ут[а-яё]*)?|minutes?|mins?)(?=\s|[.,;:!?]|$)/iu.test(remainder);
}

/**
 * Finds public source places for an explicit current-location assertion, never
 * changes the query or chooses a start. The caller must ask for confirmation.
 * Input places must already be validated and restricted to the Astana snapshot.
 * null means no supported assertion; an empty list means an unresolved assertion.
 * RU/EN prefixes are deliberately narrow; there is no fuzzy matching or geocoder.
 */
export function resolveNamedOrigin(query: string, pois: readonly Poi[]): NamedOriginMatch | null {
  if (!hasNamedOriginStatement(query)) return null;
  const trimmed = query.trimStart();
  const assertion = currentPosition.exec(trimmed);
  if (!assertion) return null;
  const offset = query.length - trimmed.length + assertion[0].length;
  const tokens = nameTokens(query.slice(offset), offset);
  if (!tokens.length) return { candidates: [] };

  const matches = pois.flatMap((poi) => {
    const name = normalizedName(poi.name);
    const parts = name.split(" ");
    const end = tokens[parts.length - 1]?.end;
    return name && end !== undefined && parts.every((part, index) => part === tokens[index]?.text)
      && reliableNameEnd(query.slice(end)) ? [{ poi, name, end }] : [];
  });
  if (!matches.length) return { candidates: [] };

  // A known longer name wins over its prefix, but identical names remain choices.
  const longest = Math.max(...matches.map(({ name }) => name.length));
  const seen = new Set<string>();
  const candidates = matches.filter(({ name }) => name.length === longest)
    .sort((a, b) => a.poi.id.localeCompare(b.poi.id))
    .flatMap(({ poi }) => {
      if (seen.has(poi.id)) return [];
      seen.add(poi.id);
      return [{ poiId: poi.id, name: poi.name, location: { ...poi.location }, sourceUrl: poi.sourceUrl }];
    }).slice(0, 3);
  return { candidates, matchedName: candidates[0].name, nameSpan: { start: tokens[0].start, end: matches.find(({ name }) => name.length === longest)!.end } };
}
