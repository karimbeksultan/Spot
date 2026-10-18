import type { GroundedChoice, Poi } from "./domain";
const labels = {
  en: { park: "park", cafe: "café", museum: "museum", landmark: "landmark", playground: "playground", other: "city place" },
  kk: { park: "саябақ", cafe: "кафе", museum: "мұражай", landmark: "көрікті жер", playground: "балалар алаңы", other: "қала орны" },
};
const ideas = {
  en: { walk: "Idea: take a short walk and look around.", rest: "Idea: take a short break.", coffee: "Idea: check the menu and choose a drink.", explore: "Idea: check available exhibitions before visiting.", look: "Idea: look around the place.", photograph: "Idea: choose a photo viewpoint.", play: "Idea: inspect the playground with your child; assess suitability on site." },
  kk: { walk: "Ұсыныс: аздап серуендеп, айналаны қарау.", rest: "Ұсыныс: қысқа үзіліс жасау.", coffee: "Ұсыныс: мәзірді қарап, сусын таңдау.", explore: "Ұсыныс: бармас бұрын көрмелерді нақтылау.", look: "Ұсыныс: орынды қарау.", photograph: "Ұсыныс: фотоға ракурс таңдау.", play: "Ұсыныс: баламен алаңды қарап, жарамдылығын сол жерде бағалау." },
};
export function groundedCopy(poi: Poi, choice: GroundedChoice, language: "ru" | "kk" | "en", distance: number) {
  if (language === "ru") return { why: `${choice.reasons.join(" ")} ${distance} м по прямой; предлагаем ${choice.visitMinutes} мин на посещение.`, idea: choice.idea };
  // Translations describe only the category actually proven by this POI's evidence.
  const categoryProven = choice.evidenceIds.some((id) => poi.evidence.some((e) => e.id === id && e.poiId === poi.id && e.field === "category" && e.value === poi.category));
  const why = language === "en"
    ? `${categoryProven ? `The source lists a ${labels.en[poi.category]}. ` : "Source evidence is linked. "}${distance} m in a straight line; suggested visit: ${choice.visitMinutes} min.`
    : `${categoryProven ? `Дереккөздегі санат: ${labels.kk[poi.category]}. ` : "Дереккөз дәлелдері тіркелген. "}Түзу сызықпен ${distance} м; ұсынылған уақыт: ${choice.visitMinutes} мин.`;
  return { why, idea: ideas[language][choice.activity as keyof typeof ideas.en] };
}
