import { boundedJson, json, rateLimit } from "@/lib/http";
import { searchPlaces } from "@/lib/search";
import { searchRequestSchema } from "@/lib/types";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!rateLimit()) return json({ error: "Слишком много запросов. Подождите минуту и повторите." }, 429);
  let body: unknown;
  try { body = await boundedJson(request); } catch { return json({ error: "Не удалось прочитать запрос. Проверьте формат и размер." }, 400); }
  const parsed = searchRequestSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Проверьте координаты, время и параметры поиска." }, 400);
  try { return json(await searchPlaces(parsed.data, request.signal)); }
  catch { return json({ error: "Поиск временно недоступен. Попробуйте снова." }, 503); }
}
