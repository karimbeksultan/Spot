# Spot: комплект сдачи — R2

R2 — проверенная ревизия; экспорт материалов и запись имеют отдельную готовность.

Официальная сдача не объявляется без всех четырёх результатов. Push, deploy и публикация не выполнялись; владелец выбирает передачу архива или доступ к репозиторию.

| Результат из PDF | Материал | Статус R2 | Следующее действие |
| --- | --- | --- | --- |
| Репозиторий либо архив прототипа | Локальная ветка `codex/spot-contract-harness`; отдельный `Spot_source_2026-10-18_R2.zip` | verified | ZIP integrity, file hashes и ограниченный credential scan passed; текущие исходники, документы и safe logs включены, env/runtime/weights исключены. Владелец передаёт архив жюри |
| Презентация PDF/слайды на 5–7 мин | [Редактируемый PPTX R2](spot-pitch-2026-10-18-R2.pptx) | verified | 10 слайдов: 8 основных и 2 приложения; все финальные рендеры/структурные проверки прошли. 684 слова речи, 5–7 минут оценочно с переходами; владельцу нужна репетиция |
| Отдельные сценарии и ограничения | [Готовый PDF R2](TEST_SCENARIOS_AND_LIMITATIONS.pdf); output `Spot_Сценарии_и_ограничения_2026-10-18_R2.pdf` | verified | 13 страниц, 42 source-row карточки, 224 поля, полный render/visual QA passed; MD5d42c648… не менялся; receipt `artifacts/verification/document-r2-20261018/report.json` |
| Загруженное YouTube демо и ссылка | Загрузка владельцем | pending_owner_upload | OBS после проекта и PPTX; просмотр, разрешённая загрузка, проверка ссылки |

Code digest: `906ae60d3bf0843f6bc6eb09f5605e4c66dc81e0796bff1baf45099d39e9957b`. Core verify R2 PASS: artifacts/verification/2026-10-18T18-12-20-902Z-22916-verify/report.json, все 8 шагов exit0: lint/typecheck/unit/data/snapshot/eval/build/smoke.265 unit в 21 файле, snapshot18/18, обычный eval10/10 (4development+6acceptance), data2170, smoke3 шага. Code digest906ae60d…9957b стабилен до/после; applicationFilesChangedDuringChecks=false. Eval/smoke выполнялись без сети и платных запросов.

Browser R2 PASS: artifacts/verification/browser-r2-summary-20261018.json и raw browser-r2-20261018.json, exit0,38/38,0skipped/unexpected/flaky,356131.285ms; source digest906ae60d…9957b стабилен. Production localhost:3000, APP_MODE=demo;8context+8planned-journey+5data-limits+5photo+12app. Context/photo/planned-journey используют явно отмеченные UI fixtures (включая synthetic walking legs); app suite использует реальный demo snapshot. Ни local, ни cloud generation этим browser прогоном не проверяются.

Фактически выполнены 3 составных local запроса: B40 мин/возврат — no_match за 15.506 с, все 3 полные попытки исключены по time_budget; The Garden → Парк защитников Отечества G90 мин — complete,58 мин за 13.393 с; отдельный разрешённый B60 мин/возврат — Canele → Ботанический сад, complete,43 мин за 11.672 с. Это 2 положительных маршрута и 1 честный отказ; исходный two-case runner завершился exit1 из-за ошибочного ожидания положительного 40 мин ответа, raw ошибка сохранена. Receipt artifacts/verification/local-compound-r2-20261018/summary.json; source/data unchanged. Всего 3 loopback embedding +3 chat +5 Valhalla requests, paid0/training=false. Замеры относятся к actualSearchElapsedMs, без последующих assertions/hash checks; cold model load включён, warm path не измерен.

Doctor R2 PASS: artifacts/verification/2026-10-18T18-16-24-293Z-30204-doctor/report.json, network0; ключи не читались и endpoints не вызывались. Security R2 PASS: artifacts/verification/security-r2-20261018/report.json,5 scoped source/bundle/privacy checks, credential patterns0, тот же 906ae60d…digest; это ограниченный scan, не pentest. WEATHER R2 PASS: artifacts/verification/weather-r2-20261018/report.json, recommendations3 кафе и предупреждение о неподключённой погоде, network0/paid0, тот же digest.

Зафиксированное сравнение: **5/14 BEFORE → 14/14 AFTER** по одним и тем же 14 запросам, публичным точкам, часам и семантическим assertions. AFTER networkAttempts=0, paidRequests=0; sourceUnchanged=true. Receipt: `artifacts/verification/quality-r2-20261018/after.json`, исходный BEFORE: `before.json`, его SHA256 `b7e7defed44af0f08529780a6e761d6629c6318d36fa7163124a100fba0e46af`. Это детерминированная приёмка небольшой выборки, без LLM judge, человеческой оценки, балла 8–9 или гарантии top-10.


Сохранено и проиндексировано **2170 OSM POI**; в runtime допускаются **2165**. Пять записей с явным другим городом Косшы/Қосшы помещены в карантин без удаления payloads/векторов. Допустимые категории: 354 кафе, 179 парков/садов, 346 площадок, 72 landmarks, 8 музеев, 1206 other, включая скамейки и исходные типы ресторанов. В допустимом наборе 337 расписаний и 190 адресов, у 14 мест 60 лицензированных фото; подтверждённых розеток и цен нет. В сохранённом наборе 338 расписаний/195 адресов. Это ограниченное покрытие OSM, не полный каталог города и не проверенная административная граница для объектов без addr:city.

Неполные часы/адреса/фото/удобства, OSM freshness и bounded grammar остаются ограничениями. Текстовый parser берёт первое упоминание каждого типа cafe/park/restaurant: повтор одного типа в нескольких остановках и произвольное название блюда без явного restaurant не являются проверенными сценариями. Теги ресторана/кухни не подтверждают актуальное меню, наличие конкретного блюда, свободный столик, длительность обслуживания или санитарное состояние. Бронирование, аэропортовый трансфер, forecast/events/CV, all-day itinerary и групповой оптимизатор не реализованы. Пешее время — оценка; безопасность/безбарьерность/прибытие к рейсу не гарантируются. RU/KK/EN основные действия и отдельные запросы не равны полному переводу или экспертной языковой оценке. Независимого исследования полезности с людьми нет.

Отсутствие OpenAI/NVIDIA ключей не блокирует локальный core. Их live проверка необязательна и отдельно разрешается с бюджетом. Mock transport не подтверждает доступ к аккаунту. Веса не обучались; paid requests и remote DB writes=0. Обязательные этапы не снимаются скрыто ради позитивного демо.

Критерии: `FINAL_CRITERIA_REVIEW.md`. Применяется только Smart City, master и harness вместе. Исследование официальных сайтов не слито автоматически; Maps не источник копируемых listings/reviews/photos. Новые операторские фото с неизвестной лицензией не импортированы.

Предыдущий выпуск R1 сохранён отдельно в `work/quality-pass-20261018/r1/` с manifest. Его code digest `38b0380549c6b8b8b86b92479020fc1d0b639603ed0748bb93a481f93eac1dc4`, core197/17, snapshot18/18, eval10/10, browser30/30 и local5 являются историей R1. Исходный R1 scenario MD SHA256 `606ecf1ef0874a5d4bc1cbb698512fc7ae28f3cfb03933bc4b5d427b1a894565`, PDF SHA256 `3278754fbb49e35b96042dcc1843428173c48b97d4ad44b28df8a1cf6d2e4572`. Эти доказательства не объявляются проверкой изменённого R2 кода.

Внешний блокер сдачи — YouTube `pending_owner_upload`. Дедлайн и форма отправки не указаны в предоставленном PDF, их проверяет владелец. Подготовленный проект/PPTX не означают полную официальную сдачу.

PDF R2 SHA256 `b7ec5fa2c70eb9859e288f19e7d81bf74078819e00bc8d504431dd86776f4108`; canonical repo-copy совпадает с output. Markdown SHA256 `5d42c6486f19c6695b1500cf774bd841ad17e133fee95210cd93b23d0b0d98a0` совпадает с frozen source/output MD. Шрифты встроены, clipping=0. 42 карточки включают сгруппированные unit/mock контракты и не являются 42 независимыми quality observations. Старые R1 output и точный PDF backup сохранены.

PPTX R2 SHA256 `e72a9947ae745db0e033fbab6e387f64daad3062ee157a10b6acbdf0359e222b`; receipt `artifacts/verification/presentation-r2-20261018/report.json` имеет status=passed и связан с текущими code/data digest. Использованы реальные local UI captures, без API fixtures в презентации. Все 10 слайдов отрендерены и просмотрены; открытие в нативном PowerPoint и проверка его шрифтов отдельно не выполнялись.

Локальная запись: `not_recorded_user_stopped_computer_use`. Computer Use обнаружил физический Esc пользователя до начала записи; все GUI/OBS действия прекращены. Видео не записано, публикации нет. YouTube остаётся `pending_owner_upload`; этот внешний результат сдачи ещё нужен.
