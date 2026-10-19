import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET } from "../../src/app/api/health/route";
import { ollamaReady } from "../../src/lib/model";
import { loadSnapshot } from "../../src/lib/retrieval";
import { localRuntimeMemoryStop } from "../../src/lib/local-runtime-status";
import type { Poi } from "../../src/lib/types";

vi.mock("../../src/lib/model", () => ({ ollamaReady: vi.fn() }));
vi.mock("../../src/lib/retrieval", () => ({ loadSnapshot: vi.fn(), supabaseConfigured: () => false }));
vi.mock("../../src/lib/local-runtime-status", () => ({ localRuntimeMemoryStop: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("APP_MODE", "live"); vi.stubEnv("LLM_PRIMARY_PROVIDER", "ollama");
  // Health counts records only; this explicitly synthetic ID is not a source-data fixture.
  vi.mocked(loadSnapshot).mockResolvedValue([{ id: "synthetic-health-record" }] as Poi[]);
  vi.mocked(ollamaReady).mockResolvedValue(false); vi.mocked(localRuntimeMemoryStop).mockResolvedValue(true);
});
afterEach(() => vi.unstubAllEnvs());

it("reports a degraded live service and only a safe code after a proven managed memory stop", async () => {
  const response = await GET(); const body = await response.json();
  expect(body).toMatchObject({ status: "degraded", ollamaReady: false, localRuntimeIssue: "memory", datasetCount: 1, liveVerified: false });
  expect(JSON.stringify(body)).not.toMatch(/serverId|serverStartUtc|freeGiB|memory\.jsonl/u);
});
it("does not attach an old memory-stop reason to a ready runtime", async () => {
  vi.mocked(ollamaReady).mockResolvedValue(true);
  const body = await (await GET()).json();
  expect(body).toMatchObject({ status: "ok", ollamaReady: true, localRuntimeIssue: null });
  expect(localRuntimeMemoryStop).not.toHaveBeenCalled();
});
it("keeps demo health independent of model and guard calls", async () => {
  vi.stubEnv("APP_MODE", "demo");
  const body = await (await GET()).json();
  expect(body).toMatchObject({ status: "ok", mode: "demo", localRuntimeIssue: null });
  expect(ollamaReady).not.toHaveBeenCalled(); expect(localRuntimeMemoryStop).not.toHaveBeenCalled();
});
