import { describe, expect, it } from "vitest";
import { interpretRequest, searchRequestSchema } from "../../src/lib/types";

const origin = { longitude: 71.4073303, latitude: 51.0890897 };
const cases = [
  { query: "Я возле Mega Silk Way, есть 45 минут, хочу прогуляться и вернуться", time: 45, returning: true, interests: "park" },
  { query: "Хочу кофе в тихом месте рядом, розетка обязательна", required: "outlets", interests: "cafe" },
  { query: "Я с ребёнком, есть час, хочу что-нибудь интересное неподалёку", time: 60, interests: "playground" },
  { query: "Посоветуй парк на 30 минут", time: 30, interests: "park" },
  { query: "Кофейня поблизости: нужна розетка", required: "outlets", interests: "cafe" },
  { query: "Только подтверждённо открытый музей", open: true, interests: "museum" },
  { query: "Хочу прогуляться без кафе", excluded: "cafe", interests: "park" },
  { query: "Кофе, но без кафе", excluded: "cafe", interests: "cafe" },
  { query: "Нужен доступный вход для коляски", required: "wheelchair" },
  { query: "Только в помещении", required: "indoor" },
  { query: "Тишина обязательна", required: "quiet" },
  { query: "Сделать фотографии архитектуры", interests: "landmark" },
  { query: "Есть 20 минут, потом обратно", time: 20, returning: true },
  { query: "времени вдвое меньше", time: 30 },
  { query: "поменьше ходить", radius: 1200 },
  { query: "Хочу в музей на 90 минут", time: 90, interests: "museum" },
  { query: "Точно открыто сейчас, нужны розетки", open: true, required: "outlets" },
  { query: "Холодно, хочу кофе", interests: "cafe" },
  { query: "I need a power outlet near me", required: "outlets" },
  { query: "Wheelchair access required", required: "wheelchair" },
  { query: "Quiet is required", required: "quiet" },
  { query: "Розетка міндетті", required: "outlets" },
  { query: "Арбамен қолжетімді орын керек", required: "wheelchair" },
  { query: "Тыныш жер міндетті", required: "quiet" },
] as const;

describe("18 Russian user inputs: deterministic constraint extraction", () => {
  for (const testCase of cases) it(testCase.query, () => {
    const result = interpretRequest(searchRequestSchema.parse({ query: testCase.query, origin, availableMinutes: 60 }));
    if ("time" in testCase) expect(result.availableMinutes).toBe(testCase.time);
    if ("returning" in testCase) expect(result.returnToStart).toBe(testCase.returning);
    if ("required" in testCase) expect(result.requiredFeatures).toContain(testCase.required);
    if ("interests" in testCase) expect(result.interests).toContain(testCase.interests);
    if ("excluded" in testCase) expect(result.excludedCategories).toContain(testCase.excluded);
    if ("open" in testCase) expect(result.confirmedOpen).toBe(testCase.open);
    if ("radius" in testCase) expect(result.maxDistanceMetres).toBe(testCase.radius);
  });
});
