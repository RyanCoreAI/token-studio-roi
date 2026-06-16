# Privacy

Token Studio ROI is designed as a local-first AI coding review tool.

## Default Behavior

- No cloud sync.
- No account system.
- No remote telemetry.
- No automatic scan of local AI tool logs on startup.
- Demo mode uses synthetic records only.

## Real Collection

Real collection runs only after explicit confirmation through the CLI or local UI.

Supported v4.0 stable collectors read local structured usage metadata from:

- Claude Code
- Codex CLI
- Gemini CLI
- OpenCode
- OpenClaw
- Hermes Agent

Detected-only sources such as Cursor, GitHub Copilot CLI, Qwen Code, Kimi, and Goose are not written as usage rows until reliable token fixtures exist.

## Data Not Stored

Token Studio ROI does not store:

- prompts
- responses
- full transcripts
- full file paths
- command bodies
- diff content
- fetched PR, commit, article, or deployment content

Output links store only URL, label, and type.

## Local Data

Local SQLite files live under `data/` by default and are ignored by Git.

Before publishing or sharing the repository, run:

```bash
npm run privacy:check
```

The privacy check looks for real SQLite databases, AI log directories, `.env` files, generated exports, personal paths, and likely secrets in tracked files.

## Network Boundary

The local server binds to `127.0.0.1` by default.

All write APIs require:

- loopback request address
- local or empty Origin
- `Content-Type: application/json`

The server does not trust `X-Forwarded-For` for local access checks.

## Cost Boundary

Dollar values are official public token-price conversions. They are useful for trend review and model strategy, but they are not provider invoices or financial reconciliation.
