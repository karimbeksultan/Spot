import { readFile } from "node:fs/promises";
import path from "node:path";
import { straightLineMetres } from "./domain";
import { embeddingSpec } from "./model";
import { parsePoi, type Poi, type Point, type SearchRequest } from "./types";
import { appMode, requestSignal } from "./server/config";
import { isAstanaCandidate } from "./place-scope";
import { enrichSourceFacts } from "./source-facts";

let snapshot: Promise<Poi[]> | undefined;
export function loadSnapshot(): Promise<Poi[]> {
  snapshot ??= readFile(path.join(process.cwd(), "data", "pois.json"), "utf8").then((text) => {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error("SNAPSHOT_INVALID");
    const used = new Set<string>();
    return parsed.flatMap((raw) => {
      const checked = parsePoi(raw);
      if (!checked.success || used.has(checked.data.id) || !isAstanaCandidate(checked.data)) return [];
      used.add(checked.data.id); return [checked.data];
    });
  }).then(enrichSourceFacts).catch(() => { snapshot = undefined; return []; });
  return snapshot;
}
export function supabaseConfigured(): boolean { return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY); }
export async function databaseRpc(name: "spot_nearby" | "spot_search", body: Record<string, unknown>, signal?: AbortSignal): Promise<Poi[]> {
  if (!supabaseConfigured()) throw new Error("DATABASE_UNCONFIGURED");
  const base = new URL(process.env.SUPABASE_URL!);
  const local = ["localhost", "127.0.0.1"].includes(base.hostname);
  if (base.username || base.password || (!local && (base.protocol !== "https:" || !/^[a-z0-9]{20}\.supabase\.co$/.test(base.hostname)))) throw new Error("DATABASE_URL_INVALID");
  const response = await fetch(new URL(`/rest/v1/rpc/${name}`, base), {
    method: "POST", headers: { "Content-Type": "application/json", apikey: process.env.SUPABASE_PUBLISHABLE_KEY! },
    body: JSON.stringify(body), signal: requestSignal(signal, 8_000), cache: "no-store", redirect: "error",
  });
  if (!response.ok) throw new Error("DATABASE_UNAVAILABLE");
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("DATABASE_RESULT_INVALID");
  return enrichSourceFacts(rows.flatMap((row) => { const parsed = parsePoi(row.payload); return parsed.success && isAstanaCandidate(parsed.data) ? [parsed.data] : []; }));
}
export async function nearby(origin: Point, radius: number, limit = 80, signal?: AbortSignal): Promise<{ mode: "live" | "snapshot"; items: Poi[]; warnings: string[] }> {
  if (appMode() === "live" && process.env.RETRIEVAL_PROVIDER === "supabase" && supabaseConfigured()) {
    try { return { mode: "live", items: await databaseRpc("spot_nearby", { query_longitude: origin.longitude, query_latitude: origin.latitude, radius_metres: radius, match_count: Math.min(limit, 80) }, signal), warnings: [] }; }
    catch { /* Fall through to an explicitly labelled real snapshot. */ }
  }
  const data = await loadSnapshot();
  const items = data.filter((poi) => straightLineMetres(origin, poi.location) <= radius)
    .sort((a, b) => straightLineMetres(origin, a.location) - straightLineMetres(origin, b.location)).slice(0, limit);
  signal?.throwIfAborted();
  return { mode: "snapshot", items, warnings: [appMode() === "demo" ? "Демо по реальному снимку OSM. Облачные сервисы не вызываются." : process.env.RETRIEVAL_PROVIDER === "supabase" ? "Резервный поиск по реальному локальному снимку. Supabase не подключён или недоступен." : "Данные: реальный локальный снимок OSM. Облачная база не используется."] };
}
export async function hybridRetrieve(context: SearchRequest, embedding: number[], signal?: AbortSignal) {
  return databaseRpc("spot_search", { query_longitude: context.origin.longitude, query_latitude: context.origin.latitude,
    radius_metres: context.maxDistanceMetres, query_text: context.query, query_embedding: embedding,
    query_model: embeddingSpec().model, query_dimensions: 768, query_version: "1", match_count: 30 }, signal);
}
const categoryWords: Record<string, string> = { park: "парк прогулка воздух зелень отдых", cafe: "кафе кофе напиток", museum: "музей выставка искусство", landmark: "архитектура достопримечательность фото прогулка", playground: "детская площадка ребёнок дети", other: "город" };
export function lexicalRank(pois: Poi[], context: SearchRequest): Poi[] {
  const words = context.query.toLocaleLowerCase("ru").match(/[\p{L}\p{N}]{3,}/gu) ?? [];
  const score = (poi: Poi) => {
    const document = `${poi.name} ${poi.description} ${categoryWords[poi.category]}`.toLocaleLowerCase("ru");
    return words.reduce((sum, word) => sum + (document.includes(word.slice(0, 5)) ? 2 : 0), 0)
      + (context.interests.includes(poi.category) ? 12 : 0)
      + (/холод|помещен/u.test(context.query) && poi.features.indoor === true ? 4 : 0)
      - straightLineMetres(context.origin, poi.location) / 1000;
  };
  return [...pois].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
}
