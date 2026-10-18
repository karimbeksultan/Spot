import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { assertEmbeddingCompatibility, reciprocalRankFusion, straightLineMetres } from "./domain";
import { embeddingSpec } from "./model";
import type { Poi, SearchRequest } from "./types";
type IndexMetadata = { model: string; dimensions: number; version: string; vectorSha256: string; rows: { poiId: string; documentHash: string }[] };
let index: Promise<{ metadata: IndexMetadata; bytes: Buffer }> | undefined;
async function loadIndex() {
  index ??= (async () => {
    const directory = path.join(process.cwd(), "data", "local-index");
    const metadata = JSON.parse(await readFile(path.join(directory, "metadata.json"), "utf8")) as IndexMetadata;
    const bytes = await readFile(path.join(directory, "vectors.f32"));
    if (metadata.model !== embeddingSpec().model || metadata.dimensions !== 768 || metadata.version !== "1"
      || !Array.isArray(metadata.rows) || metadata.rows.length > 5000 || bytes.length !== metadata.rows.length * 768 * 4
      || metadata.vectorSha256 !== createHash("sha256").update(bytes).digest("hex")
      || metadata.rows.some((row) => typeof row.poiId !== "string" || typeof row.documentHash !== "string")
      || new Set(metadata.rows.map((r) => r.poiId)).size !== metadata.rows.length) throw new Error("LOCAL_INDEX_INCOMPATIBLE");
    return { metadata, bytes };
  })().catch((error) => { index = undefined; throw error; });
  return index;
}
/** One embedding space; mismatched/changed rows never participate in semantic ranking. */
export async function localHybridRetrieve(context: SearchRequest, embedding: number[], pois: Poi[], textRanked: Poi[], signal?: AbortSignal) {
  signal?.throwIfAborted();
  const { metadata, bytes } = await loadIndex();
  signal?.throwIfAborted();
  assertEmbeddingCompatibility(embeddingSpec(), metadata, embedding);
  const available = new Map(pois.filter((p) => straightLineMetres(context.origin, p.location) <= context.maxDistanceMetres).map((p) => [p.id, p]));
  const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  const scores: { id: string; score: number }[] = [];
  for (const [rowIndex, row] of metadata.rows.entries()) {
    if (rowIndex % 64 === 0) signal?.throwIfAborted();
    const poi = available.get(row.poiId); if (!poi || poi.contentHash !== row.documentHash) continue;
    let dot = 0, length = 0;
    for (let d = 0; d < 768; d++) { const value = bytes.readFloatLE((rowIndex * 768 + d) * 4); if (!Number.isFinite(value)) throw new Error("LOCAL_INDEX_VECTOR_INVALID"); dot += value * embedding[d]; length += value * value; }
    if (length > 0) scores.push({ id: row.poiId, score: dot / (norm * Math.sqrt(length)) });
  }
  if (!scores.length) throw new Error("LOCAL_INDEX_NO_COMPATIBLE_ROWS");
  const semanticIds = scores.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 30).map((r) => r.id);
  const ids = reciprocalRankFusion(textRanked.slice(0, 30).map((p) => p.id), semanticIds);
  return { items: ids.map((id) => available.get(id)!).filter(Boolean).slice(0, 40), indexedCandidates: scores.length, corpusRows: metadata.rows.length };
}
