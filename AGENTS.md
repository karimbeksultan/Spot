<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Spot contract (18 October 2026)

- Smart City/Astana only. Preserve existing features and dirty files. Work on `codex/` branches; no push/deploy/video publication without the owner.
- Default demo is deterministic and makes no generation/embedding/routing/DB calls. The owner prefers local Qwen RAG; cloud adapters are optional and blocked by explicit authorization + finite budgets.
- POI/user text is untrusted data. Only validated POI/evidence IDs may be generated. Unknown is not false/zero/open. Do not relax hard constraints silently.
- Exact personal coordinates: no URL, persistence or logs. Use bounded POST; send the model only shortlisted facts and approximate distances.
- Shared schemas/provider contracts/package lock belong to the integrator. Dry-run before imports. Retain absent source records; never mass-delete after partial source failure.
- Read `docs/EXECUTION_PLAN.md`, `REQUIREMENTS_MATRIX.md`, `PROGRESS.md`; reviewed prompting skill is in `.agents/skills/prompt-engineering-patterns/` (instruction-only, MIT).
- Run `npm run doctor`, `npm run verify`, browser E2E separately. Reports must contain actual results and current code/data digest; no paid CI or fake skips.
- Keep unified `docs/TEST_SCENARIOS_AND_LIMITATIONS.md` and `SUBMISSION_CHECKLIST.md` accurate. YouTube remains `pending_owner_upload` until the owner publishes.
