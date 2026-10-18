# Spot — выполнение контракта, 18.10.2026

> Этот план сохранён как история реализации R2. Последующие прямые разрешения владельца разрешили публикацию полного проекта в GitHub `main` и аудит/исправление CI 19 октября. Старое ограничение push ниже относится к исходному этапу; запрет платных AI-вызовов, деплоя и публикации видео сохраняется. Текущие материалы: [checklist](SUBMISSION_CHECKLIST.md).

Контракт: пользовательские 01_SPOT_MASTER_PROMPT_RU.md + 02_SPOT_ENGINEERING_HARNESS_RU.md. Только трек Smart City (PDF стр.1–3 до CampusPulse). Никаких deploy/push/main/платных вызовов.

| ID | Работа / владелец файлов | Зависит от | Приёмка | Проверка |
|---|---|---|---|---|
| B0 | Исходный baseline, сохранение SHA + dirty digest | — | Исходники сохранены, результаты фактические | lint/type/unit/eval/data/build + browser desktop/mobile |
| P1 | root: types, search, server config/providers/budget, model, API, package | B0 | Demo без API, live fail-closed; ID/evidence validation; deadline/cancel; clarification airport, strict budget | unit mock providers+API, eval acceptance |
| D1 | data agent: scripts/data + собственные tests | B0 | Dry-run ничего не меняет, absent rows retained, provenance, bounded retry | importer dry-run/idempotency fixtures |
| U1 | UI agent: SpotApp, ui-copy, CSS, context E2E | B0,P1 schema | Follow-up retains constraints, editable context, honest modes, POST coords, race guard | browser desktop/mobile + E2E |
| H1 | harness agent: scripts/harness, tests/eval, workflow | B0,P1 schema | doctor/verify/eval/smoke исполняемые, ненулевые ошибки, кодовый digest, no paid | harness unit + полный verify |
| Q1 | root: независимая проверка и исправления | P1,D1,U1,H1 | Существующие проверки не ослаблены, новый код соответствует evidence | verify + E2E + source/bundle secret scan |
| S1 | root: docs, scenarios, risk pitch, архив | Q1 | 4 deliverables отмечены честно; видео pending_owner_upload | artifact validation, checklist |

Shared schemas / package lock / migrations принадлежат root. Миграции и remote data writes не нужны. Остальные агенты не меняют общие файлы. До B0 аудиторы работали read-only; B0 завершён перед реализацией. Существующие незакоммиченные изменения не сбрасываются. Ветка codex/spot-contract-harness.
