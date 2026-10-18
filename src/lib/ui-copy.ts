import type { Category, Feature, Poi, SearchRequest, SearchResponse } from './types';

export type UiLanguage = 'ru' | 'kk' | 'en';
const ru = {
  explore: 'Исследовать', plan: 'Мой план', queryLabel: 'Ваши планы и пожелания',
  title: 'Куда пойдём сегодня?', intro: 'Расскажите, чего хочется. Найдём интересное поблизости.',
  placeholder: 'Например, прогуляться и выпить кофе…', start: 'Откуда начнём', locate: 'Где я',
  time: 'Сколько есть времени', walking: 'Пешком', return: 'Вернуться к старту', filters: 'Фильтры',
  search: 'Найти своё место', searching: 'Ищем подходящие места', loading: 'Собираем вашу прогулку',
  loadingDetail: 'Ищем места по данным и вашим условиям.', cancel: 'Отменить',
  results: 'Вот что подойдёт', noMatch: 'Не нашли точного совпадения', clarification: 'Нужно уточнение',
  error: 'Поиск не завершён', retry: 'Попробовать ещё раз', details: 'Подробнее', replace: 'Заменить',
  viewPlan: 'Посмотреть план', why: 'Почему эти места', lessTime: 'Времени вдвое меньше',
  noCafe: 'Без кафе', lessWalking: 'Поменьше ходить', indoorsOnly: 'Только внутри помещений',
  reset: 'Новый поиск', context: 'Условия этого поиска', remove: 'Убрать условие',
  budget: 'Бюджет, ₸', strictBudget: 'Строгий бюджет', budgetUnknown: 'Сумма не задана',
  strictHelp: 'Неизвестные цены не подтверждают соблюдение строгого бюджета.',
  language: 'Язык поиска и основных действий', translationNote: 'Названия мест и текст источников сохранены; перевод остальных разделов частичный.',
  confirmedOnly: 'Только подтверждённые условия', confirmedOpen: 'Открыто всё время визита',
  unknownFilter: 'Если сведений нет, место не пройдёт обязательный фильтр.',
  adjust: 'Можно изменить старт или условия. Неподтверждённые сведения не считаются совпадением.',
  relax: 'Посмотреть места без ограничений', airportHelp: 'Нужно отдельно проверить дорогу и прибытие в аэропорт. Spot сейчас считает только пешие прогулки и не обещает успеть на рейс.',
  realSnapshot: 'Данные: сохранённые реальные POI OpenStreetMap', supabase: 'Данные: реальные POI из Supabase',
  demo: 'Демо: без внешних API', live: 'Live: подключённые сервисы', degraded: 'Ограниченный режим',
  template: 'Резервный поиск без генерации', generated: 'Генерация с проверкой фактов',
  lexical: 'Поиск: географический и текстовый', hybrid: 'Поиск: географический, текстовый и векторный',
  privacy: 'Что отправляется и куда', privacyBody: 'Старт и запрос обрабатывает сервер Spot. Внешние API выключены в demo. Если подключён Supabase, он получает параметры поиска. Разрешённый AI-провайдер получает запрос и факты найденных мест без точных координат старта. При включённом пешеходном маршруте точки передаются routing-сервису. Карта загружает тайлы OpenStreetMap, фотографии — с указанного источника.',
  noCoordinates: 'Точные координаты старта не сохраняются в URL, localStorage или истории запросов.',
  evidence: 'Доказательства поиска', evidenceHelp: 'Технические сведения открываются только в демо. Они не содержат точных координат, ключей или скрытых рассуждений.',
  googleMaps: 'Проверить в Google Maps', googleMapsHint: 'Откроется внешний сервис, где можно уточнить часы и посмотреть фото. Эти сведения не импортируются в Spot.',
  startMode:'Когда начинаем',startNow:'Сейчас',startPlanned:'Выбрать дату и время',plannedStart:'Дата и время старта в Астане',startTimeHelp:'Астана · UTC+5. Время не зависит от часового пояса устройства.',invalidStartTime:'Выберите корректные дату и время старта.',effectiveTime:'Старт для расчёта',demoTime:'Демо-время старта',
  journey:'Обязательные этапы',journeyOrdered:'В указанном порядке',journeyAny:'Все этапы обязательны; порядок свободный',journeyComplete:'Все этапы сопоставлены с местами',journeyUnverified:'Подбор этапов не полностью подтверждён',journeyIncomplete:'Не все этапы выполнены',journeyMissing:'Подтверждённое место не подобрано',journeyRouteUnknown:'Пеший путь и общая длительность не подтверждены.',journeyEdit:'Измените запрос, если хотите убрать обязательный этап.',journeyAlternatives:'Места для этапов; маршрут не подтверждён',
};
type Copy = { [K in keyof typeof ru]: string };
const kk: Copy = {
  explore: 'Зерттеу', plan: 'Менің жоспарым', queryLabel: 'Жоспарыңыз бен тілектеріңіз',
  title: 'Бүгін қайда барамыз?', intro: 'Не істегіңіз келетінін айтыңыз. Жақын жерден орын іздейміз.',
  placeholder: 'Мысалы, серуендеп, кофе ішу…', start: 'Қай жерден бастаймыз', locate: 'Мен қайдамын',
  time: 'Қанша уақытыңыз бар', walking: 'Жаяу', return: 'Бастапқы жерге қайту', filters: 'Сүзгілер',
  search: 'Орын табу', searching: 'Орындар ізделуде', loading: 'Серуен жоспары дайындалуда',
  loadingDetail: 'Деректер мен шарттарыңызға сай орындар ізделуде.', cancel: 'Бас тарту',
  results: 'Сай келетін орындар', noMatch: 'Дәл сәйкес орын табылмады', clarification: 'Нақтылау қажет',
  error: 'Іздеу аяқталмады', retry: 'Қайта көру', details: 'Толығырақ', replace: 'Ауыстыру',
  viewPlan: 'Жоспарды көру', why: 'Неліктен осы орындар', lessTime: 'Уақыт екі есе аз',
  noCafe: 'Кафесіз', lessWalking: 'Азырақ жүру', indoorsOnly: 'Тек ғимарат ішінде',
  reset: 'Жаңа іздеу', context: 'Іздеу шарттары', remove: 'Шартты алып тастау',
  budget: 'Бюджет, ₸', strictBudget: 'Қатаң бюджет', budgetUnknown: 'Сома көрсетілмеген',
  strictHelp: 'Бағасы белгісіз болса, қатаң бюджетке сай деп есептелмейді.',
  language: 'Іздеу және негізгі әрекеттер тілі', translationNote: 'Орын атаулары мен дереккөз мәтіндері сақталған; басқа бөлімдер ішінара аударылған.',
  confirmedOnly: 'Тек расталған шарттар', confirmedOpen: 'Сапар бойы ашық',
  unknownFilter: 'Дерек болмаса, орын міндетті сүзгіден өтпейді.',
  adjust: 'Бастау нүктесін не шарттарды өзгертуге болады. Расталмаған дерек сәйкестік деп саналмайды.',
  relax: 'Шектеусіз орындарды көру', airportHelp: 'Әуежайға жол мен келу уақытын бөлек тексеру қажет. Spot қазір тек жаяу серуенді есептейді, рейске үлгеруге кепілдік бермейді.',
  realSnapshot: 'Деректер: OpenStreetMap-тен сақталған нақты орындар', supabase: 'Деректер: Supabase-тегі нақты орындар',
  demo: 'Демо: сыртқы API қолданылмайды', live: 'Live: қосылған қызметтер', degraded: 'Шектеулі режим',
  template: 'Генерациясыз резервтік іздеу', generated: 'Деректері тексерілген генерация',
  lexical: 'Іздеу: географиялық және мәтіндік', hybrid: 'Іздеу: географиялық, мәтіндік және векторлық',
  privacy: 'Қандай деректер қайда жіберіледі', privacyBody: 'Бастау нүктесі мен сұрауды Spot сервері өңдейді. Демо режимінде сыртқы API өшірулі. Supabase қосылған болса, ол іздеу параметрлерін алады. Рұқсат етілген AI провайдері сұрау мен табылған орындар туралы деректерді алады. Бастау нүктесінің дәл координаттары AI-ға жіберілмейді. Жаяу маршрут қосылса, нүктелер маршрут қызметіне беріледі. Карта OpenStreetMap тайлдарын, фотолар көрсетілген дереккөзді қолданады.',
  noCoordinates: 'Дәл координаттар URL, localStorage немесе сұрау тарихында сақталмайды.',
  evidence: 'Іздеу дәлелдері', evidenceHelp: 'Техникалық деректер тек демода ашылады. Дәл координаттар, кілттер және жасырын ойлау тізбегі көрсетілмейді.',
  googleMaps: 'Google Maps арқылы тексеру', googleMapsHint: 'Жұмыс уақытын нақтылап, фотоларды көру үшін сыртқы қызмет ашылады. Бұл деректер Spot жүйесіне көшірілмейді.',
  startMode:'Қашан бастаймыз',startNow:'Қазір',startPlanned:'Күн мен уақытты таңдау',plannedStart:'Астанадағы басталу күні мен уақыты',startTimeHelp:'Астана · UTC+5. Уақыт құрылғының уақыт белдеуіне тәуелді емес.',invalidStartTime:'Басталудың дұрыс күні мен уақытын таңдаңыз.',effectiveTime:'Есепке алынған басталу уақыты',demoTime:'Демодағы басталу уақыты',
  journey:'Міндетті кезеңдер',journeyOrdered:'Көрсетілген ретпен',journeyAny:'Барлық кезең міндетті; реті еркін',journeyComplete:'Барлық кезеңге орындар таңдалды',journeyUnverified:'Кезеңдер толық расталмаған',journeyIncomplete:'Барлық кезең орындалмады',journeyMissing:'Расталған орын таңдалмады',journeyRouteUnknown:'Жаяу жол мен жалпы ұзақтық расталмаған.',journeyEdit:'Міндетті кезеңді алып тастау үшін сұрауды өзгертіңіз.',journeyAlternatives:'Кезеңдерге орындар; маршрут расталмаған',
};
const en: Copy = {
  explore: 'Explore', plan: 'My plan', queryLabel: 'Your plans and preferences',
  title: 'Where shall we go today?', intro: 'Tell us what you would like to do. We will find nearby places.',
  placeholder: 'For example, a walk and a coffee…', start: 'Where to start', locate: 'Locate me',
  time: 'How much time do you have', walking: 'Walking', return: 'Return to start', filters: 'Filters',
  search: 'Find a place', searching: 'Finding suitable places', loading: 'Preparing your walk',
  loadingDetail: 'Searching place data against your conditions.', cancel: 'Cancel',
  results: 'Places that fit', noMatch: 'No confirmed match', clarification: 'More details needed',
  error: 'Search did not finish', retry: 'Try again', details: 'Details', replace: 'Replace',
  viewPlan: 'View plan', why: 'Why these places', lessTime: 'Half the time',
  noCafe: 'No cafés', lessWalking: 'Less walking', indoorsOnly: 'Indoors only',
  reset: 'New search', context: 'Search conditions', remove: 'Remove condition',
  budget: 'Budget, ₸', strictBudget: 'Strict budget', budgetUnknown: 'Amount not set',
  strictHelp: 'Unknown prices do not confirm that a strict budget is met.',
  language: 'Search and main action language', translationNote: 'Place names and source text are preserved; other sections are partly translated.',
  confirmedOnly: 'Confirmed conditions only', confirmedOpen: 'Open for the entire visit',
  unknownFilter: 'Without evidence, a place will not pass a required filter.',
  adjust: 'You can change the start or conditions. Unknown information does not count as a confirmed match.',
  relax: 'See places without restrictions', airportHelp: 'Check the transfer and airport arrival time separately. Spot currently calculates walks only and cannot promise you will catch a flight.',
  realSnapshot: 'Data: saved real OpenStreetMap places', supabase: 'Data: real places from Supabase',
  demo: 'Demo: no external APIs', live: 'Live: connected services', degraded: 'Limited mode',
  template: 'Fallback search without generation', generated: 'Generation with fact validation',
  lexical: 'Search: geographic and text', hybrid: 'Search: geographic, text and vector',
  privacy: 'What is sent and where', privacyBody: 'The Spot server processes your start and query. External APIs are disabled in demo. If Supabase is connected, it receives search parameters. The authorised AI provider receives the query and retrieved facts, without exact starting coordinates. When walking routing is enabled, route points are sent to the routing service. The map loads OpenStreetMap tiles; photographs load from their credited sources.',
  noCoordinates: 'Exact starting coordinates are not stored in URLs, localStorage or query history.',
  evidence: 'Search evidence', evidenceHelp: 'Technical details are shown only in demo. No exact coordinates, keys or hidden reasoning are included.',
  googleMaps: 'Check in Google Maps', googleMapsHint: 'Opens an external service to check hours and view photographs. Those details are not imported into Spot.',
  startMode:'When to start',startNow:'Now',startPlanned:'Choose date and time',plannedStart:'Start date and time in Astana',startTimeHelp:'Astana · UTC+5. Independent of your device timezone.',invalidStartTime:'Choose a valid start date and time.',effectiveTime:'Start time used for calculation',demoTime:'Demo start time',
  journey:'Required stages',journeyOrdered:'In the requested order',journeyAny:'All stages are required; any order',journeyComplete:'All stages are matched to places',journeyUnverified:'Stage selection is not fully verified',journeyIncomplete:'Not all stages are fulfilled',journeyMissing:'No confirmed place selected',journeyRouteUnknown:'The walking route and total duration are unverified.',journeyEdit:'Edit the query to remove a required stage.',journeyAlternatives:'Places for the stages; route unverified',
};
export function uiCopy(language: UiLanguage): Copy { return { ru, kk, en }[language]; }
const categoryLabels: Record<UiLanguage, Record<Category, string>> = {
  ru: { park: 'Парк', cafe: 'Кофейня', museum: 'Музей', landmark: 'Достопримечательность', playground: 'Детская площадка', other: 'Место в городе' },
  kk: { park: 'Саябақ', cafe: 'Кофехана', museum: 'Мұражай', landmark: 'Көрікті жер', playground: 'Балалар алаңы', other: 'Қаладағы орын' },
  en: { park: 'Park', cafe: 'Café', museum: 'Museum', landmark: 'Landmark', playground: 'Playground', other: 'City place' },
};
export function categoryLabel(category: Category, language: UiLanguage): string { return categoryLabels[language][category]; }

export function journeyStageLabel(stage:SearchRequest['journeyStages'][number],language:UiLanguage):string {
  const names={ru:{cafe:'Кофе',park:'Парк',restaurant:'Ресторан'},kk:{cafe:'Кофе',park:'Саябақ',restaurant:'Мейрамхана'},en:{cafe:'Coffee',park:'Park',restaurant:'Restaurant'}}[language];
  const italian={ru:'итальянская кухня',kk:'итальян асханасы',en:'Italian cuisine'}[language];
  return [names[stage.kind],...stage.cuisines.map(cuisine=>cuisine==='italian'?italian:cuisine)].join(' · ');
}

/** Public destination only. Never accepts a user's start, query or credentials. */
export function googleMapsPlaceUrl(poi: Pick<Poi, 'name' | 'address' | 'location'>): string {
  const url=new URL('https://www.google.com/maps/search/');
  const name=poi.name.trim();
  const bounded=(value:string)=>Array.from(value.trim()).slice(0,75).join('');
  const unnamed=!name||/^(?:без\s+названия|unnamed|no\s+name)$/iu.test(name)
    || /\(OSM\s+(?:node|way|relation)\/\d+\)$/iu.test(name);
  const query=unnamed?`${poi.location.latitude},${poi.location.longitude}`
    :[bounded(name),'Астана',poi.address?bounded(poi.address):''].filter(Boolean).join(', ');
  url.searchParams.set('api','1');url.searchParams.set('query',query);
  return url.toString();
}
export function featureLabels(language: UiLanguage): Record<Feature, string> {
  return {
    ru: { outlets: 'Розетка обязательна', wheelchair: 'Доступный вход', indoor: 'В помещении', quiet: 'Подтверждённая тишина' },
    kk: { outlets: 'Розетка міндетті', wheelchair: 'Қолжетімді кіреберіс', indoor: 'Ғимарат ішінде', quiet: 'Расталған тыныштық' },
    en: { outlets: 'Power outlet required', wheelchair: 'Accessible entrance', indoor: 'Indoors', quiet: 'Confirmed quiet place' },
  }[language];
}
export function responseLabels(response: SearchResponse, language: UiLanguage) {
  const copy = uiCopy(language);
  const notRun={ru:'Не запускался',kk:'Орындалмады',en:'Not run'}[language];
  return {
    mode: copy[response.mode],
    data: response.provenance.dataSource === 'supabase' ? copy.supabase : copy.realSnapshot,
    retrieval: /not_run|none|skipped/.test(response.provenance.retrieval) ? notRun : /hybrid|vector/.test(response.provenance.retrieval) ? copy.hybrid : copy.lexical,
    generation: /not_run|none|skipped/.test(response.provenance.generation) ? notRun : /template|disabled|deterministic/.test(response.provenance.generation) ? copy.template : copy.generated,
  };
}

/** Removing a chip also removes its explicit phrase, so extraction cannot add it back. */
export function removeRequirementText(query: string, feature: Feature | 'confirmedOpen' | 'strictBudget'): string {
  const patterns: Record<Feature | 'confirmedOpen' | 'strictBudget', RegExp[]> = {
    outlets: [/(?:розетк[\p{L}]*\s*(?:обязатель[\p{L}]*|нужн[\p{L}]*|необходим[\p{L}]*|керек|міндетті)|(?:обязатель[\p{L}]*|нужн[\p{L}]*|необходим[\p{L}]*)\s*(?:с\s+)?розетк[\p{L}]*)/giu, /(?:must|required|need|mandatory)(?:\s+(?:a|an|the|have|with|power|electric|electrical)){0,4}\s+(?:outlet|socket)|(?:outlet|socket)(?:\s+(?:is|be|must)){0,3}\s+(?:needed|required|mandatory|must)/giu, /розетк[\p{L}]*|outlets?|sockets?/giu],
    indoor: [/только\s+(?:(?:в|внутри)\s+)?помещени[\p{L}]*|только\s+внутри|помещени[\p{L}]*\s+обязатель[\p{L}]*|indoors?\s+only|only\s+indoors?|тек\s+(?:ғимарат\s+)?ішінде/giu],
    quiet: [/тишин[\p{L}]*\s+обязатель[\p{L}]*|обязатель[\p{L}]*\s+тих[\p{L}]*|(?:quiet|silent)\s+(?:is\s+)?(?:required|mandatory)|тыныш[\p{L}]*\s+(?:міндет[\p{L}]*|керек)/giu, /(?:need|required|must)(?:\s+(?:a|the|be)){0,2}\s+(?:quiet|silent)(?:\s+place)?/giu, /quiet|silent|тыныш[\p{L}]*/giu],
    wheelchair: [/доступн[\p{L}\s]{0,18}коляск[\p{L}]*|безбарьер[\p{L}]*|коляск[\p{L}\s]{0,18}обязатель[\p{L}]*|wheelchair\s+(?:access\s+)?required/giu, /wheelchair|мүгедек[\p{L}]*|арбамен/giu],
    confirmedOpen: [/точно\s+открыт[\p{L}]*|подтвержд[её]нно\s+открыт[\p{L}]*|только\s+открыт[\p{L}]*|must\s+be\s+open|open\s+now|ноч[\p{L}]*|night[\p{L}]*|түн[\p{L}]*/giu],
    strictBudget: [/строг[\p{L}]*\s+бюджет[\p{L}]*|бюджет[\p{L}]*\s+строг[\p{L}]*|strict\s+budget|қатаң\s+бюджет|бюджет[\p{L}]*\s+қатаң|не более\s*\d+\s*(?:₸|тенге|kzt|тг)|under\s*\d+\s*kzt/giu],
  };
  return patterns[feature].reduce((text, pattern) => text.replace(pattern, ' '), query).replace(/\s+/g, ' ').trim();
}
