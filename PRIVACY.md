# Privacy

Token Studio ROI is designed as a local-first AI coding review tool.

## Default Behavior

- No cloud sync.
- No account system.
- No remote telemetry.
- Demo mode uses synthetic records only.
- `token-studio demo` and `token-studio start` do not scan real AI tool logs.
- The bare `token-studio` command runs a local coverage check and writes only trusted Claude/Codex event-level token metadata when the gate passes.

## Real Collection

Real collection runs only after explicit confirmation through the CLI or local UI.

The bare CLI entrypoint is treated as explicit local use of Token Studio's auto flow. It scans only structured token metadata locations and still keeps detected-only sources out of SQLite unless reliable token fields exist.

Supported v4.0 stable collectors read local structured usage metadata from:

- Claude Code
- Codex CLI
- Gemini CLI
- OpenCode
- OpenClaw
- Hermes Agent

Detected-only sources such as Cursor, GitHub Copilot CLI, Qwen Code, Kimi, and Goose are not written as usage rows until reliable token fixtures exist.

ccusage import and bridge flows are explicit imports of structured JSON. Token Studio rejects conversation-like fields and recomputes costs with its own official-price table instead of trusting third-party cost values.

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

All non-public `/api/*` read APIs require loopback request address plus a local or empty Origin before returning local data.

All write APIs require:

- loopback request address
- local or empty Origin
- `Content-Type: application/json`

`/api/ingest` is disabled by default. It is enabled only when `INGEST_TOKEN` is set, and every ingest request must send `Authorization: Bearer <token>` with a JSON body. This keeps remote machine ingestion explicit instead of leaving a writable endpoint open by accident.

The server does not trust `X-Forwarded-For` for local access checks. Non-loopback binds such as `HOST=0.0.0.0` are refused unless `TOKEN_STUDIO_ALLOW_REMOTE=1` and `INGEST_TOKEN` are both set. That mode is for explicit ingest use and does not relax normal Dashboard API read/write guards.

## Cost Boundary

Dollar values are official public token-price conversions. They are useful for trend review and model strategy, but they are not provider invoices or financial reconciliation.
