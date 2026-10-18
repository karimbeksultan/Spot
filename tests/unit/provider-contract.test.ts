import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { cloudReadiness, providerConfig } from "../../src/lib/server/config";
import { reserveCloudCall } from "../../src/lib/server/budget";
import * as budgetModule from "../../src/lib/server/budget";
import { cloudCompletion, retryAfter, type GenerationTelemetry } from "../../src/lib/server/providers";
import { generateChoices } from "../../src/lib/model";
import { loadSnapshot } from "../../src/lib/retrieval";
import { searchRequestSchema } from "../../src/lib/types";
const folders: string[] = [];
const actualReserve = reserveCloudCall;
function authorize(provider = "openai") {
  for (const [key, value] of Object.entries({ APP_MODE: "live", ALLOW_LIVE_API: "true", AI_RUN_ID: `mock-${crypto.randomUUID()}`,
    AI_AUTHORIZED_UNTIL: new Date(Date.now() + 60_000).toISOString(), AI_RUN_BUDGET_USD: "1", AI_DAILY_BUDGET_USD: "100", AI_MAX_REQUESTS_PER_RUN: "2",
    OPENAI_API_KEY: "mock-not-a-real-key", NVIDIA_API_KEY: "mock-not-a-real-key", OPENAI_MODEL: "gpt-5-mini", NVIDIA_MODEL: "z-ai/glm4.7",
    OPENAI_INPUT_USD_PER_MILLION: "1", OPENAI_OUTPUT_USD_PER_MILLION: "2", NVIDIA_INPUT_USD_PER_MILLION: "1", NVIDIA_OUTPUT_USD_PER_MILLION: "2", LLM_PRIMARY_PROVIDER: provider,
  })) vi.stubEnv(key, value);
}
beforeEach(() => { vi.stubEnv("APP_MODE", "demo"); vi.stubEnv("ALLOW_LIVE_API", "false"); vi.spyOn(budgetModule, "reserveCloudCall").mockResolvedValue(0.01); });
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllEnvs(); for (const folder of folders.splice(0)) await rm(folder, { recursive: true, force: true }); });
it("keys alone cannot authorize a cloud call and no fetch occurs", async () => {
  vi.stubEnv("OPENAI_API_KEY", "mock-not-a-real-key"); const fetch = vi.spyOn(globalThis, "fetch");
  await expect(cloudCompletion("openai", [], {}, new AbortController().signal, {})).rejects.toThrow("LIVE_CALL_BLOCKED"); expect(fetch).not.toHaveBeenCalled();
});
it("requires finite budgets, fresh authorization and reviewed endpoint/model", () => {
  authorize(); expect(cloudReadiness("openai")).toEqual([]);
  vi.stubEnv("AI_RUN_BUDGET_USD", ""); expect(cloudReadiness("openai")).toContain("ai_run_budget_usd");
  vi.stubEnv("OPENAI_BASE_URL", "https://attacker.example/v1"); expect(() => providerConfig("openai")).toThrow("ENDPOINT");
  vi.stubEnv("NVIDIA_MODEL", "invented-latest"); expect(() => providerConfig("nvidia")).toThrow("MODEL_NOT_REVIEWED");
});
it("empty rates and expired permission fail closed", () => {
  authorize("nvidia"); vi.stubEnv("AI_AUTHORIZED_UNTIL", "2000-01-01T00:00:00Z"); vi.stubEnv("NVIDIA_INPUT_USD_PER_MILLION", "");
  expect(cloudReadiness("nvidia")).toContain("authorization_expiry_required_max_24h"); expect(cloudReadiness("nvidia")).toContain("nvidia_input_usd_per_million");
});
it("persists conservative reservations; parallel requests cannot overspend a run", async () => {
  authorize(); vi.stubEnv("AI_MAX_REQUESTS_PER_RUN", "1");
  const temporaryRoot = path.join(process.cwd(), "work"); await mkdir(temporaryRoot, { recursive: true });
  const folder = await mkdtemp(path.join(temporaryRoot, "spot-cost-test-")); folders.push(folder);
  const results = await Promise.allSettled([actualReserve("openai", 300, 500, folder), actualReserve("openai", 300, 500, folder)]);
  expect(results.filter((r) => r.status === "fulfilled"), results.map((r) => r.status === "rejected" ? String(r.reason) : "ok").join(",")).toHaveLength(1);
  const ledger = JSON.parse(await readFile(path.join(folder, "work/private/cost-ledger.json"), "utf8"));
  expect(ledger.runs[process.env.AI_RUN_ID!].requests).toBe(1);
  await expect(actualReserve("openai", 300, 500, folder)).rejects.toThrow("BUDGET_EXHAUSTED");
});
it("interprets Retry-After without shortening a provider delay", () => {
  expect(retryAfter("30")).toBe(30_000); expect(retryAfter("Thu, 01 Jan 1970 00:00:10 GMT", 0)).toBe(10_000);
});
it("401 is terminal and unknown billing remains null", async () => {
  authorize(); const telemetry: GenerationTelemetry = {}; const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 401 }));
  await expect(cloudCompletion("openai", [], {}, new AbortController().signal, telemetry)).rejects.toMatchObject({ retryable: false });
  expect(fetch).toHaveBeenCalledTimes(1); expect(telemetry.usage?.actualCostUsd).toBeNull(); expect(telemetry.usage?.reservedUsd).toBeGreaterThan(0);
});
it("cancellation prevents reservation and network", async () => {
  authorize(); const abort = new AbortController(); abort.abort(); const fetch = vi.spyOn(globalThis, "fetch");
  await expect(cloudCompletion("openai", [], {}, abort.signal, {})).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
});
it("repairs malformed JSON once and binds IDs/evidence without exact coordinates", async () => {
  authorize(); const poi = (await loadSnapshot()).find((p) => p.category === "park")!;
  const context = searchRequestSchema.parse({ origin: poi.location, query: "Прогулка", availableMinutes: 60 });
  const choice = { poiId: poi.id, evidenceIds: [poi.evidence.find((e) => e.field === "category")!.id], activity: "walk", visitMinutes: 10 };
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ choices: [{ finish_reason: "stop", message: { content: "broken" } }] }))
    .mockResolvedValueOnce(Response.json({ model: "gpt-5-mini", choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ choices: [choice] }) } }], usage: { prompt_tokens: 10, completion_tokens: 20 } }));
  const telemetry: GenerationTelemetry = {}; const output = await generateChoices(context, [poi], undefined, telemetry);
  expect(output[0].poiId).toBe(poi.id); expect(fetch).toHaveBeenCalledTimes(2); expect(telemetry.usage?.inputTokens).toBe(10);
  const payload = JSON.parse(String(fetch.mock.calls[0][1]?.body)); expect(payload.response_format.type).toBe("json_schema");
  expect(String(fetch.mock.calls[0][1]?.body)).not.toContain(String(poi.location.latitude)); expect(payload.tools).toBeUndefined();
});
it("NVIDIA transport uses the reviewed endpoint and never exposes tools", async () => {
  authorize("nvidia"); const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"choices":[]}' } }] }));
  await cloudCompletion("nvidia", [{ role: "user", content: "JSON" }], {}, new AbortController().signal, {});
  expect(fetch.mock.calls[0][0]).toBe("https://integrate.api.nvidia.com/v1/chat/completions");
  const payload = JSON.parse(String(fetch.mock.calls[0][1]?.body)); expect(payload.model).toBe("z-ai/glm4.7"); expect(payload.tools).toBeUndefined(); expect(payload.max_tokens).toBeGreaterThan(0);
});
it("never retries earlier than a long Retry-After", async () => {
  authorize(); vi.stubEnv("ALLOW_PROVIDER_FAILOVER", "false");
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("", { status: 429, headers: { "Retry-After": "30" } }));
  const poi = (await loadSnapshot())[0];
  await expect(generateChoices(searchRequestSchema.parse({ origin: poi.location }), [poi])).rejects.toThrow("RETRY_AFTER"); expect(fetch).toHaveBeenCalledTimes(1);
});
it("explicitly authorized failover uses only two calls and no embedding switch", async () => {
  authorize(); vi.stubEnv("ALLOW_PROVIDER_FAILOVER", "true"); vi.stubEnv("LLM_FALLBACK_PROVIDER", "nvidia");
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("", { status: 503 }))
    .mockResolvedValueOnce(Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"choices":[]}' } }] }));
  const poi = (await loadSnapshot())[0]; const telemetry: GenerationTelemetry = {};
  expect(await generateChoices(searchRequestSchema.parse({ origin: poi.location }), [poi], undefined, telemetry)).toEqual([]);
  expect(fetch).toHaveBeenCalledTimes(2); expect(String(fetch.mock.calls[1][0])).toContain("integrate.api.nvidia.com"); expect(telemetry.provider).toBe("nvidia");
});
it("rejects invented IDs after the one permitted repair", async () => {
  authorize(); const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ choices: [{ poiId: "invented", evidenceIds: ["invented:e"], activity: "walk", visitMinutes: 10 }] }) } }] }));
  const poi = (await loadSnapshot())[0]; await expect(generateChoices(searchRequestSchema.parse({ origin: poi.location }), [poi])).rejects.toThrow(); expect(fetch).toHaveBeenCalledTimes(2);
});
