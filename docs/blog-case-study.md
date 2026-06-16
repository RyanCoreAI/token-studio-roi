# Blog Case Study Notes

## Positioning

Token Studio ROI turns local AI coding usage into a private weekly review loop: cost, projects, work attribution, output evidence, ROI advice, and model policy.

## Problem

Most token dashboards answer "how much did I use?" Token Studio ROI asks "what did that usage produce, and how should I change my model strategy next week?"

## Product Decisions

- Local-first by default.
- No conversation content storage.
- Official-price conversion only.
- Unpriced models stay unpriced.
- Demo mode uses synthetic data.
- Detected-only sources are not treated as verified collectors.

## Engineering Highlights

- Node.js `node:sqlite` local data store.
- Collector registry with stable and detected-only source states.
- Loopback-only local write APIs.
- Privacy scanner for public readiness.
- ROI Evidence Score for evidence completeness.
- Markdown model policy export.

## Honest Limits

- Cost conversion is not a provider invoice.
- Rules do not understand task quality like a human reviewer.
- Real ROI improves only when sessions have real attribution and output links.
