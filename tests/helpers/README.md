# Test Helpers

Extension Surface: Yes

Shared helper utilities for test setup that are reused across multiple test suites.

Helpers in this directory should stay deterministic and avoid hidden global state.

Current helper groups:
- `async.ts`: async polling/wait utilities for integration and e2e tests.
- `config.ts`: shared `config/*` file scaffolding helper for test workspaces.
- `email-fixtures.ts`: SMTP fixture streams and session doubles.
- `gateway-inbound.ts`: inbound gateway config/logger builders.
- `json.ts`: JSON-safe record casting for fixture-backed response payloads.
- `provider.ts`: provider scaffold helper for manifest/config/env test setup.
- `relay-crypto.ts`: shared relay key encoding helpers for tests.
- `relay-socket-doubles.ts`: reusable websocket/auth socket doubles for relay tests.
- `stdout.ts`: stdout capture utility for CLI output assertions.
- `workspace.ts`: fixture-template temp workspace lifecycle helper (copy/patch/cleanup), including:
  - `patchConfigFiles(...)`
  - `patchExtensionsManifest(...)`
  - `patchPersona(...)`
  - `writeFile(...)`
