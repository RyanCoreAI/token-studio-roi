# Competitive Notes

Token Studio ROI is positioned as a local AI coding ROI review system, not only a token counter.

## Referenced Projects

| Project | Public focus | Coverage strength | Launch strength | Token Studio ROI difference |
|---|---|---|---|---|
| [ccusage](https://ccusage.com/) | Local CLI usage and estimated cost across many coding agents | Broad collector coverage, offline pricing, cache token accounting | Strong CLI workflow | Token Studio ROI adds work attribution, output links, ROI evidence score, and weekly review exports. |
| [CodeBurn](https://github.com/getagentseal/codeburn) | Interactive TUI for Claude Code, Codex, and Cursor cost observability | Claude, Codex, Cursor oriented | Fast `npx` terminal experience | Token Studio ROI uses a browser review workspace with work items and advisor actions. |
| [token-dashboard](https://github.com/nateherkai/token-dashboard) | Local Claude Code JSONL dashboard with cost analytics, heatmaps, and tips | Deep Claude Code analytics | Clear dashboard story | Token Studio ROI keeps transcript content out of the product and focuses on project/task/output ROI. |
| [Claude Code Usage Monitor](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor) | Real-time terminal monitoring with burn rate and prediction | Claude Code focused | Strong live monitoring | Token Studio ROI treats live monitoring as a lightweight guardrail and keeps weekly ROI review as the main surface. |
| [TokenTracker](https://github.com/mm7894215/TokenTracker) | Local-first dashboard, native tray/menu bar, widgets, many coding tools | Very broad tool coverage | Desktop packaging and zero-config story | Token Studio ROI is lighter-weight today but has deeper work/output attribution and publishable review artifacts. |

## Differentiation

- Work attribution: project alias, task type, output status, work purpose, stage, value, and notes.
- Output evidence: PR, commit, article, deploy, document, screenshot, or other URL without fetching linked content.
- Work item layer: multiple sessions can roll up into one deliverable.
- ROI Evidence Score: separates manually confirmed work, auto/high-confidence work, missing fields, output links, and high-cost gaps.
- ROI Savings Simulator: compares model switching scenarios for exploration, testing, context prep, low-value, and abandoned work using official-price conversion, not invoice claims.
- ROI Advisor: local explainable rules that recommend annotation, model switching, context compression, stop-loss, output links, and policy changes.
- Advisor Action Loop: recommendations can become open/done/dismissed actions and appear in weekly reports.
- Model Policy export: produces a reusable Markdown strategy for when to use light, mid, or heavy models.
- ccusage JSON Import: uses ccusage documented output as an import bridge for broader structured coverage while recomputing official-price costs locally.
- Budget Guardrails: custom source-level token/cost windows, burn projection, and near/over/exceeded warnings without pretending to know provider subscription quotas.
- Collector Audit: safely checks experimental collector viability before upgrading support level, instead of inflating source count with unreliable estimates.
- Terminal ROI Report: quick CLI summary of total tokens, official-price cost, project/model ranking, budget risks, and Advisor Actions.
- Public safety: demo mode, privacy-check, `NOTICE.md`, no real SQLite in git, no prompt/response export.
- Launch path: `git clone` demo today, `npx @ryan/token-studio-roi demo` after npm publication.
- v4.1 coverage path: experimental Cursor, Copilot CLI, Qwen Code, Kimi, and Goose collectors skip records without explicit token fields.

## v4.3 High-ROI Product Bet

The fastest way to improve Token Studio ROI is to close the biggest visible gaps without diluting the ROI product wedge. ccusage, tokscale, and TokenTracker still lead on breadth and quick-start monitoring. CodeBurn and Claude Code Usage Monitor remain stronger in terminal-first live burn-rate workflows.

v4.3 narrows that gap by using ccusage JSON as an import bridge, adding source-level budget guardrails, and adding terminal reports. It still deepens the question those tools usually stop short of: **what should I change next week to spend fewer tokens on low-value work and preserve expensive models for high-value output?**

v4.3 therefore prioritizes:

- ccusage import before reimplementing every collector.
- Custom budget guardrails before claiming exact subscription limits.
- Advisor Actions before generic tips.
- Terminal ROI report before a full TUI.
- Collector matrix breadth with detected-only/import-only honesty before fake stable support.

## v4.6 Bridge And Statusline Bet

The remaining gap after v4.5 is not the browser review workflow; it is quick terminal access and broad source ingestion. ccusage already documents JSON reports for daily, weekly, monthly, session, and blocks, and it can be run directly with `npx ccusage@latest`. Token Studio ROI should not duplicate every collector immediately.

v4.6 therefore adds:

- ccusage CLI Bridge: run ccusage explicitly, request `--json --no-cost`, reject unsafe conversation-like fields, and recompute costs with Token Studio official-price logic.
- Statusline Guardrails: a compact read-only summary for terminal prompt, tmux, or Claude Code statusline use.
- No desktop widget, leaderboard, subscription-quota prediction, account system, or background daemon.

This narrows the most visible competitive gap while keeping Token Studio ROI focused on work evidence, model strategy, and Advisor Actions.

## v4.7 Usability Catch-Up

v4.7 keeps the same product wedge but makes the catch-up features easier to use:

- ccusage Bridge UX: the Dashboard generates copyable commands for saved JSON or CLI bridge workflows, but the browser never runs external scanners.
- Quota Profiles v2: custom guardrails now support rolling and fixed reset windows, reset countdowns, and editable warning thresholds.
- Statusline Integration Pack: documented snippets for Claude Code statusline, tmux, PowerShell prompts, and JSON scripts.
- ROI Playbook Export: `token-studio policy --format=markdown|claude-md|agents-md` turns Model Policy into copyable operating rules without editing user files.

This closes practical gaps with terminal-first competitors while preserving the main differentiation: ROI evidence, work outputs, and explicit action loops.

## Remaining Gaps

- Collector depth is still behind the broadest multi-tool products. v4.7 improves breadth through ccusage JSON/CLI bridge and detected-only coverage, but Token Studio's own stable collectors remain narrower than ccusage or TokenTracker.
- Live monitoring is intentionally lightweight; it is a guardrail for current burn rate, not an exact subscription predictor.
- Desktop packaging is not included. Keep the public story focused on local browser + CLI first.
- Automatic attribution is rule-based and should always display provenance and confidence.
- Savings simulation depends on official public token prices and structured metadata; it is useful for strategy, not proof of actual invoice savings.
