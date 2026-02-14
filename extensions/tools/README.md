# Tools

Extension Surface: Yes

Tool extensions expose callable capabilities to the inference harness.

Tool contracts should stay stable and explicitly documented per extension.

## Current Tools

1. `send-email`: Sends outbound email via harness runtime `context.sendEmail`.

Each tool lives in its own directory with `index.ts`, `config.json`, and `README.md`.
