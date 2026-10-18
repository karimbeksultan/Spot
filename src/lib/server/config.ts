/** Server configuration. Never import this module from a Client Component. */
if (typeof window !== "undefined") throw new Error("SERVER_ONLY");
export type Provider = "ollama" | "openai" | "nvidia";
export const DEMO_TIME = "2026-10-18T07:00:00.000Z";
export const appMode = () => process.env.APP_MODE === "live" ? "live" as const : "demo" as const;
export function boundedNumber(name: string, fallback: number, min: number, max: number) {
  const raw = Number(process.env[name] ?? fallback);
  return Number.isFinite(raw) ? Math.min(max, Math.max(min, raw)) : fallback;
}
export const primaryProvider = (): Provider => {
  const value = process.env.LLM_PRIMARY_PROVIDER ?? "ollama";
  if (!["ollama", "openai", "nvidia"].includes(value)) throw new Error("PROVIDER_UNSUPPORTED");
  return value as Provider;
};
export function providerConfig(provider: Provider) {
  if (provider === "ollama") return { model: process.env.OLLAMA_CHAT_MODEL || "qwen3:0.6b", key: "", endpoint: "" };
  const nvidia = provider === "nvidia";
  const model = process.env[nvidia ? "NVIDIA_MODEL" : "OPENAI_MODEL"] || (nvidia ? "z-ai/glm4.7" : "gpt-5-mini");
  // Reviewed endpoint/model pairs. Model-family capabilities are not endpoint guarantees.
  if (model !== (nvidia ? "z-ai/glm4.7" : "gpt-5-mini")) throw new Error("MODEL_NOT_REVIEWED");
  const base = nvidia ? "https://integrate.api.nvidia.com/v1" : "https://api.openai.com/v1";
  if (process.env[nvidia ? "NVIDIA_BASE_URL" : "OPENAI_BASE_URL"] && process.env[nvidia ? "NVIDIA_BASE_URL" : "OPENAI_BASE_URL"] !== base) throw new Error("PROVIDER_ENDPOINT_NOT_ALLOWED");
  return { model, key: process.env[nvidia ? "NVIDIA_API_KEY" : "OPENAI_API_KEY"] || "", endpoint: `${base}/chat/completions` };
}
export function cloudReadiness(provider: Provider, now = Date.now()): string[] {
  if (provider === "ollama") return appMode() === "live" ? [] : ["demo_mode"];
  const missing: string[] = [];
  if (appMode() !== "live") missing.push("demo_mode");
  if (process.env.ALLOW_LIVE_API !== "true") missing.push("live_api_not_authorized");
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(process.env.AI_RUN_ID || "")) missing.push("run_id_required");
  const expiry = Date.parse(process.env.AI_AUTHORIZED_UNTIL || "");
  if (!Number.isFinite(expiry) || expiry <= now || expiry > now + 86_400_000) missing.push("authorization_expiry_required_max_24h");
  for (const name of ["AI_RUN_BUDGET_USD", "AI_DAILY_BUDGET_USD", "AI_MAX_REQUESTS_PER_RUN"]) {
    if (!Number.isFinite(Number(process.env[name])) || Number(process.env[name]) <= 0) missing.push(name.toLowerCase());
  }
  const prefix = provider.toUpperCase();
  for (const name of [`${prefix}_INPUT_USD_PER_MILLION`, `${prefix}_OUTPUT_USD_PER_MILLION`]) {
    if (!process.env[name] || !Number.isFinite(Number(process.env[name])) || Number(process.env[name]) <= 0) missing.push(name.toLowerCase());
  }
  try { if (!providerConfig(provider).key) missing.push(`${provider}_key_missing`); }
  catch { missing.push("provider_config_invalid"); }
  return missing;
}
export const requestSignal = (signal?: AbortSignal, timeout = boundedNumber("AI_REQUEST_TIMEOUT_MS", 20_000, 1000, 60_000)) =>
  signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
