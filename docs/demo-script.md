# Spot: сценарий демонстрации и защиты — R2

R2 — проверенная ревизия; экспорт материалов и запись имеют отдельную готовность.

Сначала завершить проект, проверки и настоящую презентацию; OBS/запись — после этого. YouTube=`pending_owner_upload`. Использовать публичные тестовые старты, скрыть ключи и личные окна, явно назвать demo или local режим.

## Перед показом

1. Проверить текущие receipts ниже, запущенную Ollama и свободную RAM. Повторно не скачивать модели без необходимости.
2. Для demo выполнить `npm run demo`; для local — `npm run local` после build. Local удаляет cloud credentials и отключает failover. Без walking полный пеший бюджет не подтверждён.
3. Для позитивного составного показа использовать фактически проверенный B/60 мин/возврат либо G/90 мин/18:00. Плановый старт — Астана UTC+5. Замороженное время не выдавать за «сейчас».

| Шаг | Действие | Что сказать |
| --- | --- | --- |
|1|Кафе → парк, B,60 мин, возврат|В актуальном local receipt Canele → Ботанический сад,43 мин. Это расчёт, не фактическая прогулка|
|2|Показать 40 мин с теми же обязательными этапами|Три полные комбинации не поместились: no_match. Не выдавать это за положительный маршрут|
|3|Итальянский ресторан с пиццей → парк, G,90 мин|The Garden → Парк защитников Отечества,58 мин; source type/cuisine, без обещания блюда, столика или обслуживания за 25 мин|
|4|Продолжение «только парк»|Явное изменение заменяет этапы; остальные условия видны и проверяются повторно|
|5|Розетка обязательна / запрос бронирования|Unknown даёт no_match; бронирование — clarification, без выполнения покупки/брони|
|6|Открыть источник, фото/privacy и Maps|Конкретный источник, лицензия либо заглушка; Maps получает только публичный POI|

В demo отсутствие walking означает unverified alternatives, даже когда обе категории найдены. Не объявлять demo живой моделью. Пять PDF примеров включают три ограничения/уточнения; не обещать пять положительных ответов.

## Основная речь

| Слайд / время | Мысль |
| --- | --- |
|1·0:00–0:25|Spot: короткий план рядом с выбранным стартом Астаны|
|2·0:25–1:05|Жители и гости с небольшим свободным промежутком; полезность людьми ещё не измерена|
|3·1:05–1:55|Фактический режим, clock, все этапы, why и время; источник и оценка различаются|
|4·1:55–2:40|2170 сохранено,2165 допустимо; provenance и неполные часы/фото|
|5·2:40–3:30|RAG → Qwen indices → server stages/evidence → walking; training=false|
|6·3:30–4:20|Явное изменение контекста, planned start, RU/KK/EN, атомарный отказ|
|7·4:20–5:20|Неполные данные → unknown/source; CPU → компактный контракт/лимиты/cache; приватность → ручной старт/minimal context; остаточные риски остаются|
|8·5:20–6:05|Фактические проверки и материалы, следующие шаги source/human validation, честный YouTube статус|

Это план темпа 5–7 мин, не измеренная репетиция. Приложение 9 — receipts и scope;10 — права/источники/privacy. Не говорить «8–9 баллов», «точно top-10», «production p95» или «модель выучила город». Fixed14 BEFORE5→AFTER14 — детерминированные assertions, а microbenchmark отличается от времени полного приложения.

Code digest: `906ae60d3bf0843f6bc6eb09f5605e4c66dc81e0796bff1baf45099d39e9957b`. Core verify R2 PASS: artifacts/verification/2026-10-18T18-12-20-902Z-22916-verify/report.json, все 8 шагов exit0: lint/typecheck/unit/data/snapshot/eval/build/smoke.265 unit в 21 файле, snapshot18/18, обычный eval10/10 (4development+6acceptance), data2170, smoke3 шага. Code digest906ae60d…9957b стабилен до/после; applicationFilesChangedDuringChecks=false. Eval/smoke выполнялись без сети и платных запросов.

Browser R2 PASS: artifacts/verification/browser-r2-summary-20261018.json и raw browser-r2-20261018.json, exit0,38/38,0skipped/unexpected/flaky,356131.285ms; source digest906ae60d…9957b стабилен. Production localhost:3000, APP_MODE=demo;8context+8planned-journey+5data-limits+5photo+12app. Context/photo/planned-journey используют явно отмеченные UI fixtures (включая synthetic walking legs); app suite использует реальный demo snapshot. Ни local, ни cloud generation этим browser прогоном не проверяются.

Фактически выполнены 3 составных local запроса: B40 мин/возврат — no_match за 15.506 с, все 3 полные попытки исключены по time_budget; The Garden → Парк защитников Отечества G90 мин — complete,58 мин за 13.393 с; отдельный разрешённый B60 мин/возврат — Canele → Ботанический сад, complete,43 мин за 11.672 с. Это 2 положительных маршрута и 1 честный отказ; исходный two-case runner завершился exit1 из-за ошибочного ожидания положительного 40 мин ответа, raw ошибка сохранена. Receipt artifacts/verification/local-compound-r2-20261018/summary.json; source/data unchanged. Всего 3 loopback embedding +3 chat +5 Valhalla requests, paid0/training=false. Замеры относятся к actualSearchElapsedMs, без последующих assertions/hash checks; cold model load включён, warm path не измерен.

Doctor R2 PASS: artifacts/verification/2026-10-18T18-16-24-293Z-30204-doctor/report.json, network0; ключи не читались и endpoints не вызывались. Security R2 PASS: artifacts/verification/security-r2-20261018/report.json,5 scoped source/bundle/privacy checks, credential patterns0, тот же 906ae60d…digest; это ограниченный scan, не pentest. WEATHER R2 PASS: artifacts/verification/weather-r2-20261018/report.json, recommendations3 кафе и предупреждение о неподключённой погоде, network0/paid0, тот же digest.

Зафиксированное сравнение: **5/14 BEFORE → 14/14 AFTER** по одним и тем же 14 запросам, публичным точкам, часам и семантическим assertions. AFTER networkAttempts=0, paidRequests=0; sourceUnchanged=true. Receipt: `artifacts/verification/quality-r2-20261018/after.json`, исходный BEFORE: `before.json`, его SHA256 `b7e7defed44af0f08529780a6e761d6629c6318d36fa7163124a100fba0e46af`. Это детерминированная приёмка небольшой выборки, без LLM judge, человеческой оценки, балла 8–9 или гарантии top-10.


Неполные часы/адреса/фото/удобства, OSM freshness и bounded grammar остаются ограничениями. Текстовый parser берёт первое упоминание каждого типа cafe/park/restaurant: повтор одного типа в нескольких остановках и произвольное название блюда без явного restaurant не являются проверенными сценариями. Теги ресторана/кухни не подтверждают актуальное меню, наличие конкретного блюда, свободный столик, длительность обслуживания или санитарное состояние. Бронирование, аэропортовый трансфер, forecast/events/CV, all-day itinerary и групповой оптимизатор не реализованы. Пешее время — оценка; безопасность/безбарьерность/прибытие к рейсу не гарантируются. RU/KK/EN основные действия и отдельные запросы не равны полному переводу или экспертной языковой оценке. Независимого исследования полезности с людьми нет.

После проекта и PPTX проверить локальную запись целиком: экран, звук, читабельность, режимы, отсутствие секретов. Computer-use skill рассмотрен и инициализирован ранее; это не выполненная запись. Владелец загружает YouTube и проверяет доступность ссылки жюри; до этого публикация не объявляется.
