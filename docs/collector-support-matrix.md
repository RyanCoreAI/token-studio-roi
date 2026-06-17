# Collector Support Matrix

Token Studio ROI prefers trustworthy token metadata over broad but unreliable coverage.

| Source | Status | Data source | Reads conversation content | Token reliability | Default |
|---|---|---|---:|---|---:|
| Claude Code | stable | local metadata/log files | No | native token fields | Yes |
| Codex CLI | stable | local JSONL session metadata | No | native token fields | Yes |
| Gemini CLI | stable | local session metadata | No | native token fields | Yes |
| OpenCode | stable | local data directory | No | native token fields | Yes |
| OpenClaw | stable | local agent metadata | No | native token fields | Yes |
| Hermes Agent | stable | local SQLite metadata | No | native token fields | Yes |
| Cursor | experimental | explicit structured usage JSON/JSONL only | No | explicit token fields only | No |
| GitHub Copilot CLI | experimental | explicit structured usage JSON/JSONL only | No | explicit token fields only | No |
| Qwen Code | experimental | explicit structured usage JSON/JSONL only | No | explicit token fields only | No |
| Kimi / Moonshot Coding CLI | experimental | explicit structured usage JSON/JSONL only | No | explicit token fields only | No |
| Goose | experimental | explicit structured usage JSON/JSONL only | No | explicit token fields only | No |
| ccusage JSON | import-only | documented ccusage JSON output | No | external JSON token fields | No |
| Amp | detected-only | local path detection only | No | unknown; no usage import | No |
| Droid | detected-only | local path detection only | No | unknown; no usage import | No |
| Codebuff | detected-only | local path detection only | No | unknown; no usage import | No |
| pi-agent | detected-only | local path detection only | No | unknown; no usage import | No |
| Roo Code | detected-only | local path detection only | No | unknown; no usage import | No |
| Zed Agent | detected-only | local path detection only | No | unknown; no usage import | No |
| Antigravity | detected-only | local path detection only | No | unknown; no usage import | No |
| Cline | detected-only | local path detection only | No | unknown; no usage import | No |
| Kiro | detected-only | local path detection only | No | unknown; no usage import | No |
| Grok Build | detected-only | local path detection only | No | unknown; no usage import | No |
| Kilo | detected-only | local path detection only | No | unknown; no usage import | No |

Experimental collectors are opt-in. They skip records without explicit token fields and never infer usage from message text, prompts, responses, diffs, or full file paths.

Import-only sources do not scan local logs. `ccusage` is supported through:

```bash
node src/cli.mjs import-usage --format=ccusage-json --file ccusage.json --dry-run
node src/cli.mjs import-usage --format=ccusage-json --file ccusage.json --apply
```

Detected-only sources only report whether likely local paths exist. They do not write `daily_usage`, `session_usage`, or `token_events` until a later audit proves reliable token/model/time/session metadata.

## Collector Audit

Token Studio collector audit provides:

```bash
node src/cli.mjs collectors --audit --json
```

The audit checks experimental collector roots and returns only safe counts:

- candidate files
- usable structured token records
- skipped records with no token fields
- skipped conversation-like records
- skipped oversized files
- parse errors

It does not write SQLite, does not print full paths, and does not output prompt, response, diff, transcript, or message content. A collector should only move from experimental to stable after audit results show reliable token/model/time/session metadata on real local files. Detected-only collectors must first move to experimental with fixture coverage before they can ever become stable.
