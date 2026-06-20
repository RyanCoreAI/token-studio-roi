# Token Studio Pulse Desktop

Token Studio Pulse is an optional Electron companion for local live guardrails.

It is not a new collector and it is not the main product. It only opens the existing local `/live`, `/trust`, and `/review` surfaces.

## Privacy Boundary

- Reads the existing local Token Studio API on `127.0.0.1`.
- Starts the local Web/API service if it is not already running.
- Does not run `collect` automatically.
- Does not upload data.
- Does not read prompt, response, transcript, diff, command body, or full local paths.
- Does not claim provider subscription quotas. Budget windows are user-defined guardrails.

## Development

```bash
npm run desktop
```

The tray menu opens Pulse, Dashboard, Review, and Trust. Closing the window keeps the tray app alive; Quit exits the companion and stops the service process it started.

Desktop release assets should be produced through a separate GitHub Release workflow. The `desktop/` directory is excluded from the npm tarball because npm remains the CLI/Web distribution path.
