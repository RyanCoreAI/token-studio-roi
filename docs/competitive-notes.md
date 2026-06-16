# Competitive Notes

Token Studio ROI is positioned as a local AI coding ROI review system, not only a token counter.

## Referenced Projects

| Project | Public focus | Useful reference | Token Studio ROI difference |
|---|---|---|---|
| [ccusage](https://ccusage.com/) | Local CLI usage and estimated cost across many coding agents | Broad collector coverage, offline pricing, cache token accounting | Token Studio ROI adds work attribution, output links, ROI evidence score, and weekly review exports. |
| [CodeBurn](https://github.com/getagentseal/codeburn) | Interactive TUI for Claude Code, Codex, and Cursor cost observability | Fast `npx` startup, terminal-first usage review, provider coverage | Token Studio ROI uses a browser review workspace with work items and advisor actions. |
| [token-dashboard](https://github.com/nateherkai/token-dashboard) | Local Claude Code JSONL dashboard with cost analytics, heatmaps, and tips | Per-prompt hotspots, file/tool heatmaps, cache analytics | Token Studio ROI keeps transcript content out of the product and focuses on project/task/output ROI. |
| [Claude Code Usage Monitor](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor) | Real-time terminal monitoring with burn rate and prediction | Live session awareness and limit warnings | Token Studio ROI defers live monitoring and makes weekly review and model strategy the main surface. |
| [TokenTracker](https://github.com/mm7894215/TokenTracker) | Local-first dashboard, native tray/menu bar, widgets, many coding tools | Zero-config setup, desktop packaging, 22-tool coverage | Token Studio ROI is lighter-weight today but has deeper work/output attribution and publishable review artifacts. |

## Differentiation

- Work attribution: project alias, task type, output status, work purpose, stage, value, and notes.
- Output evidence: PR, commit, article, deploy, document, screenshot, or other URL without fetching linked content.
- Work item layer: multiple sessions can roll up into one deliverable.
- ROI Evidence Score: separates manually confirmed work, auto/high-confidence work, missing fields, output links, and high-cost gaps.
- ROI Advisor: local explainable rules that recommend annotation, model switching, context compression, stop-loss, output links, and policy changes.
- Model Policy export: produces a reusable Markdown strategy for when to use light, mid, or heavy models.
- Public safety: demo mode, privacy-check, `NOTICE.md`, no real SQLite in git, no prompt/response export.

## Remaining Gaps

- Collector depth is behind the broadest multi-tool products. v4.0 has six stable sources and detected-only placeholders for several others.
- Live monitoring is intentionally deferred; v4.1 should add a lightweight `/live` page only after collector correctness is stable.
- Desktop packaging is not included. Keep the public story focused on local browser + CLI first.
- Automatic attribution is rule-based and should always display provenance and confidence.
