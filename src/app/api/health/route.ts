import { json } from "@/lib/http";
import { ollamaReady } from "@/lib/model";
import { loadSnapshot, supabaseConfigured } from "@/lib/retrieval";
import { appMode, cloudReadiness, primaryProvider } from "@/lib/server/config";
import { semanticIntentModel } from "@/lib/semantic-intent";
export const runtime = "nodejs";
export async function GET() {
  const mode = appMode(); const pois = await loadSnapshot();
  const ollama = mode === "live" ? await ollamaReady() : false;
  let understandingModel: string | null = null; try { understandingModel = semanticIntentModel(); } catch { /* Invalid local config is not readiness. */ }
  let blocked: string[]; try { blocked = cloudReadiness(primaryProvider()); } catch { blocked = ["provider_config_invalid"]; }
  return json({ status: pois.length ? "ok" : "degraded", mode, datasetCount: pois.length, supabaseConfigured: supabaseConfigured(), ollamaReady: ollama, understandingModel,
    routingEnabled: mode === "live" && process.env.ROUTING_ENABLED !== "false", timeZone: "Asia/Almaty", cloudBlockedReasons: blocked,
    liveVerified: false, note: "Наличие настроек не подтверждает доступность интеграций. Health не выполняет платные запросы." });
}
