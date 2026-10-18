# Локальный Qwen: фактический microbenchmark, 18.10.2026

Только loopback 127.0.0.1:11434, Ollama0.40.5, Qwen3:0.6b и embeddinggemma. Реальные фиксированные shortlist из snapshot, публичные смоделированные запросы у MEGA; это не личная GPS история и не end-to-end приёмка маршрута. Приложение, индекс, данные и runtime configuration не менялись; paid/remote/training/downloads=0. Все новые файлы игнорируются Git в work/.

Настройки chat: num_ctx2048, temperature0, think=false, num_predict50; baseline2threads, ровно один дополнительный эксперимент4threads. Везде keep_alive0 и пустой /api/ps после вызовов. Это cold-load измерения, warm-cache эффект не измерялся. RAM запрошена read-only через GlobalMemoryStatusEx: CIM в sandbox недоступен, его нулевые значения не засчитаны.

| Сценарий | Вариант | Threads | Prompt tokens | Output tokens | Load, с | Prompt, с | Output, с | Total, с | JSON |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PUBLIC-COFFEE-PARK-40 | current-verbatim | 2 | 576 | 8 | 4.247 | 9.937 | 0.725 | 14.941 | valid |
| PUBLIC-COFFEE-PARK-40 | compact-experiment | 2 | 404 | 7 | 3.451 | 9.552 | 1.134 | 14.163 | valid |
| PUBLIC-ITALIAN-PARK-60 | current-verbatim | 2 | 621 | 8 | 5.058 | 14.248 | 0.903 | 20.247 | valid |
| PUBLIC-ITALIAN-PARK-60 | compact-experiment | 2 | 404 | 22 | 4.413 | 7.618 | 3.591 | 15.668 | valid |
| PUBLIC-COFFEE-PARK-40 | compact-experiment-4threads | 4 | 404 | 7 | 4.195 | 4.693 | 0.673 | 9.580 | valid |

| Query embedding | Tokens | Total, с | Load, с | Dimensions |
| --- | --- | --- | --- | --- |
| PUBLIC-COFFEE-PARK-40 | 22 | 3.669 | 3.455 | 768 valid |
| PUBLIC-ITALIAN-PARK-60 | 20 | 4.433 | 4.213 | 768 valid |

## Выводы и ограниченные рекомендации

- На одном и том же compact coffee prompt404tokens переход2→4threads сократил cold total14.163→9.580с (32.36%). Prompt evaluation9.552→4.693с; load3.451→4.195с. Это один замер, не гарантия задержки. Ввод реконструирован тем же алгоритмом из неизменного snapshot; размер совпал1746UTF8bytes, новая call имеет SHA сообщений в отдельном receipt.
- Уменьшение prompt576→404tokens на coffee дало14.941→14.163с; restaurant621→404tokens:20.247→15.668с. Размер prompt важен, но результат зависит от background load и длины самого JSON. Для цели~250tokens можно убрать описания/evidence после строгого server stage/cuisine filter и оставить индекс, имя, категорию и расстояние; такая дополнительная версия пока НЕ измерена.
- Сокращение num_predict50 почти не поможет, когда ответ занимает7–22tokens. Слишком низкий cap способен обрезать JSON. Сохранить schema binding, think=false, индексы/unique/membership checks; не заменять серверные hard constraints указанием модели.
- В обоих фиксированных shortlist все current/compact ответы были синтаксически valid, но выбрали только food-индексы и не выбрали park. Это демонстрирует различие ID validation и покрытия составного намерения. Нужны серверные этапы coffee/restaurant→park с порядком, проверкой выбранной кухни, route+return+budget; unverified cuisine/booking не подтверждать. Эти результаты не считаются live route quality proof.
- keep_alive45s можно сделать ограниченной опцией при контроле RAM; один keep_alive не уберёт model switching при MAX_LOADED_MODELS1: следующий embedding вытесняет Qwen. Локальный bounded RAM-only LRU для query embeddings с TTL и model/dimension/version key может позволить повторному запросу пропустить embedding switch. Не сохранять запросы/координаты на диск. Warm latency после такого изменения требует отдельного фактического замера.
- Не повышать MAX_LOADED_MODELS или NUM_PARALLEL ради скорости на этом ноутбуке: после некоторых вызовов наблюдалось2.507GiB free. Во всём замере до3.338GiB→после3.330GiB; перед4threads3.762GiB→после3.658GiB, total15.758GiB; C:~39.08GiB free. Это отдельные точки, не измерение пиков RAM.4threads можно сделать bounded1–4 process/request option; low-memory fallback2 и max1model сохранить.
- Нельзя вывести оценку8–9/место в топ10 из этой выборки. Нужен новый code digest, функциональные compound acceptance cases, live routing/time constraints, и затем актуализация сценариев/слайдов. Старый PDF остаётся проверенным previous release до нового freeze.

## Источники параметров

- [Ollama chat API](https://docs.ollama.com/api/chat): keep_alive0 выгружает модель; durations в ns, prompt/output token counts и JSON schema transport.
- [Ollama embedding API](https://docs.ollama.com/api/embed): отдельные total/load/input metrics. prompt_eval_duration здесь не вернулся и не выдуман.
- [Ollama FAQ](https://docs.ollama.com/faq): keep_alive, max loaded models и parallel context RAM. Рекомендации выше отличены от измеренных фактов.

Первичные receipts: latency-current-vs-compact.json, latency-compact-4threads.json. Их SHA сохранены в latency-summary.json. Все7 model calls последовательные; повторов/новых weights/облака/изменений runtime нет.
