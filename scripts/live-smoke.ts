/** Optional owner-invoked smoke. Never part of verify/CI. No credentials are printed. */
import { cloudReadiness, primaryProvider } from "../src/lib/server/config";
import { searchPlaces } from "../src/lib/search";
import { searchRequestSchema } from "../src/lib/types";
async function main() {
  if (process.env.SPOT_LIVE_SMOKE !== "true") throw new Error("Set SPOT_LIVE_SMOKE=true only for an explicitly authorized run");
  const provider = primaryProvider();
  const blocked = cloudReadiness(provider);
  if (blocked.length) throw new Error(`LIVE_SMOKE_BLOCKED: ${blocked.join(",")}`);
  const result = await searchPlaces(searchRequestSchema.parse({ query: "Хочу прогуляться", origin: { longitude: 71.40733, latitude: 51.08909 }, availableMinutes: 45 }));
  console.log(JSON.stringify({ kind: result.kind, mode: result.mode, count: result.items.length, provenance: result.provenance, diagnostics: result.diagnostics }, null, 2));
  if (!result.diagnostics.generation.endsWith("-validated")) throw new Error("LIVE_GENERATION_NOT_VERIFIED");
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "LIVE_SMOKE_FAILED"); process.exitCode = 1; });
