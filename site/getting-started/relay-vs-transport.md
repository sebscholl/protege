# Relay vs Transport

Protege supports two outbound/inbound connectivity models through gateway config.

## Transport (Direct SMTP)

Gateway uses `configs/gateway.json -> transport` (`host`, `port`, `secure`, optional `auth`) for outbound SMTP.

Inbound SMTP is served by Protege gateway itself on `host:port` in `configs/gateway.json`.

Use this when:

- you control inbound SMTP routing directly
- you do not need the relay bridge

## Relay (WebSocket + SMTP Bridge)

Gateway uses `configs/gateway.json -> relay` (`enabled`, `relayWsUrl`, reconnect/heartbeat timing).

When relay is enabled:

- relay receives SMTP ingress publicly
- gateway maintains websocket auth/session per persona
- relay tunnels SMTP MIME frames to the local gateway
- outbound email can be sent via relay tunnel when no local transport is configured

## Port 25 Constraint

Many residential/consumer networks block inbound port 25. Relay exists to avoid requiring local inbound SMTP exposure.

If you have direct inbound SMTP available, relay is optional and can be skipped.

## Domain Behavior in Relay Mode

Gateway validation enforces:

- if `relay.enabled = true`, `mailDomain` cannot be `localhost`

Relay bootstrap (`protege relay bootstrap`) reconciles persona sender domains to the configured gateway `mailDomain`.

## Delivery Semantics

With relay egress:

- gateway may receive explicit relay delivery signals (`relay_delivery_result`)
- if signal timeout occurs, gateway records queued/indeterminate status to avoid duplicate resend loops

## Typical Paths

Relay-first (recommended first run):

1. `protege setup --outbound relay`
2. `protege relay bootstrap --relay-ws-url <wss://...>`
3. `protege gateway start`

Direct-local path:

1. set `configs/gateway.json` with local SMTP `transport`
2. keep `relay.enabled` false
3. `protege gateway start`
