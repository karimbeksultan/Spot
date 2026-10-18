# Spot: требования и доказательства — R2

R2 — проверенная ревизия; экспорт материалов и запись имеют отдельную готовность.

Применяется только первый НИЦ Smart City трек предоставленного PDF, с.1–3 до CampusPulse. Продуктовый master и engineering harness действуют совместно. Требования не заменяются выдуманными технологическими условиями, баллами или весами.

| ID | Требование и источник | Реализация | Приёмка и предел |
| --- | --- | --- | --- |
|SC-01|PDF: концепция и бизнес-идея|concept.md; жители/гости со свободным временем|Польза и аудитория сформулированы; выручка/пользователи не выдуманы, полезность людьми не измерена|
|SC-02|Интерактивный прототип|Карта, контекст, POI, ручной/GPS и плановый старт|Current browser ниже; реальная генерация проверяется отдельно|
|SC-03|Автоматизированный сбор|OSM importer, provenance, stable IDs|2170stored/2165eligible; ограниченное покрытие, remote DB writes0|
|SC-04|Генеративная модель и схема высокого уровня|Local Qwen/Ollama, bounded indices, server facts|Qwen не источник city facts; веса не обучались|
|SC-05|RAG|География, текст, локальные vectors2170x768|Model/version/dimension/hash checks; local actual отдельно; Supabase optional|
|SC-06|Конкретные 1–3 пункта, why, время, действие|Grounded templates, evidence, атомарные stages|До 3 этапов, ALL source cuisine, явный порядок; unknown не снимается скрыто|
|SC-07|Локация, контекст, расстояние, часы|Domain/time/hours/walking|Полные visits, reserve и return; без walking — unverified|
|SC-08|Примерные входы/ответы|Пять PDF сценариев и fixed14 compound|Ожидания/actual разделены; не пять positive и не оценка жюри|
|SC-09|Презентация 5–7 мин: идея, риски, ограничения, развитие|[PPTX R2](spot-pitch-2026-10-18-R2.pptx) и speaker notes|verified: 10 слайдов/8 основных+2 приложения, 684 слова, все рендеры/QA passed; 5–7 минут оценочно, не измеренная репетиция; `presentation-r2-20261018/report.json`|
|SC-10|Этика и приватность|Provenance, unknown, POST, minimal model, UI|Cache5 мин/32vectors и внешние передачи раскрыты; не full pentest|
|SC-11|Репозиторий либо архив|Локальная feature ветка; отдельный `Spot_source_2026-10-18_R2.zip`|verified: actual ZIP integrity/file hashes/limited credential scan passed; текущие safe logs включены, env/runtime/weights исключены; push не выполняется|
|SC-12|Документ сценариев и ограничений|FROZEN MD5d42c648… → готовый PDF_R2|verified: 13 страниц, 42 source-row карточки, 224 поля; render/visual QA passed, PDFb7ec5fa2…; `artifacts/verification/document-r2-20261018/report.json`; R1 сохранён|
|SC-13|Загруженное YouTube демо и ссылка|Загрузка владельцем|pending_owner_upload; OBS после проекта и презентации|
|SC-14|Optional stretch: мини-маршрут, языки, группы, events, доступность|Walking/stages, RU/KK/EN, evidence wheelchair|Partial: нет events/CV/group optimizer, полного перевода и гарантии безбарьерности|
|ENG-01|Исполняемые doctor/verify/eval/smoke|scripts/harness, CI, no-spend isolation|SHA+dirty code digest, exit codes; документы/артефакты проверяются отдельно|
|ENG-02|OpenAI/NVIDIA GLM, ключи позже, ограниченный бюджет|Optional adapters, ledger, expiry, request cap|Mocked only, live not_run, paid0; не блокер local core|
|R2-01|Улучшить составные запросы|Journey, source facts, атомарный planner|Same14 BEFORE5→AFTER14; input/assertions сохранены; не human quality score|
|R2-02|Проверить latency|Compact prompt v4, chat4threads, query-vector cache|Microbenchmark отделён от actual search; нет гарантии ускорения каждого запроса|
|DATA-01|Больше мест, часов, адресов, фото|Scoped OSM extension, operator research, Maps link|Фото 14/60 не увеличивались; operator facts не слиты, unknown license не импортируется|
|NA-01|Второй CampusPulse трек|Не применяется|MCP/GCP/Gemini/deploy из него не становятся требованиями Spot|

Сохранено и проиндексировано **2170 OSM POI**; в runtime допускаются **2165**. Пять записей с явным другим городом Косшы/Қосшы помещены в карантин без удаления payloads/векторов. Допустимые категории: 354 кафе, 179 парков/садов, 346 площадок, 72 landmarks, 8 музеев, 1206 other, включая скамейки и исходные типы ресторанов. В допустимом наборе 337 расписаний и 190 адресов, у 14 мест 60 лицензированных фото; подтверждённых розеток и цен нет. В сохранённом наборе 338 расписаний/195 адресов. Это ограниченное покрытие OSM, не полный каталог города и не проверенная административная граница для объектов без addr:city.

Code digest: `906ae60d3bf0843f6bc6eb09f5605e4c66dc81e0796bff1baf45099d39e9957b`. Core verify R2 PASS: artifacts/verification/2026-10-18T18-12-20-902Z-22916-verify/report.json, все 8 шагов exit0: lint/typecheck/unit/data/snapshot/eval/build/smoke.265 unit в 21 файле, snapshot18/18, обычный eval10/10 (4development+6acceptance), data2170, smoke3 шага. Code digest906ae60d…9957b стабилен до/после; applicationFilesChangedDuringChecks=false. Eval/smoke выполнялись без сети и платных запросов.

Browser R2 PASS: artifacts/verification/browser-r2-summary-20261018.json и raw browser-r2-20261018.json, exit0,38/38,0skipped/unexpected/flaky,356131.285ms; source digest906ae60d…9957b стабилен. Production localhost:3000, APP_MODE=demo;8context+8planned-journey+5data-limits+5photo+12app. Context/photo/planned-journey используют явно отмеченные UI fixtures (включая synthetic walking legs); app suite использует реальный demo snapshot. Ни local, ни cloud generation этим browser прогоном не проверяются.

Фактически выполнены 3 составных local запроса: B40 мин/возврат — no_match за 15.506 с, все 3 полные попытки исключены по time_budget; The Garden → Парк защитников Отечества G90 мин — complete,58 мин за 13.393 с; отдельный разрешённый B60 мин/возврат — Canele → Ботанический сад, complete,43 мин за 11.672 с. Это 2 положительных маршрута и 1 честный отказ; исходный two-case runner завершился exit1 из-за ошибочного ожидания положительного 40 мин ответа, raw ошибка сохранена. Receipt artifacts/verification/local-compound-r2-20261018/summary.json; source/data unchanged. Всего 3 loopback embedding +3 chat +5 Valhalla requests, paid0/training=false. Замеры относятся к actualSearchElapsedMs, без последующих assertions/hash checks; cold model load включён, warm path не измерен.

Doctor R2 PASS: artifacts/verification/2026-10-18T18-16-24-293Z-30204-doctor/report.json, network0; ключи не читались и endpoints не вызывались. Security R2 PASS: artifacts/verification/security-r2-20261018/report.json,5 scoped source/bundle/privacy checks, credential patterns0, тот же 906ae60d…digest; это ограниченный scan, не pentest. WEATHER R2 PASS: artifacts/verification/weather-r2-20261018/report.json, recommendations3 кафе и предупреждение о неподключённой погоде, network0/paid0, тот же digest.

Зафиксированное сравнение: **5/14 BEFORE → 14/14 AFTER** по одним и тем же 14 запросам, публичным точкам, часам и семантическим assertions. AFTER networkAttempts=0, paidRequests=0; sourceUnchanged=true. Receipt: `artifacts/verification/quality-r2-20261018/after.json`, исходный BEFORE: `before.json`, его SHA256 `b7e7defed44af0f08529780a6e761d6629c6318d36fa7163124a100fba0e46af`. Это детерминированная приёмка небольшой выборки, без LLM judge, человеческой оценки, балла 8–9 или гарантии top-10.


Семь критериев и карта слайдов — `FINAL_CRITERIA_REVIEW.md`. Acceptance R2 не была невиданной скрытой выборкой. PDF/PPTX/архив/запись имеют отдельную готовность; успешный код не означает официальную сдачу без owner YouTube ссылки.
