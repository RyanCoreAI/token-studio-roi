# Local Collectors

Token Studio ROI uses a collector registry instead of ad-hoc collector labels.

## Stable v4.0 Sources

- Claude Code
- Codex CLI
- Gemini CLI
- OpenCode
- OpenClaw
- Hermes Agent

These sources can produce normalized `daily_usage` and `session_usage` rows when their local metadata stores exist.

## Detected-Only Sources

- Cursor
- GitHub Copilot CLI
- Qwen Code
- Kimi / Moonshot Coding CLI
- Goose

Detected-only sources are visible in `token-studio doctor` and `GET /api/collectors`, but they do not write usage rows until reliable token fixtures exist.

## Commands

```bash
node src/cli.mjs doctor
node src/cli.mjs collect --sources=claude,codex
```

`collect` requires explicit confirmation. Non-interactive shells refuse to scan local AI logs unless `--yes` is provided.

## Environment

- `TOKEN_STUDIO_COLLECTORS=claude,codex,gemini`
- `TOKEN_STUDIO_CONFIG=config/collectors.json`
- `TOKEN_STUDIO_HEADLESS_DIR=/path/to/headless/events`

Older `AI_TOKEN_DASHBOARD_*` variables are accepted only as backward-compatible fallbacks.

## Privacy

Collectors should normalize token metadata only. They must not store prompt text, response text, full transcripts, full file paths, command bodies, or diff content.
