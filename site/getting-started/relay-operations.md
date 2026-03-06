# Relay Operations

Relay mode is the recommended onboarding path when inbound SMTP port 25 is not available on your local network.

## What Relay Does

1. Accepts inbound SMTP publicly.
2. Tunnels SMTP payloads to your local Protege gateway over WebSocket.
3. Accepts outbound SMTP payloads from your gateway and relays them to recipient MX servers.

Core agent logic and memory still run locally in your Protege runtime.

## Local Bootstrap

1. Configure relay websocket endpoint:
```bash
protege relay bootstrap --relay-ws-url wss://relay.example.com/ws
```
This step also:
1. Enables relay mode in `configs/gateway.json`.
2. Replaces `mailDomain: localhost` with inferred relay mail domain.
3. Reconciles persona sender email domains to match `mailDomain`.
2. Start gateway:
```bash
protege gateway start
```
3. Verify status:
```bash
protege status
```

## Relay Deployment

Production relay deployment assets live under:

1. `relay/deploy/README.md`
2. `relay/deploy/systemd/`
3. `relay/deploy/nginx/`
4. `relay/deploy/scripts/`

## Deliverability Baseline

For direct-to-MX outbound from relay, configure:

1. SPF for relay mail domain.
2. PTR/rDNS for relay egress IP(s).
3. DMARC (recommended baseline policy).
