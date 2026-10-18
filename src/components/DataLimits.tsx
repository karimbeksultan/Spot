'use client';

import {useEffect,useRef} from 'react';
import {ArrowLeft,ExternalLink,ShieldCheck} from 'lucide-react';
import type {UiLanguage} from '@/lib/ui-copy';

/** Public metadata for the dated snapshot; the POI corpus stays on the server. */
export const DATA_SNAPSHOT={date:'2026-10-18',stored:2170,eligible:2165,quarantined:5} as const;
const ru={
  title:'Данные и ограничения',back:'К поиску',language:'Язык информации',lead:'Что уже работает, откуда сведения и что стоит проверить перед прогулкой.',
  snapshot:'Снимок данных от 18 октября 2026',eligible:'Доступны для поиска',stored:'Сохранены в корпусе',quarantine:'Исключены из выдачи',
  scope:'5 записей с явным указанием другого города помещены в карантин. Исходники и векторы сохранены. Этот снимок не является полным каталогом Астаны.',
  sources:'Откуда данные',osm:'OpenStreetMap: места, категории и доступные теги. © OpenStreetMap contributors, ODbL.',commons:'Wikimedia Commons: у каждой фотографии своя лицензия, автор и ссылка в карточке. Наличие снимка не подтверждает сегодняшнее состояние места.',
  sourcesNote:'Время загрузки источника не означает, что место проверили в этот день. Названия и описания источников могут быть на другом языке.',
  ai:'Как работает подбор',aiBody:'Локальный RAG использует индекс embeddinggemma и Qwen3:0.6b. Модель ранжирует найденных кандидатов; сервер связывает ID и доказательства, проверяет условия и время. Веса модели не обучались на этом каталоге.',
  modes:'В demo генерация и внешние AI API отключены. Live может использовать локальную Qwen. При сбое виден ограниченный режим с проверяемым резервным подбором. Облачные OpenAI и NVIDIA/GLM — дополнительные адаптеры: нужны локальные ключи, явное разрешение и бюджет.',
  unknown:'Что остаётся неизвестным',unknownBody:'Часы могут быть неполными или устаревшими. Неизвестные розетки, тишина и цены не считаются подтверждёнными. Обязательный фильтр исключает такие варианты; неизвестная цена не доказывает соблюдение строгого бюджета.',
  route:'Пеший маршрут показывается только после расчёта walking-сервисом. Без него остаются альтернативы и расстояние по прямой; общая длительность и возврат не подтверждены. Даже рассчитанное время остаётся оценкой.',
  missing:'Актуальная погода, проверенные события и трансфер в аэропорт сейчас не подключены. Запрос перед вылетом требует уточнения и отдельной проверки дороги. CV-поиск и обучение моделей остаются вне текущего прототипа.',
  planning:'Spot рассчитан на короткий план из 1–3 мест, без планирования всего дня и бронирования. Для нескольких обязательных этапов показаны порядок и сопоставление с местами; смотрите статус подтверждения и маршрут. Время старта можно выбрать явно в часовом поясе Астаны UTC+5; фактическое время расчёта показано в результате.',
  privacy:'Приватность и внешние сервисы',privacyBody:'Геолокация включается по действию; старт можно выбрать вручную. Координаты поиска передаются серверу в POST, не в URL. Приложение не сохраняет историю запросов и перемещений в БД или localStorage. AI-контекст минимизирован и не включает точный старт.',
  external:'Карта и фотографии загружаются из внешних источников. При включённом routing координаты пути получает маршрутный сервис. Supabase получает параметры только при подключении. Платные облачные вызовы по умолчанию запрещены.',
  maps:'Кнопка Google Maps открывает внешний поиск публичного места без передачи пользовательского старта и без API-ключа. Часы и фото можно проверить там. Каталог Google не копируется в Spot и не используется для обучения.',
  accessibility:'Доступность интерфейса и мест',accessibilityBody:'В интерфейсе есть список рядом с картой, клавиатурные действия, подписи полей, видимый фокус и поддержка reduced motion. Эти возможности не подтверждают доступность всех мест. Вход для коляски считается подходящим только при подтверждённом признаке; неизвестность остаётся неизвестностью.',
  translation:'Основные действия и этот раздел доступны на RU/KK/EN. Остальные разделы переведены частично; качество казахского ещё требует проверки носителем.',
  next:'Перед выходом',nextBody:'Откройте карточку и источник. Уточните важные часы, цену и доступность у самого места. Расчёт маршрута не гарантирует безопасность, проходы или одинаковую скорость для всех.',
};
type Copy={ [K in keyof typeof ru]:string };
const kk:Copy={
  title:'Деректер мен шектеулер',back:'Іздеуге қайту',language:'Ақпарат тілі',lead:'Не жұмыс істейді, деректер қайдан алынған және серуен алдында нені тексеру керек.',
  snapshot:'2026 жылғы 18 қазандағы деректер жиынтығы',eligible:'Іздеуге қолжетімді',stored:'Корпуста сақталған',quarantine:'Нәтижеден шығарылған',
  scope:'Басқа қала көрсетілген 5 жазба карантинге қойылды. Бастапқы деректер мен векторлар сақталған. Бұл — Астанадағы барлық орындардың толық каталогы емес.',
  sources:'Деректер қайдан алынды',osm:'OpenStreetMap: орындар, санаттар және қолжетімді тегтер. © OpenStreetMap contributors, ODbL.',commons:'Wikimedia Commons: әр фотоның лицензиясы, авторы мен сілтемесі карточкада көрсетілген. Фото орынның бүгінгі жағдайын растамайды.',
  sourcesNote:'Деректі жүктеу күні орынды сол күні тексергенін білдірмейді. Дереккөз атауы мен сипаттамасы басқа тілде болуы мүмкін.',
  ai:'Орындар қалай таңдалады',aiBody:'Жергілікті RAG embeddinggemma индексі мен Qwen3:0.6b моделін қолданады. Модель табылған нұсқаларды реттейді; сервер ID мен дәлелдерді байланыстырып, шарттар мен уақытты тексереді. Модель салмақтары осы каталогта үйретілген жоқ.',
  modes:'Demo режимінде генерация мен сыртқы AI API өшірулі. Live жергілікті Qwen моделін қолдана алады. Ақау болса, тексерілетін резервтік іздеу бар шектеулі режим көрсетіледі. OpenAI және NVIDIA/GLM — қосымша адаптерлер: жергілікті кілттер, нақты рұқсат пен бюджет қажет.',
  unknown:'Қандай мәліметтер белгісіз',unknownBody:'Жұмыс уақыты толық емес не ескірген болуы мүмкін. Белгісіз розетка, тыныштық пен баға расталған деп саналмайды. Міндетті сүзгі мұндай нұсқаларды алып тастайды; белгісіз баға қатаң бюджетке сай келетінін дәлелдемейді.',
  route:'Жаяу маршрут walking қызметі есептегенде ғана көрсетіледі. Онсыз баламалар мен түзу сызық бойындағы қашықтық беріледі; жалпы ұзақтық пен қайту уақыты расталмайды. Есептелген уақыт та болжам болып қалады.',
  missing:'Ағымдағы ауа райы, расталған іс-шаралар және әуежайға трансфер қазір қосылмаған. Ұшу алдындағы сұрау нақтылауды және жолды бөлек тексеруді қажет етеді. CV іздеуі мен модельдерді үйрету қазіргі прототипке кірмейді.',
  planning:'Spot 1–3 орыннан тұратын қысқа жоспарға арналған; толық күнді жоспарлау мен брондау жоқ. Бірнеше міндетті кезеңнің реті және орындарға сәйкестігі көрсетіледі; растау күйі мен маршрутқа назар аударыңыз. Басталу уақытын Астананың UTC+5 белдеуінде таңдауға болады; есепке алынған уақыт нәтижеде көрсетіледі.',
  privacy:'Құпиялылық және сыртқы қызметтер',privacyBody:'Геолокация әрекетіңіз бойынша қосылады; бастау нүктесін қолмен таңдауға болады. Іздеу координаттары серверге URL арқылы емес, POST ішінде беріледі. Қосымша сұрау мен қозғалыс тарихын дерекқорда немесе localStorage ішінде сақтамайды. AI контексті қысқартылған және дәл бастау нүктесін қамтымайды.',
  external:'Карта мен фотолар сыртқы дереккөздерден жүктеледі. Routing қосылса, маршрут нүктелері маршрут қызметіне беріледі. Supabase қосылғанда ғана параметрлерді алады. Ақылы бұлттық сұраулар әдепкіде тыйым салынған.',
  maps:'Google Maps батырмасы пайдаланушының бастау нүктесін жібермей және API кілтінсіз қоғамдық орынды сыртқы іздеуде ашады. Жұмыс уақыты мен фотоларды сонда тексеруге болады. Google каталогы Spot жүйесіне көшірілмейді және модель үйретуге қолданылмайды.',
  accessibility:'Интерфейс пен орындардың қолжетімділігі',accessibilityBody:'Интерфейсте картаға балама тізім, пернетақта әрекеттері, өріс атаулары, көрінетін фокус және reduced motion қолдауы бар. Бұлар барлық орынның қолжетімділігін растамайды. Арбаға арналған кіреберіс тек расталған белгі болса ғана сәйкес деп саналады; белгісіз мәлімет белгісіз болып қалады.',
  translation:'Негізгі әрекеттер мен осы бөлім RU/KK/EN тілдерінде бар. Басқа бөлімдер ішінара аударылған; қазақша мәтінді тіл маманы әлі тексеруі керек.',
  next:'Сыртқа шығар алдында',nextBody:'Карточка мен дереккөзді ашыңыз. Маңызды жұмыс уақытын, бағаны және қолжетімділікті орынның өзінен нақтылаңыз. Маршрут есебі қауіпсіздікке, өткелдерге немесе барлығына бірдей жылдамдыққа кепілдік бермейді.',
};
const en:Copy={
  title:'Data and limitations',back:'Back to search',language:'Information language',lead:'What works, where the information comes from and what to check before a walk.',
  snapshot:'Dataset snapshot: 18 October 2026',eligible:'Eligible for search',stored:'Stored in the corpus',quarantine:'Excluded from results',
  scope:'5 records explicitly name another city and are quarantined. Source records and vectors are retained. This snapshot is not a complete catalogue of Astana.',
  sources:'Where the data comes from',osm:'OpenStreetMap: places, categories and available tags. © OpenStreetMap contributors, ODbL.',commons:'Wikimedia Commons: each photograph has its own licence, author and source link in the place card. A photograph does not confirm the current state of a place.',
  sourcesNote:'The download date does not mean someone checked the place that day. Source names and descriptions may use another language.',
  ai:'How recommendations work',aiBody:'Local RAG uses an embeddinggemma index and Qwen3:0.6b. The model ranks retrieved candidates; the server binds IDs and evidence, then checks conditions and time. Model weights were not trained on this catalogue.',
  modes:'Demo disables generation and external AI APIs. Live can use local Qwen. Failures show a limited mode with verifiable fallback selection. OpenAI and NVIDIA/GLM are optional adapters requiring local keys, explicit permission and a budget.',
  unknown:'What is still unknown',unknownBody:'Opening hours may be incomplete or outdated. Unknown power outlets, quietness and prices are not confirmed facts. Required filters exclude unconfirmed matches; an unknown price cannot establish that a strict budget is met.',
  route:'Walking routes appear only after calculation by a walking service. Without it, results are alternatives and straight-line distances; total time and the return are unverified. Calculated times remain estimates.',
  missing:'Current weather, verified events and airport transfers are not connected. A pre-flight query needs clarification and a separate transfer check. CV search and model training are outside this prototype.',
  planning:'Spot supports a short plan of 1–3 places, without whole-day planning or bookings. Required stages show their order and matched places; check the verification status and route. You can explicitly choose a start time in Astana UTC+5; the effective time used is shown in the result.',
  privacy:'Privacy and external services',privacyBody:'Geolocation requires your action; you can choose a start manually. Search coordinates go to the server in POST, not in URLs. The app does not store query or movement history in the database or localStorage. AI context is minimised and excludes the exact start.',
  external:'Map tiles and photographs load from external sources. When routing is enabled, the routing service receives route points. Supabase receives parameters only when connected. Paid cloud calls are blocked by default.',
  maps:'The Google Maps button opens an external search for the public place without your starting point or an API key. You can check hours and photographs there. Google catalogue content is not copied into Spot or used for training.',
  accessibility:'Interface and venue accessibility',accessibilityBody:'The interface provides a list beside the map, keyboard actions, field labels, visible focus and reduced motion support. These features do not establish that every venue is accessible. Wheelchair access counts only with confirmed evidence; unknown information stays unknown.',
  translation:'Main actions and this section are available in RU/KK/EN. Other sections are partly translated; Kazakh wording still needs a native speaker review.',
  next:'Before you leave',nextBody:'Open the place card and its source. Confirm important hours, prices and access with the venue. Route calculations do not guarantee safety, open passages or the same speed for everyone.',
};
export function dataLimitsCopy(language:UiLanguage):Copy{return {ru,kk,en}[language];}
export default function DataLimits({language,onLanguageChange,onBack}:{language:UiLanguage;onLanguageChange:(language:UiLanguage)=>void;onBack:()=>void}){
  const copy=dataLimitsCopy(language);const heading=useRef<HTMLHeadingElement>(null);
  useEffect(()=>{heading.current?.focus({preventScroll:true});},[]);
  return <section className="data-limits" aria-labelledby="data-limits-title" lang={language}>
    <button className="text-button data-back" onClick={onBack}><ArrowLeft size={17}/>{copy.back}</button>
    <h1 id="data-limits-title" ref={heading} tabIndex={-1}>{copy.title}</h1><p className="data-lead">{copy.lead}</p>
    <div className="language-control"><label htmlFor="data-language">{copy.language}</label><select id="data-language" value={language} onChange={event=>onLanguageChange(event.target.value as UiLanguage)}><option value="ru">Русский</option><option value="kk">Қазақша</option><option value="en">English</option></select></div>
    <p className="data-date">{copy.snapshot}</p><dl className="data-counts"><div><dt>{copy.eligible}</dt><dd>{DATA_SNAPSHOT.eligible.toLocaleString(language)}</dd></div><div><dt>{copy.stored}</dt><dd>{DATA_SNAPSHOT.stored.toLocaleString(language)}</dd></div><div><dt>{copy.quarantine}</dt><dd>{DATA_SNAPSHOT.quarantined}</dd></div></dl><p>{copy.scope}</p>
    <section><h2>{copy.sources}</h2><p>{copy.osm}</p><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap / ODbL<ExternalLink size={12}/></a><p>{copy.commons}</p><a href="https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia" target="_blank" rel="noopener noreferrer">Wikimedia Commons<ExternalLink size={12}/></a><p>{copy.sourcesNote}</p></section>
    <section><h2>{copy.ai}</h2><p>{copy.aiBody}</p><p>{copy.modes}</p></section>
    <section><h2>{copy.unknown}</h2><p>{copy.unknownBody}</p><p>{copy.route}</p><p>{copy.missing}</p><p>{copy.planning}</p></section>
    <section><h2><ShieldCheck size={18}/>{copy.privacy}</h2><p>{copy.privacyBody}</p><p>{copy.external}</p><p>{copy.maps}</p></section>
    <section><h2>{copy.accessibility}</h2><p>{copy.accessibilityBody}</p><p>{copy.translation}</p></section>
    <section><h2>{copy.next}</h2><p>{copy.nextBody}</p></section>
  </section>;
}
