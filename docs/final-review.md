# Token Studio ROI Final Review

Token Studio ROI is considered feature-complete for the v6.0 stabilization line. The product direction is fixed as:

> Local real token data -> trusted coverage -> automatic evidence queue -> ROI review -> model strategy -> action report.

## What It Does

- Collects or imports structured token metadata from local AI coding tools.
- Separates trusted native coverage, ccusage import coverage, detected-only sources, and unsupported/no-token-field tools.
- Converts trusted sessions into project, task, stage, value, output, and model-strategy evidence.
- Keeps automatic evidence separate from manual confirmation with provenance, confidence, and reasons.
- Produces local review surfaces: Dashboard, `/trust`, `/review`, `/live`, statusline, Markdown reports, professional copy-ready material packs, and the optional Desktop Pulse companion.
- Uses official public token prices for comparison and strategy; it does not claim provider-invoice accuracy.

## What It Does Not Do

- It does not read, store, display, or export prompts, responses, transcripts, diffs, command bodies, or full local paths.
- It does not estimate token usage from text length when reliable token fields are missing.
- It does not treat detected-only tools as collected usage.
- It does not provide cloud sync, accounts, multi-user access, leaderboards, or a full TUI. Desktop Pulse is only a local companion for `/live`, not a second product or cloud client.
- It does not keep chasing every competitor feature after v5.9.

## Final Acceptance Checklist

- Real-data state is visible within five seconds: demo, empty, aggregate-only, event-unverified, or event-verified.
- Coverage Bridge explains why every source has data, only detected status, or no reliable token fields.
- Local Trust shows coverage gate, daily/session/event reconciliation, source failures, and sanitized sample rows.
- Trust-to-Evidence Autopilot creates a top-10 evidence queue from trusted sources only.
- Evidence suggestions show provenance, confidence, missing fields, reason, and whether they can be written automatically.
- Review pages show evidence provenance for savings, model strategy, and advisor actions.
- Dashboard opens with filters, charts, and Token KPI before lower-priority trust and coverage details.
- `/review` copy actions open preview modals and copy professional evidence, blog, and resume/interview packs with success feedback.
- Browser `/live` and Electron Desktop Pulse share the cyberpunk Pulse live dashboard; Dashboard, Trust, and Review remain in the calm audit style.
- Desktop Pulse keeps Electron `contextIsolation`, `nodeIntegration: false`, sandbox, web security, denied permission requests, denied new windows, and local-only navigation.
- Markdown report includes Local Trust, Coverage-to-Evidence, output evidence, model strategy, and action trend sections.
- Privacy check passes and publish tarballs contain no real SQLite databases, `.env`, AI logs, real exports, or personal paths.
- Public README uses demo/sanitized screenshots by default, while local validation keeps separately labeled real screenshots:
  - `docs/assets/token-studio-v591-real-dashboard.png`
  - `docs/assets/token-studio-v591-real-trust.png`
  - `docs/assets/token-studio-v591-real-review.png`
  - `docs/assets/token-studio-v591-real-live.png`
  - `docs/assets/token-studio-v607-live-pulse.png`

## Stop Rules

After v5.9, the only approved v6 direction is Coverage Catch-up plus Desktop Pulse. Do not add unrelated large features unless a future v7 plan has a clearly new user benefit. Maintenance is limited to:

- real bugs that affect startup, collection, UI, reports, or data integrity;
- security or privacy issues;
- official price updates;
- upstream log format changes for already-supported collectors or import bridges.

Explicit non-goals after v5.9:

- making Desktop Pulse the main product, adding cloud sync, or adding auto-update/signing complexity without a separate release plan;
- leaderboard, social sharing, or multi-device cloud sync;
- account system or multi-user permissions;
- broad native collector expansion without reliable token fields;
- fake costs, fake token counts, or text-length token estimation.

## Release Position

v6.0.7 is the stabilization release candidate. npm publishing, GitHub release notes, or public promotion should only happen after the local gate, GitHub release gate, tarball smoke, browser smoke, desktop smoke, real screenshot inspection, and npm post-publish smoke pass.

The v6.0.7 candidate also fixes the live Pulse event-count regression: `/api/live` now computes 24-hour token events from the requested window instead of a fixed 500-row sample.
