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

Experimental collectors are opt-in. They skip records without explicit token fields and never infer usage from message text, prompts, responses, diffs, or full file paths.
