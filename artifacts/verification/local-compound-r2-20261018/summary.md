# R2: фактическая локальная проверка составных запросов

Одна неизменная ревизия: `906ae60d3bf0843f6bc6eb09f5605e4c66dc81e0796bff1baf45099d39e9957b`; исходники и snapshot до/после совпадают. Все старты - публичные фиксированные тестовые точки B/G, не история GPS владельца. Qwen3:0.6b/embeddinggemma через loopback; реальные walking legs Valhalla. paid/remote model/training/downloads=0. Краткие результаты ниже не заменяют полные исходные JSON.

| Кейс | Фактически | Search latency | План | Оценка |
| --- | --- | --- | --- | --- |
| LOCAL-COMPOUND-COFFEE-PARK-40 | no_match; 0 POI | 15.506с | не подтверждён/40мин; return=True | initial positive assumption failed; correct atomic refusal |
| LOCAL-COMPOUND-ITALIAN-PIZZA-PARK-90 | recommendations; The Garden → Парк защитников Отечества | 13.393с | 58/90мин; return=False | complete/positive |
| LOCAL-COMPOUND-COFFEE-PARK-60-SEPARATE | recommendations; Canele → Ботанический сад | 11.672с | 43/60мин; return=True | complete/positive |

40 минут не меняли:3 реальных route попытки отклонены time_budget, никакая часть cafe→park не выдана за полный успех. 8+10 минут посещений и5 минут резерва оставляют17 минут на walking/возврат. Точные времена отклонённых legs исходный runner не сохранил; они не реконструировались повторными запросами. Это ограниченный поиск, а не доказательство отсутствия любого подходящего маршрута.

Отдельный60-минутный запрос разрешён и назван отдельно, первые40/90 результаты не перезаписаны. Два положительных ответа имеют journey.complete, stage order/evidence, local-hybrid, ollama-validated, promptv4 и реальную маршрутную геометрию. Italian/pizza - только raw OSM facts с точным id/hash/URL match; меню, бронирование и срок обслуживания не подтверждены.

Итог -2 положительных полных маршрута и1 честный отказ. Это не3/3 positive и не гарантия места в топ10. Первоначальный runner завершился exit1 из-за ошибочного ожидания положительного40-минутного ответа; его raw errors сохранены. Отдельный60-минутный runner завершился exit0.

Model-only benchmark лежит отдельными файлами: фиксированный shortlist/promptv3, не end-to-end маршрут. Результаты времени поиска не включают последующие проверки хешей/ассерты; warm cache не измерен. Сценарии/PDF можно обновлять как новуюR2 версию только после текущих core/browser подтверждений и нового freeze.
