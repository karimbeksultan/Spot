import { z } from "zod";
import { boundedJson, json, rateLimit } from "@/lib/http";
import { nearby } from "@/lib/retrieval";
import { astanaPointSchema } from "@/lib/types";
export const runtime = "nodejs";
const areaSchema = z.object({ origin: astanaPointSchema, radius: z.number().int().min(100).max(8000).default(5000) }).strict();
export async function POST(request: Request) {
  if (!rateLimit()) return json({ error: "Слишком много запросов. Повторите через минуту." }, 429);
  let raw: unknown; try { raw = await boundedJson(request); } catch { return json({ error: "Некорректный запрос." }, 400); }
  const area = areaSchema.safeParse(raw);
  if (!area.success) return json({ error: "Некорректная область поиска." }, 400);
  try { return json(await nearby(area.data.origin, area.data.radius, 80, request.signal)); }
  catch { return json({ error: "Список мест временно недоступен." }, 503); }
}
export async function GET(request: Request) {
  if (new URL(request.url).search) return json({ error: "Для области поиска используйте POST без координат в URL." }, 400);
  if (!rateLimit()) return json({ error: "Слишком много запросов. Повторите через минуту." }, 429);
  try { return json(await nearby({ longitude: 71.4304, latitude: 51.1282 }, 5000, 80, request.signal)); } catch { return json({ error: "Список мест временно недоступен." }, 503); }
}
