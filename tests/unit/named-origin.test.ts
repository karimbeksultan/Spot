import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hasNamedOriginStatement, resolveNamedOrigin } from "../../src/lib/named-origin";
import { parsePoi, type Poi } from "../../src/lib/types";

const ballet: Poi = {
  id: "fixture:ballet", name: "Астана балет", location: { longitude: 71.4196527, latitude: 51.0992346 },
  category: "other", description: "Synthetic named-origin fixture, not source evidence",
  features: { outlets: null, wheelchair: null, indoor: null, quiet: null }, evidence: [], hours: null,
  openingHours: null, address: null, photos: [], sourceUrl: "https://example.com/ballet",
  fetchedAt: "2026-10-20T00:00:00Z", confirmedAt: null, contentHash: "synthetic-fixture",
};
const place = (name: string, id = `fixture:${name}`): Poi => ({ ...ballet, name, id });

describe("confirmation candidates for a named current start", () => {
  it.each([
    "нахожусь около Астана балет хочу поесть где нибудь есть 45 минут",
    "Нахожусь у Астана балет, хочу поесть",
    "Я нахожусь возле Астана балет. Есть 45 минут",
    "Я около Астана балет",
    "я у Астана балет",
    "я возле Астана балет",
    "я рядом с Астана балет хочу итальянскую еду",
    "нахожусь рядом с Астана балет",
    "I am near Астана балет, and want lunch",
    "I AM AT Астана балет, 45 minutes",
    "I am by Астана балет",
  ])("returns a source candidate for the initial assertion: %s", (query) => {
    const result = resolveNamedOrigin(query, [ballet]);
    expect(result).toMatchObject({ matchedName: "Астана балет", candidates: [{
      poiId: ballet.id, name: ballet.name, location: ballet.location, sourceUrl: ballet.sourceUrl,
    }] });
  });

  it("checks the initial assertion without needing a snapshot", () => {
    expect(hasNamedOriginStatement("нахожусь около Астана балет хочу поесть")).toBe(true);
    expect(hasNamedOriginStatement(" I am near Astana Ballet")).toBe(true);
    expect(hasNamedOriginStatement("Не нахожусь около Астана балет")).toBe(false);
    expect(hasNamedOriginStatement("Хочу посетить Астана балет")).toBe(false);
  });

  it.each([
    "  Я у «АСТАНА БАЛЕТ», хочу поесть! 45 минут.",
    'я у "Астана   балет"; поесть и вернуться',
    "Я у „Астана балет“. Нужна розетка, 45 минут",
    "Я у Астана-балет, хочу пиццу",
    "Я у Астана\u00a0балет",
  ])("normalizes spacing, quotes, case and punctuation: %s", (query) => {
    expect(resolveNamedOrigin(query, [ballet])?.candidates.map((item) => item.poiId)).toEqual([ballet.id]);
  });

  it.each([
    "Хочу пойти к Астана балет, потом поесть",
    "Хочу поесть возле Астана балет",
    "Я хочу посетить Астана балет",
    "Не нахожусь около Астана балет",
    "Я не нахожусь у Астана балет",
    "Я не у Астана балет",
    "I am not near Астана балет",
    "We are near Астана балет",
    "Сначала кофе, я у Астана балет",
    "У Астана балет есть кафе?",
    "Я уАстана балет",
    "я улица Астана балет",
  ])("does not infer a current start from goals, negations or other mentions: %s", (query) => {
    expect(resolveNamedOrigin(query, [ballet])).toBeNull();
  });

  it.each(["Я у Астана балетина", "Я у Астанабалет", "Я у Астана", "Я у неизвестного театра", "Я у Парка Победы", "Я у Астана балет театр"])(
    "leaves unknown and non-exact names unresolved: %s", (query) => {
      expect(resolveNamedOrigin(query, [ballet])).toEqual({ candidates: [] });
    },
  );

  it("does not substitute a park with a similar or grammatically inflected name", () => {
    expect(resolveNamedOrigin("Я у Парка Победы хочу поесть", [place("Парк Победы")])).toEqual({ candidates: [] });
    expect(resolveNamedOrigin("Я у Парк Победы хочу поесть", [place("Парк Победы")])?.matchedName).toBe("Парк Победы");
  });

  it("prefers the complete longer name instead of selecting its known prefix", () => {
    expect(resolveNamedOrigin("Я у Астана балет хочу поесть", [place("Астана"), ballet])?.candidates)
      .toEqual([{ poiId: ballet.id, name: ballet.name, location: ballet.location, sourceUrl: ballet.sourceUrl }]);
  });

  it("does not use a shorter known prefix inside an unknown longer name", () => {
    expect(resolveNamedOrigin("Я у Парк Победы хочу поесть", [place("Парк")])).toEqual({ candidates: [] });
    expect(resolveNamedOrigin("Я у Астана балет хочу поесть", [place("Астана")])).toEqual({ candidates: [] });
  });

  it.each([
    ["нахожусь около Астана балет хочу поесть где нибудь есть 45 минут", "Астана балет"],
    ['  Я у «АСТАНА  БАЛЕТ», хочу поесть за 45 минут и вернуться.', "АСТАНА  БАЛЕТ"],
    ['я у "Астана-балет"; хочу итальянскую еду, 45 минут, вернуться, розетка обязательна', "Астана-балет"],
    ["я у Астана\u00a0балет 45 минут хочу поесть", "Астана\u00a0балет"],
    ["I am at Астана балет, I have 45 minutes and need to return", "Астана балет"],
  ])("exposes the original name span without masking adjacent wishes or constraints: %s", (query, writtenName) => {
    const result = resolveNamedOrigin(query, [ballet]);
    expect(result?.nameSpan).toEqual({ start: query.indexOf(writtenName), end: query.indexOf(writtenName) + writtenName.length });
    const span = result!.nameSpan!;
    expect(query.slice(span.start, span.end)).toBe(writtenName);
    const masked = `${query.slice(0, span.start)}[ориентир]${query.slice(span.end)}`;
    expect(masked).toBe(query.replace(writtenName, "[ориентир]"));
    expect(masked).toContain("45");
    expect(masked).not.toContain(writtenName);
    expect(query.slice(0, span.start) + writtenName + query.slice(span.end)).toBe(query);
  });

  it("keeps UTF-16 offsets correct when a preceding name contains a surrogate pair", () => {
    const poi = place("𐐀 парк");
    const query = "Я у «𐐀 парк», 45 минут и вернуться";
    const result = resolveNamedOrigin(query, [poi]);
    expect(query.slice(result!.nameSpan!.start, result!.nameSpan!.end)).toBe("𐐀 парк");
  });

  it("returns ambiguous exact names as separate bounded choices, deduplicating IDs", () => {
    const choices = ["4", "2", "1", "3"].map((id) => place("Астана балет", `fixture:${id}`));
    const result = resolveNamedOrigin("я у Астана балет", [...choices, choices[1], choices[0]]);
    expect(result?.candidates.map((item) => item.poiId)).toEqual(["fixture:1", "fixture:2", "fixture:3"]);
  });

  it("returns new candidate objects without mutating the query, snapshot or constraints in its text", () => {
    const query = "я у Астана балет хочу итальянскую еду 45 минут вернуться розетка обязательна";
    const places = Object.freeze([Object.freeze({ ...ballet, location: Object.freeze({ ...ballet.location }) })]);
    const before = structuredClone(places);
    const result = resolveNamedOrigin(query, places);
    expect(query).toBe("я у Астана балет хочу итальянскую еду 45 минут вернуться розетка обязательна");
    expect(places).toEqual(before);
    expect(result?.candidates[0].location).not.toBe(places[0].location);
    expect(Object.keys(result!.candidates[0]).sort()).toEqual(["location", "name", "poiId", "sourceUrl"]);
  });

  it("handles an empty assertion and a request above the search length bound safely", () => {
    expect(resolveNamedOrigin("я у   ", [ballet])).toEqual({ candidates: [] });
    expect(resolveNamedOrigin(`я у Астана балет ${"а".repeat(1200)}`, [ballet])).toBeNull();
  });

  it("resolves the reported query to the real, schema-validated Astana Ballet source record", () => {
    const raw: unknown = JSON.parse(readFileSync(new URL("../../data/pois.json", import.meta.url), "utf8"));
    expect(Array.isArray(raw)).toBe(true);
    const source = (raw as Record<string, unknown>[]).find((row) => row.id === "osm:way/499328449");
    const parsed = parsePoi(source);
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("ASTANA_BALLET_SOURCE_INVALID");
    const result = resolveNamedOrigin("нахожусь около Астана балет хочу поесть где нибудь есть 45 минут", [parsed.data]);
    expect(result?.candidates).toEqual([{
      poiId: "osm:way/499328449", name: parsed.data.name,
      location: { longitude: 71.4196527, latitude: 51.0992346 },
      sourceUrl: "https://www.openstreetmap.org/way/499328449",
    }]);
  });
});
