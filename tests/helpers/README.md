# Test Helpers

Extension Surface: Yes

Shared helper utilities for test setup that are reused across multiple test suites.

Helpers in this directory should stay deterministic and avoid hidden global state.

Current helper groups:
- `email-fixtures.ts`: SMTP fixture streams and session doubles.
- `gateway-inbound.ts`: inbound gateway config/logger builders.
- `json.ts`: JSON-safe record casting for fixture-backed response payloads.
- `relay-crypto.ts`: shared relay key encoding helpers for tests.
- `relay-socket-doubles.ts`: reusable websocket/auth socket doubles for relay tests.
