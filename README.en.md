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
| Claude Code Usage Monitor | Burn rate and live quota monitoring | Token Studio ROI adds custom budget windows and connects guardrails to ROI action review |

See [docs/competitive-notes.md](docs/competitive-notes.md) for the fuller competitor reference and differentiation notes.

## What Makes ROI Different?

v4.6 focuses on decisions, not only metering, and uses a small CLI bridge to close coverage and live-entry gaps without turning Token Studio into a desktop widget or TUI clone:

- **ROI Savings Simulator**: compares official-price model switching scenarios for exploration, testing, context prep, low-value, and abandoned work.
- **ccusage JSON Import**: imports documented ccusage JSON output for broader structured usage coverage while recomputing costs with Token Studio official pricing.
- **ccusage CLI Bridge**: explicitly runs `ccusage <report> --json --no-cost` and imports the structured result into Token Studio; non-interactive shells require `--yes`.
- **Import / Budget Wizard**: paste or upload ccusage JSON in the Dashboard, dry-run first, inspect shape/session/event counts, unsafe fields, and unpriced models, then explicitly apply to SQLite.
- **Budget Guardrails**: shows custom budget windows, burn projection, and near/over/exceeded warnings on `/live`.
- **Statusline Guardrails**: `token-studio statusline` prints recent-window tokens, burn rate, cache, budget usage, unpriced-model warnings, and open actions for terminal prompts, tmux, or Claude Code statusline.
- **Advisor Action Loop**: turns Savings Simulator and ROI Advisor recommendations into open/done/dismissed actions and includes them in weekly Markdown reports.
- **Collector Audit**: audits experimental collectors before upgrading support, without SQLite writes or full-path output.
- **Work Evidence**: connects usage to projects, tasks, stages, value, output links, and work items.

All dollar values are official-price conversions or simulations, not provider invoices.

## Quick Start

Recommended Node.js: 24. Minimum: `>=22.12.0`.

```bash
git clone https://github.com/RyanCoreAI/token-studio-roi.git
cd token-studio-roi
npm install
npm run demo
```

CLI:

```bash
node src/cli.mjs demo
node src/cli.mjs start
node src/cli.mjs open
node src/cli.mjs live
node src/cli.mjs collectors
node src/cli.mjs collectors --audit --json
node src/cli.mjs import-usage --format=ccusage-json --file ccusage.json --dry-run
node src/cli.mjs import-usage --format=ccusage-cli --report=session --dry-run --yes
node src/cli.mjs import-usage --help
node src/cli.mjs statusline --format=text
node src/cli.mjs statusline --format=json --window-minutes=15
node src/cli.mjs budget list
node src/cli.mjs report --period=week --format=markdown
node src/cli.mjs doctor
node src/cli.mjs privacy-check
```

Target npm entry after publishing:

```bash
npx @ryan/token-studio-roi demo
npx @ryan/token-studio-roi start
npx @ryan/token-studio-roi open
npx @ryan/token-studio-roi live
npx @ryan/token-studio-roi collectors
npx @ryan/token-studio-roi collectors --audit --json
npx @ryan/token-studio-roi import-usage --format=ccusage-json --file ccusage.json --dry-run
npx @ryan/token-studio-roi import-usage --format=ccusage-cli --report=session --dry-run --yes
npx @ryan/token-studio-roi import-usage --help
npx @ryan/token-studio-roi statusline --format=text
npx @ryan/token-studio-roi budget list
npx @ryan/token-studio-roi report --period=week --format=markdown
npx @ryan/token-studio-roi collect --sources=claude,codex
npx @ryan/token-studio-roi doctor
npx @ryan/token-studio-roi privacy-check
```

`demo` uses synthetic data and does not scan real `.claude`, `.codex`, Cursor, or Copilot logs. `start` reads an existing SQLite database and does not collect automatically. The `ccusage-cli` bridge explicitly runs the external ccusage local scanner; Token Studio only accepts structured JSON, rejects conversation-like fields, and ignores third-party cost fields.

See [docs/first-run.md](docs/first-run.md) for the first-run flow. The Dashboard also derives first-run guidance from the current database: no data points to demo/import, data without actions points to `/review`, and budgets without event-level live data explain the `/live` window behavior.

## Screenshots

These screenshots are from demo mode or sanitized synthetic data, not real local logs.

![Token Studio ROI dashboard](docs/assets/token-studio-v45-dashboard.png)

![Token Studio ROI review](docs/assets/token-studio-v45-review.png)

![Token Studio ROI live guardrails](docs/assets/token-studio-v45-live.png)

Real collection requires explicit confirmation:

```bash
node src/cli.mjs collect --sources=claude,codex
```

Non-interactive shells refuse collection unless `--yes` is passed.

## Core Features

- Collector registry: Claude Code, Codex CLI, Gemini CLI, OpenCode, OpenClaw, and Hermes Agent are v4.0 stable sources.
- Experimental sources: Cursor, GitHub Copilot CLI, Qwen Code, Kimi, and Goose import only explicit token fields and never produce fake token rows.
- Official-price conversion: published provider token prices only; unpriced models stay unpriced.
- Work attribution: project, task type, output status, purpose, stage, value, and notes.
- Output evidence: stores only URL, label, and output type.
- ROI Evidence Score: checks whether attribution, outputs, manual confirmation, and work items are strong enough for ROI decisions.
- ROI Savings Simulator: simulates model switching savings with official prices and keeps unpriced models out of dollar decisions.
- ROI Advisor: local rules only, no LLM calls and no extra token usage.
- Advisor Action Loop: add recommendations to an action list, mark them done or dismissed, and review trends without claiming causal savings.
- Model Policy export: generates `MODEL_POLICY.md` from local structured history.
- ccusage Import Bridge: `token-studio import-usage --format=ccusage-json` imports saved structured JSON, and `--format=ccusage-cli` explicitly invokes ccusage CLI; both avoid conversation content and third-party cost estimates.
- Import / Budget Wizard: dashboard entry for ccusage JSON dry-run/apply and budget-window creation.
- Budget Guardrails: source-level custom token/cost budgets with near/over/exceeded warnings.
- Live Monitor: `/live` shows recent 15-minute token, model, cache, burn-rate metadata, budget windows, and guardrail warnings.
- Statusline Guardrails: `token-studio statusline --format=text|json` reads SQLite only and prints recent-window tokens, burn rate, cache, budget usage, reset countdown, unpriced-model warnings, and open Advisor Actions.
- Collector Audit: `token-studio collectors --audit` returns a safe experimental-source summary without writing SQLite.
- Terminal Report: `token-studio report --period=week --format=table|markdown|json` prints a quick ROI review summary.
- Privacy check: scans for real DBs, AI log directories, `.env`, generated exports, personal paths, and likely secrets.
- Demo mode: public demos use synthetic data and show a Demo Mode badge.
- First-run onboarding: empty-data, import, budget, and review-action guidance without cloud sync or accounts.

## Why Not Just ccusage / CodeBurn?

ccusage, CodeBurn, TokenTracker, and token-dashboard are closer to token meters, TUIs, live burn-rate monitors, or broad collector dashboards. Token Studio ROI is not trying to replace those tools. It turns local token usage into reviewable work evidence: projects, tasks, purpose, stage, value, output links, work items, ROI Evidence, Advisor actions, and Model Policy.

If you only need to know how many tokens you used today, ccusage or CodeBurn may be lighter. If you want to understand what those tokens produced and how to change next week's model strategy, Token Studio ROI is the better fit.

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
- `GET /api/live`
- `GET /api/budget-profiles`
- `POST /api/budget-profiles`
- `DELETE /api/budget-profiles`
- `POST /api/import/ccusage-json`
- `GET /api/advisor-actions`
- `POST /api/advisor-actions`
- `DELETE /api/advisor-actions/:id`
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
- [ ] `/live` loads from demo mode or temporary SQLite
- [ ] no real `data/usage.sqlite`
- [ ] no `.claude/`, `.codex/`, `.env`
- [ ] no raw conversation content
- [ ] README says official-price conversion is not a provider invoice
- [ ] NOTICE preserves attribution for the MIT prototype

## License / Attribution

MIT licensed. See [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).

Token Studio ROI is a standalone public packaging and productization effort by ryan. It preserves attribution for the earlier MIT prototype while making the public product, CLI, collector registry, privacy scanner, ROI evidence layer, work item model, advisor, and model policy workflow first-class Token Studio ROI features.
