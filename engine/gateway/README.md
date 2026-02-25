# Gateway

Extension Surface: No

Inbound and outbound email transport implementation.

Responsible for SMTP parsing/sending and relay tunneling behavior.

## Commands

1. `protege gateway start`
2. `protege gateway start --dev`
3. `protege gateway stop`
4. `protege gateway restart`

## Milestone 1 Notes

1. Dev mode runs local SMTP on configured local host/port.
2. Inbound mail is parsed and normalized for harness consumption.
3. Raw MIME and attachments are persisted under persona memory namespaces (`memory/{persona_id}/...`) after recipient routing resolves a persona.
4. Gateway runtime persists inbound thread messages to persona temporal storage before completing SMTP request handling.
5. Harness inference is enqueued asynchronously after inbound persistence to avoid long-running SMTP transactions.
6. If inbound recipient routing does not resolve to a known persona, SMTP ingestion is rejected.
7. Outbound SMTP delivery is tool-driven (`email.send`) rather than implicit fallback replies.
8. Local workspace file actions are runtime-addressable for tool execution:
   - `file.read`
   - `file.write`
   - `file.edit`
   - `file.glob`
   - `file.search`
9. Shell command execution is runtime-addressable for tool execution:
   - `shell.exec`
10. Outbound replies include deterministic threading headers when outbound transport is configured.
11. Outbound sender identity is locked to the addressed persona identity for reply consistency.
12. Threaded replies normalize subject to `Re: <inbound-subject>` by default.
13. Runtime action `email.send` defaults to `reply_current` threading; explicit `threadingMode: "new_thread"` is required to start a separate thread.

## Relay Client Notes (M3.5 In Progress)

1. `engine/gateway/relay-client.ts` provides websocket relay auth, reconnect backoff, heartbeat timeout, and pre-auth outbound gating.
2. Relay client startup is now wired behind `config.gateway.relay.enabled` and starts one client per known persona.
3. Inbound relay tunnel frames are assembled and ingested into shared gateway inbound processing.
4. Outbound `email.send` now supports relay fallback when SMTP transport is not configured.
5. Gateway and harness logs now propagate a shared `correlationId` per inbound message across receive, persistence, inference, tool calls, and runtime actions.
6. Relay lifecycle logging includes per-persona `gateway.relay.client_starting`, `gateway.relay.authenticated`, `gateway.relay.disconnected`, and `gateway.relay.control_message` events.

## Config Validation

1. `config/gateway.json` is now fail-fast validated at startup.
2. Required top-level fields: `mode`, `host`, `port`, `mailDomain`.
3. `relay` is optional, but when present must include valid websocket URL (`ws://` or `wss://`) plus positive integer timing fields.
4. Relay mode rejects `mailDomain: "localhost"` to prevent unauthenticated outbound sender domains.
5. Invalid config now exits early with explicit field-level errors.
