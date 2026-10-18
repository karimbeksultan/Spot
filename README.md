# Spot

**Астана за твоё время.** Локальный помощник: реальные места возле выбранного старта, условия, источники и короткий план при наличии рассчитанного пешего пути. Первый трек НИЦ Smart City, Build with AI; второй трек не применяется.

R2 — проверенная ревизия; экспорт материалов и запись имеют отдельную готовность.

Сохранено и проиндексировано **2170 OSM POI**; в runtime допускаются **2165**. Пять записей с явным другим городом Косшы/Қосшы помещены в карантин без удаления payloads/векторов. Допустимые категории: 354 кафе, 179 парков/садов, 346 площадок, 72 landmarks, 8 музеев, 1206 other, включая скамейки и исходные типы ресторанов. В допустимом наборе 337 расписаний и 190 адресов, у 14 мест 60 лицензированных фото; подтверждённых розеток и цен нет. В сохранённом наборе 338 расписаний/195 адресов. Это ограниченное покрытие OSM, не полный каталог города и не проверенная административная граница для объектов без addr:city.

Составной запрос поддерживает до трёх обязательных этапов cafe/park/restaurant. Явное «затем» задаёт порядок; AND требует все названные этапы, OR остаётся альтернативами. Ресторан подтверждается исходным amenity=restaurant и связанным evidence, кухня — точными source-токенами и evidence для каждого запрошенного значения. Модель не выводит кухню из названия. Неизвестная кухня/обязательное удобство не заменяются случайным местом. Указанные 5 минут сохраняются, а не повышаются скрыто.

Предлагаемые посещения составного плана: кафе 8 мин, парк 10 мин, ресторан 25 мин. Это плановые значения, а не измеренная очередь/обслуживание. Сервер проверяет полные комбинации, не больше трёх walking попыток, часы на прибытие и весь визит, резерв 5 мин и возврат. Если полный набор не помещается или один этап не подходит, успешный поднабор не выдаётся. Отбор ограничен несколькими комбинациями и не гарантирует оптимальный маршрут или отсутствие иного подходящего плана в городе. Координаты POI могут быть центрами геометрии, а не проверенными входами; привязка маршрутизатора к графу не подтверждает фактическую доступность входа. Без рассчитанного walking обе остановки могут показываться только как непроверенные варианты: journey=unverified, общая длительность=null, линия готового маршрута отсутствует.

## Запуск без платных API

Нужны Node.js22+ и npm. Проверенная версия публикуется в ветке `codex/spot-contract-harness`; `main` не изменяется. Используйте этот checkout либо исходный архив R2. Установочные инструкции сторонних skills остаются локально и не входят в Git-публикацию; исполняемые файлы приложения совпадают с проверенной версией.

```text
npm ci
npm run doctor
npm run verify
npm run demo
```

Открыть http://127.0.0.1:3000. Demo использует реальный snapshot и детерминированные шаблоны, не вызывает generation/embedding/DB/routing. Это не свидетельство живого RAG; карта и удалённые фото требуют сети.

Для основного local RAG нужны запущенная Ollama, готовые `qwen3:0.6b` и `embeddinggemma`; затем после production build выполнить `npm run local`. На этом ноутбуке portable runtime/модели уже лежат в ignored work; новый архив не содержит бинарники и веса. Скрипты `scripts/start-local-models.ps1` / `stop-local-models.ps1` управляют только подготовленным runtime; стартер проверяет свободную RAM и требует явного разрешения для первого создания стандартного домашнего ключа Ollama. В текущем сеансе такая запись уже разрешена.

Индекс 2170x768 embeddinggemma/version1 включён в проект. `npm run data:index-local -- --dry-run` показывает план без embedding вызовов; обычный запуск индексирует разрешённые данные локально. Это RAG и индексация, **не обучение весов Qwen**. Изменение embedding-модели/версии/документа требует совместимой переиндексации.

Local prompt v4 ограничивает модель номерами shortlist; сервер связывает source IDs/evidence, строит фактические объяснения и сохраняет обязательные этапы. Chat использует 4 CPU threads; embedding2. В памяти процесса до 32 query-векторов на 5 мин по SHA256(query+embedding spec), без сырых запросов/точного старта/сохранения на диск. Кэш не содержит ответов модели и не отменяет повторную проверку ограничений.

По умолчанию текущий старт — сейчас; плановый datetime трактуется интерфейсом как время Астаны UTC+5 и отправляется с явным offset. Это региональная договорённость прототипа, не универсальный timezone planner. Точный старт в будущем не гарантирует актуальность часов.

`npm run local` удаляет cloud credentials из дочернего окружения и выключает cloud failover. `ROUTING_ENABLED=false` отключает передачу координат Valhalla; без него полный пеший бюджет не подтверждён. Тайлы/фото/Maps являются отдельными внешними обращениями. Google Maps открывается только по нажатию: публичный POI, без личного старта и копирования каталога/отзывов/фото в RAG.

Supabase включается только по явному opt-in. Историческая БД 98 POI не означает, что нынешние 2170 загружены в облако; в текущей работе remote DB writes=0. OpenAI и NVIDIA/GLM — выключенные optional adapters. Ключ сам по себе не разрешает платный запрос: нужны согласие, срок, run/day budget и request cap. Платные live запросы не выполнялись и для local core не требуются. См. [границы провайдеров](docs/PROVIDER_CAPABILITIES.md).

## Фактические проверки

Code digest: `906ae60d3bf0843f6bc6eb09f5605e4c66dc81e0796bff1baf45099d39e9957b`. Core verify R2 PASS: artifacts/verification/2026-10-18T18-12-20-902Z-22916-verify/report.json, все 8 шагов exit0: lint/typecheck/unit/data/snapshot/eval/build/smoke.265 unit в 21 файле, snapshot18/18, обычный eval10/10 (4development+6acceptance), data2170, smoke3 шага. Code digest906ae60d…9957b стабилен до/после; applicationFilesChangedDuringChecks=false. Eval/smoke выполнялись без сети и платных запросов.

Browser R2 PASS: artifacts/verification/browser-r2-summary-20261018.json и raw browser-r2-20261018.json, exit0,38/38,0skipped/unexpected/flaky,356131.285ms; source digest906ae60d…9957b стабилен. Production localhost:3000, APP_MODE=demo;8context+8planned-journey+5data-limits+5photo+12app. Context/photo/planned-journey используют явно отмеченные UI fixtures (включая synthetic walking legs); app suite использует реальный demo snapshot. Ни local, ни cloud generation этим browser прогоном не проверяются.

Фактически выполнены 3 составных local запроса: B40 мин/возврат — no_match за 15.506 с, все 3 полные попытки исключены по time_budget; The Garden → Парк защитников Отечества G90 мин — complete,58 мин за 13.393 с; отдельный разрешённый B60 мин/возврат — Canele → Ботанический сад, complete,43 мин за 11.672 с. Это 2 положительных маршрута и 1 честный отказ; исходный two-case runner завершился exit1 из-за ошибочного ожидания положительного 40 мин ответа, raw ошибка сохранена. Receipt artifacts/verification/local-compound-r2-20261018/summary.json; source/data unchanged. Всего 3 loopback embedding +3 chat +5 Valhalla requests, paid0/training=false. Замеры относятся к actualSearchElapsedMs, без последующих assertions/hash checks; cold model load включён, warm path не измерен.

Doctor R2 PASS: artifacts/verification/2026-10-18T18-16-24-293Z-30204-doctor/report.json, network0; ключи не читались и endpoints не вызывались. Security R2 PASS: artifacts/verification/security-r2-20261018/report.json,5 scoped source/bundle/privacy checks, credential patterns0, тот же 906ae60d…digest; это ограниченный scan, не pentest. WEATHER R2 PASS: artifacts/verification/weather-r2-20261018/report.json, recommendations3 кафе и предупреждение о неподключённой погоде, network0/paid0, тот же digest.

Зафиксированное сравнение: **5/14 BEFORE → 14/14 AFTER** по одним и тем же 14 запросам, публичным точкам, часам и семантическим assertions. AFTER networkAttempts=0, paidRequests=0; sourceUnchanged=true. Receipt: `artifacts/verification/quality-r2-20261018/after.json`, исходный BEFORE: `before.json`, его SHA256 `b7e7defed44af0f08529780a6e761d6629c6318d36fa7163124a100fba0e46af`. Это детерминированная приёмка небольшой выборки, без LLM judge, человеческой оценки, балла 8–9 или гарантии top-10.


Повторить фиксированные составные запросы: `npm test -- tests/unit/compound-quality.test.ts`. Все fixtures и ожидания находятся в `tests/eval/compound-development.json` и `compound-acceptance.json`; mocked route invariants — `tests/unit/journey-routing.test.ts`. Они не требуют LLM/API ключей. Verify сохраняет SHA, code digest, exit codes и безопасные логи; browser и реальные local запросы имеют отдельные receipts.

## Материалы и пределы

Неполные часы/адреса/фото/удобства, OSM freshness и bounded grammar остаются ограничениями. Текстовый parser берёт первое упоминание каждого типа cafe/park/restaurant: повтор одного типа в нескольких остановках и произвольное название блюда без явного restaurant не являются проверенными сценариями. Теги ресторана/кухни не подтверждают актуальное меню, наличие конкретного блюда, свободный столик, длительность обслуживания или санитарное состояние. Бронирование, аэропортовый трансфер, forecast/events/CV, all-day itinerary и групповой оптимизатор не реализованы. Пешее время — оценка; безопасность/безбарьерность/прибытие к рейсу не гарантируются. RU/KK/EN основные действия и отдельные запросы не равны полному переводу или экспертной языковой оценке. Независимого исследования полезности с людьми нет.

Текущая матрица/критерии: [REQUIREMENTS_MATRIX](docs/REQUIREMENTS_MATRIX.md), [FINAL_CRITERIA_REVIEW](docs/FINAL_CRITERIA_REVIEW.md). [Сценарии](docs/TEST_SCENARIOS_AND_LIMITATIONS.md), [сдача](docs/SUBMISSION_CHECKLIST.md), [прогресс](docs/PROGRESS.md), [архитектура](docs/architecture.md), [приватность](docs/privacy.md), [данные/лицензии](docs/data-sources.md), [skills](docs/SKILLS.md).

Для питча готов [редактируемый PowerPoint R3](docs/spot-pitch-2026-10-18-R3.pptx): 9 основных слайдов и 2 приложения, [текст выступления](docs/SPEAKER_SCRIPT_RU_R3.txt). [Копия для редактирования в Canva](https://www.canva.com/d/Cq7FrS1vRYpzrCw); доступ зависит от прав владельца. R3 использует проверенные факты и снимки приложения R2; это обновление презентации, а не новая ревизия приложения. Сохраняются [редактируемый PowerPoint R2](docs/spot-pitch-2026-10-18-R2.pptx) и [PDF сценариев R2](docs/TEST_SCENARIOS_AND_LIMITATIONS.pdf). В презентации 10 слайдов: 8 основных и 2 приложения; 684 слова основного выступления рассчитаны на 5–7 минут с переходами, репетиция ещё нужна. Чистый исходный архив `Spot_source_2026-10-18_R2.zip` подготовлен и проверен: целостность ZIP, хеши файлов и ограниченный credential scan прошли; env, runtime и веса моделей исключены. Архив передаётся отдельным файлом. Фактические хеши и scope QA — в [комплекте сдачи](docs/SUBMISSION_CHECKLIST.md).

Локальное видео: `not_recorded_user_stopped_computer_use`. Пользователь остановил Computer Use клавишей Esc до начала записи; действия OBS/GUI прекращены. YouTube=`pending_owner_upload`. Deploy не выполнялся. Публикация исходников идёт в отдельную ветку; видео не записано и не загружено.

Предыдущий выпуск R1 сохранён отдельно в `work/quality-pass-20261018/r1/` с manifest. Его code digest `38b0380549c6b8b8b86b92479020fc1d0b639603ed0748bb93a481f93eac1dc4`, core197/17, snapshot18/18, eval10/10, browser30/30 и local5 являются историей R1. Исходный R1 scenario MD SHA256 `606ecf1ef0874a5d4bc1cbb698512fc7ae28f3cfb03933bc4b5d427b1a894565`, PDF SHA256 `3278754fbb49e35b96042dcc1843428173c48b97d4ad44b28df8a1cf6d2e4572`. Эти доказательства не объявляются проверкой изменённого R2 кода.
