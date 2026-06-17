# Changelog

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
