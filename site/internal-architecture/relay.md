# Relay Service

Relay is optional infrastructure, external to core Protege runtime.

## Role

- public SMTP ingress endpoint
- websocket tunnel bridge to local gateway
- direct-to-MX SMTP egress for outbound relay sends

Protege can run without relay when direct SMTP is available.

## Auth Model

- identity is agent public key (ed25519)
- websocket auth uses challenge-response signatures
- no user account/tenant model in relay

## Runtime Components

- HTTP + websocket server (`relay/src/index.ts`)
- websocket auth (`relay/src/ws-auth.ts`)
- SMTP ingress server (`relay/src/smtp-server.ts`)
- tunnel frame codec (`relay/src/tunnel.ts`)
- outbound delivery assembler (`relay/src/outbound.ts`)

## Config (`relay/config.json`)

```json
{
  "host": "127.0.0.1",
  "port": 8080,
  "smtp": {
    "enabled": true,
    "host": "0.0.0.0",
    "port": 25
  }
}
```

Defaults when file missing:

- host `127.0.0.1`
- port `8080`
- smtp host `127.0.0.1`
- smtp port `2526`

## Tunnel Protocol (high level)

- `smtp_start`
- `smtp_chunk`
- `smtp_end`

Inbound: SMTP stream -> frames -> authenticated gateway session.

Outbound: gateway frames -> relay MIME assembly -> SMTP egress delivery.

## Delivery Control

Relay emits `relay_delivery_result` control payloads back to originating socket for sent/failed acknowledgement semantics.
