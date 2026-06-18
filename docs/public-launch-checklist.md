# Public Launch Checklist

Use this checklist before pushing a public GitHub release or publishing an npm package.

## Required Commands

```bash
npm test
npm run build
npm run privacy:check
node src/cli.mjs coverage --sources=claude,codex,cursor --json
npm view token-studio version
npm audit --audit-level=low
npm run smoke:npx
npm run smoke:browser
npm pack --dry-run
git diff --check
```

## Screenshots

- Use `npx token-studio demo` after npm publication, or `npm run demo` from a cloned repository.
- Confirm the UI shows Demo Mode.
- Do not use real `data/usage.sqlite`.
- Do not include real project paths, local usernames, exported reports, or private output URLs.
- Current public screenshot assets:
  - `docs/assets/token-studio-v45-dashboard.png`
  - `docs/assets/token-studio-v45-review.png`
  - `docs/assets/token-studio-v45-live.png`
  - `docs/assets/token-studio-v45-review-mobile.png`

## GitHub Release

- Repository name: `token-studio-roi`.
- Current public tag: `v4.7.0`.
- Current local next version: `v4.8.6`.
- Historical standalone baseline: `v4.0.0`.
- Suggested topics: `ai-coding`, `token-usage`, `cost-tracking`, `local-first`, `privacy-first`, `roi`, `codex-cli`, `claude-code`.
- Release notes should say cost is official public token-price conversion, not a provider invoice.
- Release notes must not claim complete historical coverage. Say Token Studio covers local history that still exists and contains reliable token fields, with `coverage` reporting gaps and reasons.
- Keep `NOTICE.md` in the repository.

## npm

- Primary package name: `token-studio`.
- Fallback package name if unavailable: `tokenroi`.
- Primary one-command real-data path: `npx token-studio`.
- Demo-only path: `npx token-studio demo`.
- Troubleshooting path: `npx token-studio --dry-run-only`, then `npx token-studio --no-collect` if you only want to inspect the current SQLite.
- Do not publish until `npm pack --dry-run` shows no SQLite databases, logs, `.env`, `.claude`, `.codex`, `dist`, or `node_modules`.
- Do not publish until `npm run smoke:npx` passes. This command installs the packed tarball in a fresh temp directory, runs the installed CLI, verifies event-level fixture collection, verifies UI/API readiness, and checks the auto-attribution proxy path.
- Do not publish until `npm run smoke:browser` passes on at least one Chromium-capable runner. This catches Dashboard `ReferenceError`, React duplicate-key warnings, and UI-port `/api` proxy connection failures.
- Do not publish until `token-studio coverage` shows Claude/Codex event-level rows or explains why they are unavailable. Cursor detected-only must not be marketed as successful native usage collection.
- If the package name is unavailable, publish the fallback only after updating README, package metadata, and release notes consistently.
- `npm whoami` must succeed before running `npm publish --access public`.
- After publish, run `npm run smoke:published -- --version 4.8.6` and verify npm latest resolves to `4.8.6`.
