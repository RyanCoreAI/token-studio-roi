# Changelog

## 5.0.0

- Added Coverage Bridge Center metadata and UI so users can distinguish native trusted collection, ccusage import paths, detected-only tools, and unsupported/no-token-field sources.
- Added `GET /api/coverage-bridge` and `GET /api/evidence-flywheel` as read-only derived APIs; they do not read prompt/response/transcript/diff content and do not expose full local paths.
- Added Evidence Flywheel on `/review`, connecting real token data, project identification, automatic evidence, confirmation drafts, output links, and model-strategy samples into one review flow.
- Upgraded Markdown review reports with Coverage Bridge and Evidence Flywheel sections plus copy-ready blog/resume material actions.
- Added a live guardrail that recommends pausing heavy models for the day when custom budget pressure is active.
- Local-only milestone: this version is not published to npm in this stage.

## 4.9.0

- Added Evidence Autopilot on `/review`: a single action can generate high-confidence attribution, project aliases, output evidence suggestions, and model-strategy evidence without calling an LLM or reading prompt/response/transcript/diff content.
- Added `GET /api/evidence-suggestions` and `POST /api/evidence-suggestions/apply` with the existing local JSON write boundary; selected suggestions are applied without overwriting manual annotations.
- Added Git metadata output candidates: only repo name, remote host, commit hash, and commit time are inspected, and commit output links are written only when an HTTP(S) URL can be generated.
- Turned ROI evidence, savings, and model-strategy zero states into actionable evidence queues so real token data can become reviewable work evidence faster.
- Added Source Health recommendations that explain when to use native collection, audit, or the ccusage bridge instead of treating detected-only tools as covered usage.

## 4.8.8

- Tightened the Dashboard Top Models card so model rows align consistently, source chips stay compact, and long model lists collapse by default with an in-card expanded scroll state.
- Moved the `/review` data-source trust banner below the overview and put the closure page before ROI evidence so users see the review workflow before the score.
- Replaced raw `Failed to fetch` auto-attribution errors with a clear local API connection hint for stale pages or stopped API services.

## 4.8.7

- Added `/review` data-source trust messaging so users can distinguish demo, old aggregate databases, old services, and real event-verified token data.
- Reworked ROI evidence, savings simulation, and model strategy zero states so missing attribution becomes an actionable gap instead of an unexplained `0`.
- Added local efficiency guidance ranges for cache reuse, input/output ratio, and reasoning share with clear non-benchmark wording.
- Added a `/review` lazy attribution action that reuses the existing high-confidence auto-attribution API and does not overwrite manual labels.

## 4.8.6

- Added `npm run smoke:npx` as a release-blocking tarball install smoke for the real npm/npx user path.
- Added CI release gate coverage for tests, build, privacy checks, tarball smoke, pack dry-run, and diff checks.
- Added table row key regression tests so missing session identity and repeated synthetic rows cannot reintroduce React duplicate-key warnings.
- Added a browser console smoke path for Dashboard runtime regressions such as `ReferenceError`, duplicate-key warnings, and API proxy connection failures.
- Added post-publish smoke scaffolding for validating `npx token-studio@<version>` after npm publish.

## 4.8.5

- Fixed the Dashboard crash caused by `collectionCoverage` and related coverage handlers not being passed from `App` into `Dashboard`.
- Changed the public default CLI entrypoint: `token-studio` now runs coverage, auto-applies trusted Claude/Codex event-level usage, then starts the browser UI.
- Added `--no-collect` for starting the real SQLite UI without scanning and `--dry-run-only` for coverage-only startup.
- Kept `demo` as explicit synthetic data mode and kept Cursor conservative as detected/no-token-fields unless explicit token fields exist.
- Updated README launch wording so `npx token-studio` is the primary real-data path.

## 4.8.4

- Added a Dashboard “数据来源状态” card so users can immediately distinguish Demo Mode, empty DB, real aggregate-only DB, and event-level real DB.
- Added `/api/data` runtime metadata with package version, sanitized SQLite kind/file name, daily/session/token event counts, latest collection run, and data mode.
- Tightened `Real DB - event verified`: event rows without a passed coverage gate or verifiable collect run now show as needing coverage instead of being treated as trusted.
- Added a browser real-collection guide: run read-only coverage first, then explicitly confirm Claude/Codex SQLite writes, then refresh and verify token events.
- Updated server-triggered collection to use explicit `--sources claude,codex --json` so browser collection does not treat Cursor detected-only data as successful usage.
- Kept real-mode coverage checks user-triggered from the browser; Demo mode remains synthetic and never scans local AI logs.
- Updated npm/readme launch wording to separate `demo`, `start`, `coverage`, `collect --dry-run`, and `collect --apply`.

## 4.8.3

- Added `token-studio coverage --sources=claude,codex,cursor --json` as a read-only historical coverage gate before publish/readme claims.
- Upgraded Claude Code and Codex CLI native collectors to emit real `token_events` and true local session aggregates instead of aggregate-only workspace/model rows.
- Added reconciliation checks for `candidateRecords -> tokenEvents -> sessions -> daily`; apply mode is blocked when Claude/Codex have parseable token records but would write zero events, or when token totals differ by more than 1%.
- Added `token-studio compare-ccusage --report=session --json --yes` to compare Token Studio dry-run token coverage with ccusage structured JSON output while ignoring third-party cost fields.
- Added `GET /api/collection-coverage` and a Dashboard “真实采集可信度” card that separates real collection trust from tool-source support status.
- Kept Cursor conservative: detected Cursor data without explicit token fields is reported as `detected-no-token-fields` and never estimated into usage.

## 4.8.2

- Hardened real local collection: `collect` now requires `--dry-run` or `--apply`, and direct `node src/collect.mjs` / `npm run collect` no longer write SQLite by default.
- Added dry-run collection summaries with candidate file counts, parseable token records, skip reasons, and expected daily/session/event rows.
- Added apply-mode SQLite backup plus before/after row counts, and made server-triggered collection pass explicit `--apply --yes`.
- Added Claude Code, Codex CLI, and Cursor collection trust tests using temp fixtures and temp SQLite.
- Made Cursor conservative: it imports only explicit token fields from local `state.vscdb` and never estimates token usage from text length.
- Updated Source Health to show last run status/message and dry-run-first command hints.

## 4.8.1

- Fixed `npx token-studio demo/start` when npm hoists `vite` beside the package instead of inside `token-studio/node_modules`.
- Added runtime path tests for npm/npx hoisted dependency layout and local source checkout layout.

## 4.8.0

- Renamed the npm package to `token-studio` with `npx token-studio demo` as the primary public entry.
- Updated CLI path handling so npm-installed commands run package files from the installed package while writing demo/usage SQLite data into the caller's working directory.
- Added Source Health Center data and UI for native stable, experimental, detected-only, and ccusage import-bridge sources without exposing full local paths.
- Added `GET /api/source-health` and included source health metadata in `/api/data`.
- Updated README quick start and public docs around npm launch, ccusage bridge coverage, privacy boundaries, and official-price/non-invoice wording.

## 4.7.0

- Added Dashboard ccusage CLI Bridge UX that only generates copyable local commands; the browser never runs external scanners.
- Extended budget profiles to support `rolling` and `fixed` windows with `reset_anchor` and editable `warning_threshold`.
- Updated `/live` and `token-studio statusline` to show quota window type, reset countdown, warning thresholds, and budget usage.
- Added `docs/statusline.md` plus `token-studio statusline --help` integration snippets for Claude Code statusline, tmux, PowerShell, and JSON scripts.
- Added `token-studio policy --format=markdown|claude-md|agents-md` to export a reusable ROI model-use playbook without editing project files.

## 4.6.0

- Added `token-studio import-usage --format=ccusage-cli` to explicitly run `ccusage <report> --json --no-cost` and reuse the existing privacy-safe ccusage import planner.
- Added non-interactive `--yes` gating for the ccusage CLI bridge; dry-run remains default, apply creates a SQLite backup, and unsafe conversation-like fields are rejected.
- Added `token-studio statusline --format=text|json` for terminal/Claude Code/tmux status bars with recent-window tokens, burn rate, cache hit, budget usage, reset countdown, unpriced-model warnings, and open Advisor Actions.
- Added weekly ccusage JSON shape support and kept imported third-party cost fields ignored in favor of Token Studio official-price conversion.
- Updated documentation to position v4.6 as a bridge/statusline catch-up release, not a desktop widget, leaderboard, or full TUI rewrite.

## 4.5.0

- Added first-run onboarding on the Dashboard, derived from existing usage, budget, advisor action, and token event data without adding schema.
- Added empty-state guidance for no data, data without Advisor actions, and budgets without recent event-level live data.
- Added `token-studio open` to start the local UI and open the browser.
- Added `token-studio import-usage --help` with ccusage JSON examples, supported shapes, and privacy boundaries.
- Added `docs/first-run.md` with a 5-minute demo/import/budget/review flow.

## 4.4.0

- Added a Dashboard “导入/预算” wizard for ccusage JSON paste/upload dry-run and explicit SQLite apply.
- Added `POST /api/import/ccusage-json` so the UI can reuse the privacy-safe ccusage import planner; unsafe conversation-like fields are rejected and apply creates a SQLite backup.
- Added Budget Wizard UI for source-level custom token/cost windows and linked `/live` budget guardrails.
- Added `/review` Advisor Action Summary page with open/done/dismissed counts and standalone Markdown action export.
- Fixed `/review` mobile bottom spacing so fixed previous/next page controls do not cover the last visible content.
- Added demo-mode public screenshot assets under `docs/assets/`.

## 4.3.0

- Added `token-studio import-usage --format=ccusage-json` for documented ccusage JSON import with dry-run by default, unsafe conversation-field rejection, and Token Studio official-price recomputation.
- Added local `budget_profiles`, budget APIs, `token-studio budget`, and `/live` budget windows with near/over/exceeded guardrail warnings.
- Added `advisor_actions`, action APIs, `/review` action buttons, and Markdown report action status output.
- Added `token-studio report --period=week --format=table|markdown|json` for terminal ROI review summaries.
- Extended collector matrix with `import-only` ccusage and detected-only entries for Amp, Droid, Codebuff, pi-agent, Roo Code, Zed Agent, Antigravity, Cline, Kiro, Grok Build, and Kilo.
- Kept v4.3 broad coverage privacy-safe: no fake token rows, no prompt/response/transcript/diff/full-path storage, and no real collect in automated tests.

## 4.2.0

- Added ROI Savings Simulator on `/review` to compare official-price model switching scenarios for low-value, exploration, testing, and context-prep work.
- Added savings simulation output to Markdown weekly review reports with explicit non-invoice wording.
- Extended `/api/live` with guardrail thresholds and warning cards for high burn rate, low cache hit, low output/input ratio, and active unpriced models.
- Added `token-studio collectors --audit [--json]` for safe experimental collector audits without SQLite writes or full-path output.
- Extended collector metadata with `auditRecommended` and `lastAudit` placeholders.
- Kept v4.2 focused on product differentiation; npm release packaging and screenshots remain a later launch gate.

## 4.1.0

- Added `/live` lightweight local monitor for recent token burn rate, cache hit, active sessions, sources, and models.
- Added `token-studio live` and `token-studio collectors`.
- Upgraded Cursor, GitHub Copilot CLI, Qwen Code, Kimi, and Goose to opt-in experimental collectors.
- Added fixture-backed structured usage parsing that skips rows without explicit token fields.
- Extended `GET /api/collectors` with privacy, token reliability, data field, and fixture metadata.
- Added public launch checklist and collector support matrix.
- Expanded competitive notes and README differentiation against token-meter style tools.

## 4.0.0

- Repackaged the project as `@ryan/token-studio-roi` with the `token-studio` CLI.
- Added standalone demo mode backed by synthetic SQLite data.
- Added collector registry and source detection for six stable local collectors.
- Added detected-only entries for Cursor, GitHub Copilot CLI, Qwen Code, Kimi, and Goose.
- Added privacy check for publish readiness.
- Added `token_events`, `work_items`, and `work_item_sessions` schema.
- Added ROI Evidence Score on `/review`.
- Added model policy Markdown API.
- Added `GET /api/collectors`, `GET /api/privacy-check`, `GET /api/model-policy.md`, and work item APIs.
- Kept local write APIs loopback-only, local-Origin-only, and JSON-only.

## Notes

- Real collection is never run by automated tests.
- Demo data is synthetic and must not be described as real user history.
- Official-price conversion is not a provider invoice.
