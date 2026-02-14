# Milestone 3 Plan: Relay-First Reachability

Status: Active (M3.1-M3.4 complete; M3.5 next)  
Scope: Optional external relay service + Protege relay client integration  
Boundary: Relay is external to Protege core runtime and not required for local/direct mode.

## Goals

1. Allow users without inbound port 25 to use Protege through an optional relay.
2. Keep relay implementation minimal and auditable.
3. Preserve existing tool-driven harness behavior and persona isolation.

## Non-Goals

1. No user account system/sign-in dashboard.
2. No relay-side product analytics.
3. No hard dependency on relay for core Protege operation.

## M3.1 Relay Skeleton

Status: Complete

### Tasks

1. Create relay service scaffold under `relay/`.
2. Add relay config loader and startup command.
3. Add health endpoint and structured logging.

### Tests

1. Relay starts with valid config.
2. Health endpoint returns success payload.
3. Startup/shutdown emits expected log events.

### File Targets

1. `relay/README.md` (already present)
2. `relay/src/index.ts`
3. `relay/src/config.ts`
4. `tests/relay/index.test.ts`

## M3.2 Identity + Registration

Status: Complete

### Tasks

1. Implement registration challenge issuance.
2. Implement signed challenge verification using ed25519 public key.
3. Persist minimal relay identity record:
   - `public_key`
   - `email_local_part` (derived)
   - `created_at`
   - `last_seen_at`
   - `status`

### Tests

1. Valid signatures register identity.
2. Invalid signatures are rejected.
3. Duplicate register attempts are idempotent.
4. Derived local-part format is stable lowercase base32.

### File Targets

1. `relay/src/auth/challenge.ts`
2. `relay/src/auth/verify.ts`
3. `relay/src/storage.ts`
4. `tests/relay/auth-registration.test.ts`

## M3.3 WebSocket Auth Handshake

Status: Complete

### Tasks

1. Add WS connection endpoint.
2. Enforce challenge-response auth before session activation.
3. Bind authenticated socket to one identity.

### Tests

1. Authenticated client accepted.
2. Unauthenticated client rejected.
3. Wrong key/signature rejected.
4. Replay challenge rejected.

### File Targets

1. `relay/src/ws-server.ts`
2. `relay/src/session-registry.ts`
3. `tests/relay/ws-auth.test.ts`

## M3.4 SMTP over WebSocket Tunnel

Status: Complete

### Tasks

1. Tunnel raw SMTP stream bytes over WS binary frames.
2. Route inbound SMTP streams to authenticated identity sockets.
3. Pipe outbound SMTP bytes from client back through relay send path.

### Tests

1. Inbound stream routes to correct identity.
2. Outbound stream is forwarded correctly.
3. Mid-stream disconnect is handled without process crash.
4. Unknown identity recipient is rejected.

### File Targets

1. `relay/src/smtp-ingress.ts`
2. `relay/src/tunnel.ts`
3. `tests/relay/tunnel.test.ts`

## M3.5 Local Relay Client (Protege Side)

Status: Complete

### Tasks

1. Add optional relay client mode in gateway.
2. Authenticate using persona `passport.key`.
3. Implement reconnect/backoff/heartbeat.
4. Gate traffic until authenticated.

### Tests

1. Backoff reconnect sequence works.
2. Heartbeat timeout triggers reconnect.
3. Re-auth succeeds after reconnect.
4. No message handling before auth completion.

### File Targets

1. `engine/gateway/relay-client.ts`
2. `engine/gateway/index.ts`
3. `tests/engine/gateway/relay-client.test.ts`

## M3.6 Bootstrap CLI Flow

### Tasks

1. Add CLI flow to register persona with relay.
2. Generate keypair/persona if missing.
3. Persist relay configuration.
4. Keep flow idempotent on rerun.

### Tests

1. Successful bootstrap writes expected config.
2. Rerun keeps stable identity by default.
3. Registration failures return actionable errors.

### File Targets

1. `engine/cli/index.ts`
2. `engine/cli/relay-bootstrap.ts`
3. `tests/engine/cli/relay-bootstrap.test.ts`

## M3.7 End-to-End Relay Smoke

### Tasks

1. Run relay + local gateway client in relay mode.
2. Send external-style inbound message into relay.
3. Verify local persona processing and outbound delivery path.

### Tests

1. Inbound relay-to-local processing succeeds.
2. Tool-driven outbound delivery succeeds through relay path.
3. Logs include `personaId`, `threadId`, `messageId` correlation.

### File Targets

1. `tests/e2e/relay-roundtrip.test.ts`

## Exit Criteria

1. Relay mode works end-to-end for one persona.
2. Local/direct mode remains functional without relay.
3. All new relay + gateway client tests pass with `lint`, `typecheck`, and full test suite.

## Execution Order

1. M3.1
2. M3.2
3. M3.3
4. M3.4
5. M3.5
6. M3.6
7. M3.7
