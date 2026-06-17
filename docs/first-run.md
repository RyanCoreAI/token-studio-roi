# First Run Guide

This guide gets a new user from an empty checkout to a useful ROI review in about five minutes.

## 1. Start Safely With Demo Data

```bash
npm install
npm run demo
```

Demo mode uses synthetic data and does not scan `.claude`, `.codex`, Cursor, Copilot, or any other local AI logs.

## 2. Try The Import Flow Without Writing

Open the Dashboard and choose **导入/预算**.

Paste ccusage JSON or choose a local JSON file, then click **Dry-run 预检**. Token Studio reports the detected shape, daily rows, sessions, token events, ignored third-party cost fields, and unsafe conversation-like fields.

Only click **Apply 写入 SQLite** after the dry-run looks correct. Apply creates a SQLite backup before writing.

CLI equivalent:

```bash
node src/cli.mjs import-usage --format=ccusage-json --file ccusage.json --dry-run
```

## 3. Create A Custom Budget Window

In **导入/预算**, create a source-level budget such as:

- source: `Codex CLI`
- window: `60` minutes
- token budget: your own target
- USD budget: optional official-price conversion target

Token Studio does not ship provider subscription quota presets. Budgets are your own guardrails, not vendor plan limits.

## 4. Review ROI

Open `/review` and check:

- ROI Evidence Score
- Savings Simulator
- ROI Advisor
- Advisor Actions
- Markdown report export

The first useful action is usually to add one or two recommendations to the action list, then review whether similar work uses fewer tokens next week.

## Privacy Boundary

Token Studio does not store prompts, responses, transcripts, command bodies, diffs, or full file paths. Costs are official public token-price conversions and simulations, not provider invoices.
