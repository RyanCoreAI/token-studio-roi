# Token Studio ROI

**English** | [中文](README.md)

Token Studio ROI is a local, privacy-first **Local AI Coding ROI Studio**. It does more than count tokens: it connects local AI coding usage to projects, tasks, work stages, outputs, and model strategy.

It helps answer:

- Where did AI coding tokens go?
- Which sessions produced PRs, commits, articles, deployments, or docs?
- Which work should use light, mid, or heavy models next week?

By default it does not read, display, or upload conversation content. Real collection requires explicit confirmation.

## Why Different

| Project | Focus | Token Studio ROI difference |
|---|---|---|
| ccusage | Multi-tool AI coding usage and cost reports | Token Studio ROI focuses on work attribution, output evidence, and model policy |
| CodeBurn | Local multi-agent cost tracking/TUI | Token Studio ROI focuses on review workflows and exportable ROI evidence |
| token-dashboard | Claude Code cost details, tool/file heatmaps | Token Studio ROI keeps a stricter privacy boundary and stores only metadata, hashes, and file types |
| Claude Code Usage Monitor | Burn rate and live quota monitoring | Token Studio ROI v4.0 prioritizes review closure; v4.1 can add a lightweight live page |

See [docs/competitive-notes.md](docs/competitive-notes.md) for the fuller competitor reference and differentiation notes.

## Quick Start

Recommended Node.js: 24. Minimum: `>=22.12.0`.

```bash
npm install
npm run demo
```

CLI:

```bash
node src/cli.mjs demo
node src/cli.mjs start
node src/cli.mjs doctor
node src/cli.mjs privacy-check
```

Target npm entry after publishing:

```bash
npx @ryan/token-studio-roi demo
npx @ryan/token-studio-roi start
npx @ryan/token-studio-roi collect --sources=claude,codex
npx @ryan/token-studio-roi doctor
npx @ryan/token-studio-roi privacy-check
```

`demo` uses synthetic data and does not scan real `.claude`, `.codex`, Cursor, or Copilot logs. `start` reads an existing SQLite database and does not collect automatically.

Real collection requires explicit confirmation:

```bash
node src/cli.mjs collect --sources=claude,codex
```

Non-interactive shells refuse collection unless `--yes` is passed.

## Core Features

- Collector registry: Claude Code, Codex CLI, Gemini CLI, OpenCode, OpenClaw, and Hermes Agent are v4.0 stable sources.
- Detected-only sources: Cursor, GitHub Copilot CLI, Qwen Code, Kimi, and Goose are detected but do not produce fake token rows.
- Official-price conversion: published provider token prices only; unpriced models stay unpriced.
- Work attribution: project, task type, output status, purpose, stage, value, and notes.
- Output evidence: stores only URL, label, and output type.
- ROI Evidence Score: checks whether attribution, outputs, manual confirmation, and work items are strong enough for ROI decisions.
- ROI Advisor: local rules only, no LLM calls and no extra token usage.
- Model Policy export: generates `MODEL_POLICY.md` from local structured history.
- Privacy check: scans for real DBs, AI log directories, `.env`, generated exports, personal paths, and likely secrets.
- Demo mode: public demos use synthetic data and show a Demo Mode badge.

## Privacy Boundary

Token Studio ROI does not store:

- prompts
- responses
- full transcripts
- full file paths
- command bodies
- diff content

Fine-grained analysis may store only token structure, source, model, timestamp, tool category, file extension, repo path hash, and privacy level.

Run the publish gate:

```bash
npm run privacy:check
```

## API

Stable interfaces:

- `GET /api/data`
- `GET /api/collectors`
- `GET /api/privacy-check`
- `GET /api/model-policy.md`
- `POST /api/collect`
- `POST /api/session-annotations`
- `POST /api/session-annotations/batch`
- `POST /api/session-outputs`
- `GET /api/auto-attribution/suggestions`
- `POST /api/auto-attribution/apply`
- `POST /api/auto-attribution/undo`
- `POST /api/work-items`
- `POST /api/work-items/link-sessions`
- `DELETE /api/work-items/:id`

All local write APIs remain loopback-only, local-Origin-only, and JSON-only. The server does not trust `X-Forwarded-For` for local access checks.

## Development

```bash
npm install
npm test
npm run build
npm run privacy:check
```

Development mode:

```bash
npm run dev
```

Default URLs:

- UI: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:4173`

## Public Readiness Checklist

- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run privacy:check`
- [ ] demo screenshots come from demo mode
- [ ] no real `data/usage.sqlite`
- [ ] no `.claude/`, `.codex/`, `.env`
- [ ] no raw conversation content
- [ ] README says official-price conversion is not a provider invoice
- [ ] NOTICE preserves attribution for the MIT prototype

## License / Attribution

MIT licensed. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).

Token Studio ROI is a standalone public packaging and productization effort by ryan. It preserves attribution for the earlier MIT prototype while making the public product, CLI, collector registry, privacy scanner, ROI evidence layer, work item model, advisor, and model policy workflow first-class Token Studio ROI features.
