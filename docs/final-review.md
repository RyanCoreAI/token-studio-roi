# Token Studio ROI Final Review

Token Studio ROI is considered feature-complete for the v5 local line. The product direction is fixed as:

> Local real token data -> trusted coverage -> automatic evidence queue -> ROI review -> model strategy -> action report.

## What It Does

- Collects or imports structured token metadata from local AI coding tools.
- Separates trusted native coverage, ccusage import coverage, detected-only sources, and unsupported/no-token-field tools.
- Converts trusted sessions into project, task, stage, value, output, and model-strategy evidence.
- Keeps automatic evidence separate from manual confirmation with provenance, confidence, and reasons.
- Produces local review surfaces: Dashboard, `/trust`, `/review`, `/live`, statusline, and Markdown reports.
- Uses official public token prices for comparison and strategy; it does not claim provider-invoice accuracy.

## What It Does Not Do

- It does not read, store, display, or export prompts, responses, transcripts, diffs, command bodies, or full local paths.
- It does not estimate token usage from text length when reliable token fields are missing.
- It does not treat detected-only tools as collected usage.
- It does not provide cloud sync, accounts, multi-user access, desktop widgets, leaderboards, or a full TUI.
- It does not keep chasing every competitor feature after v5.9.

## Final Acceptance Checklist

- Real-data state is visible within five seconds: demo, empty, aggregate-only, event-unverified, or event-verified.
- Coverage Bridge explains why every source has data, only detected status, or no reliable token fields.
- Local Trust shows coverage gate, daily/session/event reconciliation, source failures, and sanitized sample rows.
- Trust-to-Evidence Autopilot creates a top-10 evidence queue from trusted sources only.
- Evidence suggestions show provenance, confidence, missing fields, reason, and whether they can be written automatically.
- Review pages show evidence provenance for savings, model strategy, and advisor actions.
- Markdown report includes Local Trust, Coverage-to-Evidence, output evidence, model strategy, and action trend sections.
- Privacy check passes and publish tarballs contain no real SQLite databases, `.env`, AI logs, real exports, or personal paths.

## Stop Rules

After v5.9, do not add large new features unless a v6 plan has a clearly new user benefit. Maintenance is limited to:

- real bugs that affect startup, collection, UI, reports, or data integrity;
- security or privacy issues;
- official price updates;
- upstream log format changes for already-supported collectors or import bridges.

Explicit non-goals after v5.9:

- desktop app or menu bar widget;
- leaderboard, social sharing, or multi-device cloud sync;
- account system or multi-user permissions;
- broad native collector expansion without reliable token fields;
- fake costs, fake token counts, or text-length token estimation.

## Release Position

v5.9 is a local final polish milestone. npm publishing, GitHub release notes, or public promotion are separate release decisions and should only happen after the full local gate passes.
