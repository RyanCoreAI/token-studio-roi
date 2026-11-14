# Token accounting and identity contract

All collector outputs, `token_events`, and pricing inputs use **mutually exclusive** buckets:

```
total = input + cacheRead + cacheWrite + output + reasoning
billed output = output + reasoning
```

`input` excludes cached reads/writes. `output` excludes reasoning. A reasoning split is descriptive; it must not add a second copy of tokens already included in an upstream output count. API-key equivalent USD amounts are estimates from the configured price table, not subscription invoices.

## Source boundaries

| Source | Adapter contract |
| --- | --- |
| Codex CLI | Raw `input_tokens` includes cached input; raw `output_tokens` includes `reasoning_output_tokens`. Clamp the subsets and subtract them once. |
| Claude Code | Raw `input_tokens`, cache reads, and cache writes are separate. Raw `output_tokens` includes thinking. Split `output_tokens_details.thinking_tokens` or the supported older reasoning/thinking fields once. |
| OpenCode | Its stored `tokens.output` has already had reasoning subtracted upstream. Preserve its output/reasoning components. |
| Gemini CLI | Existing adapter reconciles prompt/cache totals; output candidates and thoughts are separate. Preserve the separate components. |
| OpenClaw | Existing adapter consumes the explicit input/output/cache fields and emits reasoning=0. Do not invent a thinking split. |
| Hermes | The SQLite adapter consumes separate named component columns. This change does not infer a new overlap rule for undocumented provider/version variants. |
| Cursor (experimental) | `tokenCount` component fields use the collector contract. No inference from conversation text or missing token fields. Vendor/version variants remain experimental. |
| Copilot, Goose, Qwen, Kimi (experimental structured import) | A `tokens` object is already normalized. Explicit raw snake-case API usage splits output reasoning; OpenAI-style input details split cached input. Other named component payloads must already follow the exclusive contract; unsupported vendor formats are not certified by this change. |
| ccusage import / ingest API | Import already normalized exclusive components. Do not send raw provider totals as extra component buckets. |

Source references: [Codex response usage mapping](https://github.com/openai/codex/blob/main/codex-rs/codex-api/src/sse/responses.rs), [Claude thinking and billing](https://platform.claude.com/docs/en/build-with-claude/thinking-steering-and-cost), [OpenCode normalization](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/session/session.ts), [Gemini usage metadata](https://ai.google.dev/api/generate-content).

## Stable identities and existing data

New Codex and Claude session IDs hash the immutable source session identifier and do not contain a dominant model. Codex event IDs use the source session, timestamp, model, and within-timestamp occurrence; Claude uses the source message/request identity when available. Token amounts are not part of the new event identity. Missing timestamp/message identity remains a degraded source format; do not infer exact request provenance from it.

Ordinary collection preserves a single matching legacy session ID, its annotations, and uniquely matching event IDs. It updates that row through the normal explicit apply workflow. Existing multiple model-based identities, lossy legacy identities, or ambiguous event matches block apply with an error. No history is deleted, no schema migration runs, and no duplicate-history cleanup happens automatically. Review such history separately before applying collection.

Previously stored counts are not silently rewritten on startup. A normal explicit re-collection can refresh records whose source logs still exist. Lost source logs and pre-existing duplicates cannot be repaired by guessing.

## Cost across views

Dashboard/Review attribution, Live active sessions, and terminal project reports share event-based session pricing. Complete session history is grouped by each event's model and then summed. A mixed-model session is labeled `mixed`; it is never repriced at the dominant/first model's rate. If complete event history is unavailable, retain the recorded aggregate amount with `pricingStatus=unverified-aggregate`; do not claim a new official conversion. Unknown event prices yield `partial`, not a fully priced session.

Daily rows still carry their actual model, and Live/statusline event amounts use the same exclusive-bucket price calculator. Regression tests compare Dashboard, Live, summary, and terminal amounts for a mixed-model fixture.
