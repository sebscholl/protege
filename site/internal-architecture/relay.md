# Relay Service

The relay is an optional standalone server that bridges public SMTP and your local Protege gateway. It's the piece that lets your agent receive email from the internet without opening port 25 on your machine.

**If you have direct SMTP access**, you don't need the relay at all.

## Architecture

```
Internet                         Your Machine
────────                         ────────────
Sender → SMTP (port 25) → Relay Server → WebSocket → Local Gateway
                                                           │
Local Gateway → WebSocket → Relay Server → SMTP → Recipient MX
```

The relay handles:
- **Public SMTP ingress** — accepts email from the internet
- **WebSocket tunnel** — streams email data to/from your local gateway
- **SMTP egress** — delivers your agent's outbound replies to recipient mail servers

## Authentication

The relay doesn't have user accounts or tenants. Identity is based on Ed25519 public keys:

1. Gateway connects to the relay via WebSocket
2. Relay sends a random challenge
3. Gateway signs the challenge with the persona's private key (`passport.key`)
4. Relay verifies the signature against the registered public key
5. Connection is authenticated — the relay now routes inbound email for that address to this socket

Each persona authenticates independently, so a multi-persona gateway opens one WebSocket per persona.

## Tunnel Protocol

Email data is streamed as binary frames:

| Frame | Direction | Purpose |
|-------|-----------|---------|
| `smtp_start` | Relay → Gateway | Begins a new inbound email |
| `smtp_chunk` | Relay → Gateway | A chunk of SMTP data |
| `smtp_end` | Relay → Gateway | Marks end of inbound email |
| (outbound payload) | Gateway → Relay | Outbound email for delivery |
| `relay_delivery_result` | Relay → Gateway | Delivery confirmation or failure |

The gateway reassembles the tunnel frames into a complete MIME message and processes it through the normal inbound pipeline.

## Delivery Confirmation

When the relay delivers an outbound email, it sends a `relay_delivery_result` control message back to the gateway. This lets the gateway know whether delivery succeeded or failed.

If the gateway doesn't receive a delivery signal within the configured timeout, it records the delivery as "queued/indeterminate" rather than retrying (to avoid duplicate sends).

## Relay Server Configuration

The relay server reads `relay/config.json`:

```json
{
  "host": "0.0.0.0",
  "port": 8080,
  "smtp": {
    "enabled": true,
    "host": "0.0.0.0",
    "port": 25
  }
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `host` | `127.0.0.1` | HTTP/WebSocket bind address |
| `port` | `8080` | HTTP/WebSocket port |
| `smtp.enabled` | `true` | Whether to start the SMTP server |
| `smtp.host` | `127.0.0.1` | SMTP bind address |
| `smtp.port` | `2526` | SMTP port |

## Source Files

| File | Purpose |
|------|---------|
| `relay/src/index.ts` | HTTP + WebSocket server |
| `relay/src/ws-auth.ts` | Challenge-response authentication |
| `relay/src/smtp-server.ts` | SMTP ingress server |
| `relay/src/smtp-ingress.ts` | Inbound SMTP processing |
| `relay/src/ws-connection.ts` | WebSocket connection management |
| `relay/src/storage.ts` | Relay-side data persistence |
