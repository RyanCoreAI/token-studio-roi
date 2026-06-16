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
- ROI Advisor: local explainable rules that recommend annotation, model switching, context compression, stop-loss, output links, and policy changes.
- Model Policy export: produces a reusable Markdown strategy for when to use light, mid, or heavy models.
- Public safety: demo mode, privacy-check, `NOTICE.md`, no real SQLite in git, no prompt/response export.
- Launch path: `git clone` demo today, `npx @ryan/token-studio-roi demo` after npm publication.
- v4.1 coverage path: experimental Cursor, Copilot CLI, Qwen Code, Kimi, and Goose collectors skip records without explicit token fields.

## Remaining Gaps

- Collector depth is still behind the broadest multi-tool products. v4.1 adds five experimental sources, but stable verification remains narrower than ccusage or TokenTracker.
- Live monitoring is intentionally lightweight; it is a guardrail for current burn rate, not an exact subscription predictor.
- Desktop packaging is not included. Keep the public story focused on local browser + CLI first.
- Automatic attribution is rule-based and should always display provenance and confidence.
