/** Actual saved local vectors; tests do not start Ollama or send network requests. */
import { afterEach, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { localHybridRetrieve } from "../../src/lib/local-index";
import { loadSnapshot, lexicalRank } from "../../src/lib/retrieval";
import { searchRequestSchema } from "../../src/lib/types";
import { embedQuery } from "../../src/lib/model";
import { searchPlaces } from "../../src/lib/search";
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
async function fixture() {
  const metadata = JSON.parse(await readFile("data/local-index/metadata.json", "utf8"));
  const bytes = await readFile("data/local-index/vectors.f32");
  const pois = await loadSnapshot(); const poi = pois.find((p) => p.id === metadata.rows[0].poiId)!;
  const embedding = Array.from({ length: 768 }, (_, d) => bytes.readFloatLE(d * 4));
  const context = searchRequestSchema.parse({ origin: poi.location, query: poi.name, maxDistanceMetres: 8000 });
  return { pois, poi, embedding, context };
}
it("combines local vectors and lexical ranks using known source IDs", async () => {
  const { pois, poi, embedding, context } = await fixture();
  const result = await localHybridRetrieve(context, embedding, pois, lexicalRank(pois, context));
  expect(result.items.map((p) => p.id)).toContain(poi.id); expect(result.indexedCandidates).toBeGreaterThan(0);
  expect(result.items.every((p) => pois.some((known) => known.id === p.id))).toBe(true);
});
it("rejects changed documents instead of reusing stale vectors", async () => {
  const { poi, embedding, context } = await fixture(); const changed = { ...poi, contentHash: "changed-document" };
  await expect(localHybridRetrieve(context, embedding, [changed], [changed])).rejects.toThrow("NO_COMPATIBLE_ROWS");
});
it("rejects embedding version/dimension mismatches without network", async () => {
  const { pois, embedding, context } = await fixture(); vi.stubEnv("EMBEDDING_VERSION", "different-pipeline");
  await expect(localHybridRetrieve(context, embedding, pois, pois)).rejects.toThrow("MISMATCH");
  vi.stubEnv("APP_MODE", "live"); await expect(embedQuery("test")).rejects.toThrow("SPACE_UNSUPPORTED");
  vi.stubEnv("EMBEDDING_VERSION", "1"); await expect(localHybridRetrieve(context, embedding.slice(1), pois, pois)).rejects.toThrow("MISMATCH");
});
it("honors cancellation before loading or scanning vectors", async () => {
  const abort = new AbortController(); abort.abort(); const { pois, embedding, context } = await fixture();
  await expect(localHybridRetrieve(context, embedding, pois, pois, abort.signal)).rejects.toThrow();
});
it("rejects impossible mandatory features before embeddings without a false service-failure warning", async () => {
  vi.stubEnv("APP_MODE", "live"); vi.stubEnv("RETRIEVAL_PROVIDER", "local");
  const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("NETWORK_FORBIDDEN"));
  const result = await searchPlaces(searchRequestSchema.parse({ origin: { longitude: 71.40733, latitude: 51.08909 }, query: "Розетка обязательна" }));
  expect(result.kind).toBe("no_match"); expect(result.diagnostics.retrieval).toBe("local-constraints-no-match"); expect(fetch).not.toHaveBeenCalled();
  expect(result.warnings.join()).not.toContain("индекс или embedding-модель недоступны");
});
