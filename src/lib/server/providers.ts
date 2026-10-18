import { reserveCloudCall } from "./budget";
import { appMode, boundedNumber, cloudReadiness, providerConfig, requestSignal, type Provider } from "./config";
export type GenerationTelemetry = { provider?: string; model?: string; promptVersion?: string; usage?: { inputTokens: number | null; outputTokens: number | null; actualCostUsd: number | null; reservedUsd: number } };
const circuits = new Map<string, { failures: number; until: number }>();
let active = 0;
export class ProviderError extends Error { constructor(readonly code: string, readonly retryable = false, readonly retryMs = 0) { super(code); } }
async function boundedResponse(response: Response): Promise<unknown> {
  if (Number(response.headers.get("content-length") ?? 0) > 200_000) throw new ProviderError("RESPONSE_TOO_LARGE");
  const reader = response.body?.getReader(); if (!reader) throw new ProviderError("RESPONSE_INVALID");
  const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 200_000) throw new ProviderError("RESPONSE_TOO_LARGE"); chunks.push(value); } }
  finally { await reader.cancel().catch(() => {}); }
  const bytes = Buffer.concat(chunks); try { return JSON.parse(bytes.toString("utf8")); } catch { throw new ProviderError("RESPONSE_INVALID"); }
}
export function retryAfter(value: string | null, now = Date.now()): number {
  if (!value) return 500;
  const seconds = Number(value); const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
  return Number.isFinite(ms) ? Math.max(0, ms) : 500;
}
export async function cloudCompletion(provider: Exclude<Provider, "ollama">, messages: { role: string; content: string }[], schema: object,
  signal: AbortSignal, telemetry: GenerationTelemetry): Promise<string> {
  if (appMode() !== "live" || cloudReadiness(provider).length) throw new ProviderError("LIVE_CALL_BLOCKED");
  signal.throwIfAborted();
  const circuit = circuits.get(provider); if (circuit && circuit.until > Date.now()) throw new ProviderError("CIRCUIT_OPEN", true);
  if (active >= 2) throw new ProviderError("PROVIDER_CONCURRENCY_LIMIT");
  active += 1;
  try {
    const config = providerConfig(provider); const maxOutput = Math.floor(boundedNumber("AI_MAX_OUTPUT_TOKENS", 1000, 128, 4096));
    const body = JSON.stringify({ model: config.model, messages, stream: false,
      ...(provider === "openai" ? { max_completion_tokens: maxOutput, response_format: { type: "json_schema", json_schema: { name: "spot_choices_v2", strict: true, schema } } }
        : { max_tokens: maxOutput, temperature: 0.1 }),
    }); // NVIDIA hosted schema transport not assumed from self-hosted NIM docs. Prompt + strict server validation.
    const reservation = await reserveCloudCall(provider, Buffer.byteLength(body), maxOutput);
    telemetry.usage = { inputTokens: null, outputTokens: null, actualCostUsd: null, reservedUsd: (telemetry.usage?.reservedUsd ?? 0) + reservation };
    telemetry.provider = provider; telemetry.model = config.model;
    const response = await fetch(config.endpoint, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.key}` },
      redirect: "error", cache: "no-store", signal: requestSignal(signal), body });
    if (!response.ok) { await response.body?.cancel(); throw new ProviderError(`PROVIDER_HTTP_${response.status}`, response.status === 429 || response.status >= 500, retryAfter(response.headers.get("retry-after"))); }
    const data = await boundedResponse(response) as { model?: string; choices?: { finish_reason?: string; message?: { content?: string; refusal?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    const choice = data.choices?.[0];
    if (choice?.finish_reason !== "stop" || choice.message?.refusal || typeof choice.message?.content !== "string" || choice.message.content.length > 12_000) throw new ProviderError("GENERATION_INVALID");
    const input = data.usage?.prompt_tokens; const output = data.usage?.completion_tokens;
    telemetry.model = typeof data.model === "string" ? data.model.slice(0, 100) : config.model;
    telemetry.usage = { ...telemetry.usage, inputTokens: Number.isInteger(input) && input! >= 0 ? input! : null, outputTokens: Number.isInteger(output) && output! >= 0 ? output! : null };
    circuits.delete(provider); return choice.message.content;
  } catch (error) {
    if (!(error instanceof ProviderError) || error.retryable) {
      const failures = (circuits.get(provider)?.failures ?? 0) + 1; circuits.set(provider, { failures, until: failures >= 3 ? Date.now() + 30_000 : 0 });
    }
    throw error;
  } finally { active -= 1; }
}
export async function boundedPause(ms: number, signal: AbortSignal) {
  if (ms > 1500) throw new ProviderError("RETRY_AFTER_EXCEEDS_DEADLINE", true);
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => { const abort = () => { clearTimeout(timer); reject(signal.reason); }; const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms); signal.addEventListener("abort", abort, { once: true }); });
}
