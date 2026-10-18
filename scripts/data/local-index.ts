/** Local-only RAG ingestion. No training, credentials, remote DB or paid API. */
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadPois, writeJson } from "./common";
import { localIndexDocument } from "./local-index-document";
import { assertEmbeddingCompatibility } from "../../src/lib/domain";
type Row = { poi_id: string; document_hash: string; embedding: number[]; embedding_model: string; embedding_dimensions: number; embedding_version: string };
async function main() {
  const pois = await loadPois(); const model = "embeddinggemma"; const dimensions = 768; const version = "1";
  const spec = { model, dimensions, version }; const output = path.join(process.cwd(), "data", "local-index");
  const existing = new Map<string, Row>();
  // Reuse already generated vectors; do not regenerate or change the embedding space silently.
  try { const prior: Row[] = JSON.parse(await readFile("work/ollama-audit/poi-embeddings.json", "utf8")); for (const row of prior) existing.set(row.poi_id, row); } catch { /* Optional older local cache. */ }
  try {
    const meta = JSON.parse(await readFile(path.join(output, "metadata.json"), "utf8")); const bytes = await readFile(path.join(output, "vectors.f32"));
    if (meta.model === model && meta.dimensions === dimensions && meta.version === version && meta.vectorSha256 === createHash("sha256").update(bytes).digest("hex"))
      meta.rows.forEach((row: { poiId: string; documentHash: string }, i: number) => existing.set(row.poiId, { poi_id: row.poiId, document_hash: row.documentHash,
        embedding: Array.from({ length: dimensions }, (_, d) => bytes.readFloatLE((i * dimensions + d) * 4)), embedding_model: model, embedding_dimensions: dimensions, embedding_version: version }));
  } catch { /* Invalid or absent cache is rebuilt locally. */ }
  const pending = pois.filter((p) => { const r = existing.get(p.id); return !r || r.document_hash !== p.contentHash || r.embedding_model !== model || r.embedding_dimensions !== dimensions || r.embedding_version !== version; });
  const groups = new Map<string, typeof pois>();
  for (const poi of pending) { const document = localIndexDocument(poi); const group = groups.get(document) ?? []; group.push(poi); groups.set(document, group); }
  if (process.argv.includes("--dry-run")) { console.log(JSON.stringify({ dryRun: true, records: pois.length, reused: pois.length - pending.length, pending: pending.length, uniqueNewDocuments: groups.size, requests: 0, writes: 0, provider: "local Ollama", ...spec })); return; }
  const base = new URL(process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) || !["http:", "https:"].includes(base.protocol)) throw new Error("LOCAL_OLLAMA_ONLY");
  let calls = 0;
  const checkpoint = path.join(process.cwd(), "work/local-index-build/checkpoint.json");
  let cached: Record<string, number[]> = {};
  try { const prior = JSON.parse(await readFile(checkpoint, "utf8")); if (prior.model === model && prior.version === version && prior.dimensions === dimensions) cached = prior.vectors; } catch { /* Fresh resumable build. */ }
  const digest = (text: string) => createHash("sha256").update(text).digest("hex");
  const documents = [...groups.keys()].filter((text) => !cached[digest(text)]);
  for (let offset = 0; offset < documents.length; offset += 8) {
    const batch = documents.slice(offset, offset + 8);
    const response = await fetch(new URL("/api/embed", base), { method: "POST", headers: { "Content-Type": "application/json" }, redirect: "error", signal: AbortSignal.timeout(90_000),
      body: JSON.stringify({ model, input: batch, dimensions, truncate: false, keep_alive: "30s", options: { num_thread: 2, num_ctx: 2048 } }) });
    if (!response.ok) throw new Error("LOCAL_EMBEDDING_UNAVAILABLE"); const data = await response.json();
    if (![model, `${model}:latest`].includes(data.model) || !Array.isArray(data.embeddings) || data.embeddings.length !== batch.length) throw new Error("EMBEDDING_INVALID");
    batch.forEach((document, i) => { assertEmbeddingCompatibility(spec, spec, data.embeddings[i]); cached[digest(document)] = data.embeddings[i]; });
    await writeJson(checkpoint, { ...spec, vectors: cached });
    calls++; console.log(`Local index ${Math.min(offset + 8, documents.length)}/${documents.length} unique new documents (${pending.length} POIs)`);
  }
  for (const [document, group] of groups) { const embedding = cached[digest(document)]; assertEmbeddingCompatibility(spec, spec, embedding); for (const poi of group) existing.set(poi.id, { poi_id: poi.id, document_hash: poi.contentHash, embedding, embedding_model: model, embedding_dimensions: dimensions, embedding_version: version }); }
  const bytes = Buffer.alloc(pois.length * dimensions * 4);
  pois.forEach((poi, i) => { const row = existing.get(poi.id)!; assertEmbeddingCompatibility(spec, spec, row.embedding); row.embedding.forEach((value, d) => bytes.writeFloatLE(value, (i * dimensions + d) * 4)); });
  await mkdir(output, { recursive: true }); await writeFile(path.join(output, "vectors.f32.tmp"), bytes); await rename(path.join(output, "vectors.f32.tmp"), path.join(output, "vectors.f32"));
  await writeJson(path.join(output, "metadata.json"), { ...spec, documentNormalization: "strip-derived-osm-id-v2", vectorSha256: createHash("sha256").update(bytes).digest("hex"), generatedAt: new Date().toISOString(), rows: pois.map((p) => ({ poiId: p.id, documentHash: p.contentHash, embeddingDocumentSha256: digest(localIndexDocument(p)) })) });
  const report = { records: pois.length, reused: pois.length - pending.length, embedded: pending.length, uniqueNewDocuments: groups.size, localRequests: calls, remoteRequests: 0, training: false, ...spec };
  await writeJson(path.join(process.cwd(), "data/reports/local-index.json"), report); console.log(JSON.stringify(report));
}
main().catch(() => { console.error("LOCAL_INDEX_BUILD_FAILED: verify local Ollama and compatible embedding space; existing POI snapshot preserved"); process.exitCode = 1; });
