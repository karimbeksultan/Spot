import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { interpretSemanticIntent, semanticIntentModel, semanticIntentSchema, type SemanticIntent } from "../../src/lib/semantic-intent";
import { searchRequestSchema } from "../../src/lib/types";

const valid: SemanticIntent = { action: "replace", stages: [{ kind: "restaurant", cuisines: [] }, { kind: "park", cuisines: [] }],
  interests: [], order: "ordered", discovery: false, issue: "none" };
const defaultModel = "qwen3.5:2b-q4_K_M";
const request = searchRequestSchema.parse({ query: "Хочу что-нибудь заточить, потом выдохнуть на воздухе", origin: { longitude: 71.435829, latitude: 51.136279 },
  availableMinutes: 75, requiredFeatures: ["wheelchair"], startTime: "2026-10-19T12:00:00+05:00", budgetKzt: 9000,
  journeyStages: [{ kind: "restaurant", cuisines: ["italian"] }], interests: ["landmark"], journeyOrder: "ordered" });

function transport(intent: SemanticIntent) {
  return { activities: [...intent.stages.map((stage) => stage.kind), ...intent.interests],
    mode: intent.issue !== "none" ? intent.issue : intent.action === "refine" ? "refine" : intent.discovery ? "list" : "plan", order: intent.order };
}
function envelope(content: unknown = transport(valid), extra: Record<string, unknown> = {}) {
  return { model: defaultModel, done: true, done_reason: "stop", message: { role: "assistant", content: JSON.stringify(content) }, ...extra };
}

beforeEach(() => {
  vi.stubEnv("APP_MODE", "live"); vi.stubEnv("OLLAMA_CHAT_MODEL", "qwen3:0.6b");
  vi.stubEnv("OLLAMA_INTENT_MODEL", "");
  vi.stubEnv("OLLAMA_BASE_URL", "http://127.0.0.1:11434");
  vi.stubEnv("LLM_PRIMARY_PROVIDER", "nvidia"); vi.stubEnv("NVIDIA_API_KEY", "private-fixture-nvidia");
  vi.stubEnv("OPENAI_API_KEY", "private-fixture-openai");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("local semantic intent boundary, with mocked HTTP only", () => {
  it("accepts a schema-valid interpretation and uses local Qwen even with a cloud primary", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(envelope()));
    await expect(interpretSemanticIntent(request)).resolves.toEqual(valid);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("http://127.0.0.1:11434/api/chat");
    const init = fetch.mock.calls[0][1]!;
    const body = JSON.parse(String(init.body));
    expect(init.redirect).toBe("error"); expect(init.cache).toBe("no-store");
    expect(body).toMatchObject({ model: defaultModel, stream: false, think: false, keep_alive: 0,
      options: { temperature: 0.7, top_p: 0.8, top_k: 20, min_p: 0, seed: 42, num_predict: 240, num_ctx: 2048 } });
    expect(body.format.additionalProperties).toBe(false);
    expect(body.format.required).toEqual(expect.arrayContaining(["activities", "mode", "order"]));
    expect(body.tools).toBeUndefined(); expect(init.headers).toEqual({ "Content-Type": "application/json" });
  });

  it("sends only bounded query and prior goals, omitting exact origin, time, facilities, money and credentials", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(envelope()));
    await interpretSemanticIntent({ ...request, query: "а".repeat(1300) });
    const wire = String(fetch.mock.calls[0][1]?.body);
    const body = JSON.parse(wire);
    const input = JSON.parse(body.messages.at(-1).content);
    expect(input.INPUT).toHaveLength(1200);
    expect(input.PRIOR).toEqual({ stages: request.journeyStages, interests: request.interests, order: request.journeyOrder, searchMode: request.searchMode });
    expect(Object.keys(input).sort()).toEqual(["INPUT", "PRIOR"]);
    for (const privateValue of ["71.435829", "51.136279", "2026-10-19", "wheelchair", "9000", "private-fixture-nvidia", "private-fixture-openai"]) expect(wire).not.toContain(privateValue);
    expect(input.PRIOR.origin).toBeUndefined(); expect(input.PRIOR.availableMinutes).toBeUndefined();
  });

  it("accepts repeats without deduplicating or reordering model stages", async () => {
    const repeated: SemanticIntent = { ...valid, stages: [{ kind: "restaurant", cuisines: [] }, { kind: "cafe", cuisines: [] }, { kind: "restaurant", cuisines: [] }] };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(envelope(transport(repeated))));
    await expect(interpretSemanticIntent(request)).resolves.toEqual(repeated);
  });

  it("normalizes a single supported activity to options without depending on model list mode", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(envelope({ activities: ["park"], mode: "plan", order: "ordered" })));
    await expect(interpretSemanticIntent(request)).resolves.toMatchObject({ stages: [{ kind: "park", cuisines: [] }], discovery: true });
  });

  it("keeps multiple requested stops a plan rather than showing them as independent options", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(envelope({ activities: ["restaurant", "cafe"], mode: "list", order: "ordered" })));
    await expect(interpretSemanticIntent(request)).resolves.toMatchObject({ stages: [{ kind: "restaurant", cuisines: [] }, { kind: "cafe", cuisines: [] }], discovery: false });
  });

  it.each([
    ["catalogue", { ...valid, stages: [], interests: ["landmark", "museum"], discovery: true }],
    ["refine", { ...valid, action: "refine", stages: [], interests: [] }],
    ["ambiguous", { ...valid, action: "clarify", stages: [], issue: "ambiguous" }],
    ["unsupported", { ...valid, action: "clarify", stages: [], issue: "unsupported" }],
    ["too_many_stops", { ...valid, action: "clarify", stages: [], issue: "too_many_stops" }],
  ])("accepts the %s contract (not a model quality evaluation)", async (_label, content) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(envelope(transport(semanticIntentSchema.parse(content)))));
    await expect(interpretSemanticIntent(request)).resolves.toEqual(content);
  });

  it.each([
    ["extra root property", { ...valid, venue: "Invented place" }],
    ["extra stage property", { ...valid, stages: [{ kind: "cafe", cuisines: [], url: "https://example.org" }] }],
    ["unknown activity", { ...valid, stages: [{ kind: "hotel", cuisines: [] }] }],
    ["unknown interest", { ...valid, interests: ["airport"] }],
    ["over three stages", { ...valid, stages: [...valid.stages, ...valid.stages] }],
    ["cuisine on park", { ...valid, stages: [{ kind: "park", cuisines: ["italian"] }] }],
    ["invalid cuisine token", { ...valid, stages: [{ kind: "restaurant", cuisines: ["итальянская"] }] }],
    ["unclear action without issue", { ...valid, action: "clarify" }],
    ["issue on replacement", { ...valid, issue: "unsupported" }],
    ["activity-changing refinement", { ...valid, action: "refine" }],
    ["empty replacement", { ...valid, stages: [] }],
    ["missing property", { action: "replace", stages: valid.stages, order: "ordered", interests: [], issue: "none" }],
    ["array instead of contract", [valid]],
  ])("rejects %s without accepting a partial plan", async (_label, content) => {
    expect(semanticIntentSchema.safeParse(content).success).toBe(false);
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(envelope(content)));
    await expect(interpretSemanticIntent(request)).rejects.toThrow("INTENT_INVALID");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["extra transport fields", { activities: ["restaurant"], mode: "plan", order: "ordered", venue: "Invented" }],
    ["unknown activity", { activities: ["hotel"], mode: "plan", order: "ordered" }],
    ["unknown mode", { activities: ["restaurant"], mode: "execute", order: "ordered" }],
    ["unbounded activities", { activities: Array(7).fill("park"), mode: "plan", order: "ordered" }],
    ["empty goal", { activities: [], mode: "plan", order: "ordered" }],
  ])("rejects %s in compact model transport", async (_label, content) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(envelope(content)));
    await expect(interpretSemanticIntent(request)).rejects.toThrow("INTENT_INVALID");
  });

  it("turns an excessive plan into clarification rather than truncating it", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(envelope({ activities: ["restaurant", "cafe", "park", "cafe"], mode: "plan", order: "ordered" })));
    await expect(interpretSemanticIntent(request)).resolves.toMatchObject({ action: "clarify", issue: "too_many_stops", stages: [] });
  });

  it("does not convert a non-plannable museum stop into a park", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(envelope({ activities: ["cafe", "museum"], mode: "plan", order: "ordered" })));
    await expect(interpretSemanticIntent(request)).resolves.toMatchObject({ action: "clarify", issue: "unsupported", stages: [] });
  });

  it("offers no refinement mode to the model without prior goals", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(envelope()));
    await interpretSemanticIntent({ ...request, journeyStages: [], interests: [] });
    const body = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(body.format.properties.mode.enum).not.toContain("refine");
  });

  it("server-rejects refinement without prior goals even if the model ignores its format", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(envelope({ activities: [], mode: "refine", order: "ordered" })));
    await expect(interpretSemanticIntent({ ...request, journeyStages: [], interests: [] })).rejects.toThrow("INTENT_INVALID");
  });

  it("rejects activity-changing refinement rather than silently discarding its activities", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(envelope({ activities: ["cafe"], mode: "refine", order: "ordered" })));
    await expect(interpretSemanticIntent(request)).rejects.toThrow("INTENT_INVALID");
  });

  it("supports a dedicated local Qwen intent model while leaving the ranking model unchanged", async () => {
    vi.stubEnv("OLLAMA_INTENT_MODEL", "qwen3:1.7b");
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(envelope(transport(valid), { model: "qwen3:1.7b" })));
    await expect(interpretSemanticIntent(request)).resolves.toEqual(valid);
    const body = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(body.model).toBe("qwen3:1.7b"); expect(process.env.OLLAMA_CHAT_MODEL).toBe("qwen3:0.6b");
  });

  it("selects the reviewed intent default independently of the configured ranking model", () => {
    vi.stubEnv("OLLAMA_CHAT_MODEL", "qwen3:cloud");
    expect(semanticIntentModel()).toBe(defaultModel);
    vi.stubEnv("OLLAMA_INTENT_MODEL", "qwen3:1.7b");
    expect(semanticIntentModel()).toBe("qwen3:1.7b");
  });

  it.each([
    ["not done", { done: false }], ["missing done", { done: undefined }],
    ["token limit", { done_reason: "length" }], ["missing stop reason", { done_reason: undefined }],
    ["wrong model", { model: "some-cloud-model" }],
  ])("rejects %s even if content is valid JSON", async (_label, extra) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(envelope(valid, extra)));
    await expect(interpretSemanticIntent(request)).rejects.toThrow("INTENT_INCOMPLETE");
  });

  it.each(["```json\n{}\n```", "{", "null", " ".repeat(4001)])("rejects malformed or oversized content", async (content) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(envelope(valid, { message: { content } })));
    await expect(interpretSemanticIntent(request)).rejects.toThrow("INTENT_INVALID");
  });

  it.each(["http://example.org:11434", "https://api.openai.com", "http://user:pass@127.0.0.1:11434", "http://localhost:11434/proxy", "http://127.0.0.1:11434?api_key=secret", "http://127.0.0.1:11434#fragment", "file:///api/chat", "invalid-url"])("rejects unsafe endpoint %s before fetching", async (base) => {
    vi.stubEnv("OLLAMA_BASE_URL", base);
    const fetch = vi.spyOn(globalThis, "fetch");
    await expect(interpretSemanticIntent(request)).rejects.toThrow("OLLAMA_LOCAL_ONLY");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(["http://localhost:11434", "http://[::1]:11434", "https://127.0.0.1:11434"])("accepts supported loopback endpoint %s", async (base) => {
    vi.stubEnv("OLLAMA_BASE_URL", base);
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json(envelope()));
    await expect(interpretSemanticIntent(request)).resolves.toEqual(valid);
    expect(fetch.mock.calls[0][0]).toBe(`${base}/api/chat`);
  });

  it.each(["qwen3:cloud", "qwen3:30b-cloud", "gpt-oss:20b", "https://example.org/model", "qwen3"])("rejects a nonlocal or non-Qwen model %s before fetching", async (model) => {
    vi.stubEnv("OLLAMA_INTENT_MODEL", model);
    const fetch = vi.spyOn(globalThis, "fetch");
    await expect(interpretSemanticIntent(request)).rejects.toThrow("INTENT_LOCAL_QWEN_REQUIRED");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not call any provider in demo, regardless of cloud settings", async () => {
    vi.stubEnv("APP_MODE", "demo"); vi.stubEnv("OLLAMA_BASE_URL", "https://example.org");
    const fetch = vi.spyOn(globalThis, "fetch");
    await expect(interpretSemanticIntent(request)).rejects.toThrow("DEMO_NO_INTENT_CALL");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("honours cancellation before starting without any request", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    await expect(interpretSemanticIntent(request, AbortSignal.abort(new Error("cancelled")))).rejects.toThrow("cancelled");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("aborts an in-flight fetch without trying another provider", async () => {
    const controller = new AbortController();
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => undefined));
    const result = interpretSemanticIntent(request, controller.signal);
    const rejected = expect(result).rejects.toThrow("cancelled");
    controller.abort(new Error("cancelled"));
    await rejected;
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("bounds the entire fetch and body read with the same deadline", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockImplementation((milliseconds) => {
      setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), milliseconds);
      return controller.signal;
    });
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ start(stream) { stream.enqueue(new TextEncoder().encode('{"done":')); }, cancel });
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body));
    const rejected = expect(interpretSemanticIntent(request)).rejects.toThrow("Timed out");
    await vi.advanceTimersByTimeAsync(35_000);
    await rejected;
    expect(cancel).toHaveBeenCalledTimes(1); expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects an oversized response before parsing, including streaming bodies with no declared size", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("x".repeat(16_385)));
    await expect(interpretSemanticIntent(request)).rejects.toThrow("INTENT_RESPONSE_TOO_LARGE");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects oversized declared response length without reading the body", async () => {
    const response = new Response("{}", { headers: { "content-length": "16385" } });
    const reader = vi.spyOn(response.body!, "getReader");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response);
    await expect(interpretSemanticIntent(request)).rejects.toThrow("INTENT_RESPONSE_TOO_LARGE");
    expect(reader).not.toHaveBeenCalled();
  });

  it("does not retry failed local HTTP or fall back to cloud", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Unavailable", { status: 503 }));
    await expect(interpretSemanticIntent(request)).rejects.toThrow("INTENT_UNAVAILABLE");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retains no raw-text response cache across calls", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Response.json(envelope()));
    await interpretSemanticIntent(request); await interpretSemanticIntent(request);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
