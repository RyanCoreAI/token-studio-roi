# Public Launch Checklist

Use this checklist before pushing a public GitHub release or publishing an npm package.

## Required Commands

```bash
npm test
npm run build
npm run privacy:check
npm audit --audit-level=low
npm pack --dry-run
git diff --check
```

## Screenshots

- Use `npm run demo` or `token-studio demo`.
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
- Current public tag: `v4.6.0`.
- Current local next version: `v4.7.0`.
- Historical standalone baseline: `v4.0.0`.
- Suggested topics: `ai-coding`, `token-usage`, `cost-tracking`, `local-first`, `privacy-first`, `roi`, `codex-cli`, `claude-code`.
- Release notes should say cost is official public token-price conversion, not a provider invoice.
- Keep `NOTICE.md` in the repository.

## npm

- Do not publish until `npm pack --dry-run` shows no SQLite databases, logs, `.env`, `.claude`, `.codex`, `dist`, or `node_modules`.
- If the package name is unavailable, keep GitHub clone instructions as the primary install path.
