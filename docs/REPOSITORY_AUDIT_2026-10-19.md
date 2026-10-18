# Repository audit — 19 October 2026

Repository: [karimbeksultan/Spot](https://github.com/karimbeksultan/Spot). The existing application, dataset, migrations and protected submission artifacts were preserved. No files were deleted and no application business logic was changed.

## Actual failure and corrections

The [original failed Actions run](https://github.com/karimbeksultan/Spot/actions/runs/39156228893) passed lint, TypeScript, data validation, snapshot/evaluation, build and smoke. One of 265 unit tests failed before its assertions: `mkdtemp` assumed ignored `work/` already existed in the checkout. The test now creates that parent explicitly and keeps its concurrent budget-reservation assertions.

The workflow now runs on `main` as well as `codex/**` and pull requests. Official Node 24 action revisions are pinned by full SHA, the runner is pinned to Ubuntu 24.04, and a tested collector uploads only current-checkout doctor/verify receipts. Historical evidence is retained but excluded from new CI artifacts. Checks and tests were not disabled.

## Local verification

| Check | Actual result |
| --- | --- |
| Before fixes | doctor and all 8 verify steps passed locally; existing `work/` masked the clean-checkout failure |
| After fixes | doctor and all 8 verify steps passed |
| Unit/integration | 267/267, 22 files; includes two new collector boundary tests |
| Snapshot / evaluation | 18/18 and 10/10 |
| Production build / smoke | passed |
| Browser | 38/38 unchanged scenarios, no skipped, failed or flaky tests |
| Dependency audit, production only | 0 reported vulnerabilities |
| Dependency audit, development included | 5 high findings in one unpatched transitive advisory chain; remains open |
| Frozen scenario Markdown, PDF and R3 PPTX | original SHA256 values unchanged |

Browser testing uses production demo mode. Context, photo and planned-journey tests include explicit UI fixtures; this run does not verify local or cloud generation. GitHub CI runs the eight core checks; it does not claim the separate browser run. [Machine-readable local proof](../artifacts/verification/repository-audit-20261019/local-checks.json). [Actual GitHub Actions status and downloadable current logs](https://github.com/karimbeksultan/Spot/actions/workflows/verify.yml).

## Repository presentation and cleanup

README now has an English product overview, real technology badges, a real public-origin application screenshot, architecture, fresh-clone setup, environment settings, usage and troubleshooting. A self-contained SVG wordmark uses the existing Spot palette and was checked on light and dark backgrounds. Existing favicon and app styling are unchanged. Image provenance and licenses are recorded in `docs/assets/README.md`.

GitHub About description and ten relevant Topics were configured. The repository remains public as before. Homepage is empty because no public deployment has been verified. Historical documentation is labelled and the submission checklist reflects R3 and the outstanding video. Local skills/caches are ignored. Existing logs, reports, source data, old slides and all pre-existing untracked files were preserved; no deletion candidates were proven.

Changed areas: `.github/workflows/verify.yml`; the provider test; new CI evidence collector and its tests; `.gitignore`; README and `docs/assets/`; generated data validation reports; historical notices in the execution plan/progress/matrices; submission checklist; this audit and its local proof. No `src/`, application assets, model weights, keys or database migrations changed.

## Security scope and remaining limits

Tracked files and reachable history were scanned, including extractable PPTX XML and PDF text. Confirmed credential leaks: 0. Pattern matches were reviewed as synthetic test fixtures, including the new redaction test. Local secret files were not opened. This is a bounded source/history/configuration review, not a penetration test; it does not cover dangling objects, forks, remote secret stores or image OCR.

`npm audit` reports five development dependency findings propagated from [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), affecting `braces` through 3.0.3. The advisory and registry expose no patched release. Production dependencies report zero. ESLint 9 is end-of-life, but the latest React/import/accessibility plugins currently declare peers through ESLint 9; an unsupported forced ESLint 10 install or a Next.js downgrade was not applied. Track upstream fixes; dependency files remain unchanged. [ESLint version policy](https://eslint.org/version-support/).

Two lower-priority observations remain for future deployment hardening: a reviewed CSP and tighter response-size/rate boundaries on health/upstream integrations. Existing origin, schema, egress, timeout, secret and spending gates were reviewed; no new confirmed high-impact source defect was found in this scope. No deployment/security settings were changed.

There is no declared repository-wide code license; existing data/photo licenses remain explicit. Choosing an application code license remains the owner's decision. Demo recording and YouTube publication are still incomplete and are separate submission requirements. No paid AI requests, database writes, model training or deployment were performed for this audit.

Skills used: gh-fix-ci, security-best-practices, frontend-design and ui-ux-pro-max. The user's explicit audit/fix/publication request authorized the routine fixes and push; no extra approval gate was inferred from skill guidance.
