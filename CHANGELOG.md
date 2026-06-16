# Changelog

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
