# Changelog

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
