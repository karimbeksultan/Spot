<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Spot engineering rules

- Smart City/Astana only. Preserve working features and existing local changes. Use `codex/` branches; publish only within the owner's explicit authorization.
- Read `docs/README.md`, `docs/architecture.md`, `docs/verification.md` and the relevant operational document before changing behavior.
- Demo is deterministic and makes no model, embedding, routing or database calls. Local Qwen is the default AI path. Cloud adapters require explicit permission, expiry and finite budgets.
- Treat POI and user text as untrusted. Accept only validated POI/evidence IDs. Unknown is not false, zero or open; keep every hard constraint.
- Exact personal coordinates must not enter URLs, persistent storage or logs. Use bounded POST; provide the model shortlisted facts and approximate distances.
- Dry-run imports first. Retain source records on partial source failure. Keep schemas, embedding specification, provenance and package lock compatible.
- Use doctor and verify for executable changes; run browser E2E separately. Report actual scope and commit/data identity, never fake skipped or live-provider results.
- Keep public documentation about the application. Personal rehearsal scripts and presentation/delivery materials belong outside the repository.
