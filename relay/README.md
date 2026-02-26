# Relay

Extension Surface: No

This directory contains the open-source implementation of the optional relay service.

## Boundary

1. The relay is external to Protege core runtime.
2. Protege does not depend on relay for local/direct mode.
3. Relay exists as a convenience path for users who cannot receive direct inbound SMTP (for example blocked port 25).
4. Relay code is included here for transparency and self-hosting, not because core Protege requires it.

## Local Run

1. Optionally create `relay/config.json` and edit as needed.  
If omitted, relay uses built-in defaults (`127.0.0.1:8080`, SMTP `127.0.0.1:2526`).
2. Run `npm run relay:start`.
3. Run `npm run relay:test:ws-auth` to perform a manual websocket challenge-response auth check.
4. Run `npm run relay:listen:ws-inbox` in a second terminal and keep it open.
5. Send SMTP into relay ingress:

```bash
swaks \
  --server 127.0.0.1:2526 \
  --from sender@example.com \
  --to <persona_pubkey_base32>@mail.protege.bot \
  --header "Subject: Relay SMTP Test" \
  --body "hello from swaks"
```

If the websocket client for that persona is authenticated, the inbox terminal will print `smtp_start`, `smtp_chunk`, and `smtp_end` tunnel frames.

Relay now also processes outbound tunnel frames (`smtp_start` + `smtp_chunk` + `smtp_end`) and attempts SMTP egress delivery from the relay host.
Outbound egress is direct-to-MX SMTP (no third-party SMTP provider required).

## Relay Service Config

`relay/config.json` fields:

1. `host`: HTTP/WebSocket bind host.
2. `port`: HTTP/WebSocket bind port.
3. `smtp.enabled`: Enables relay SMTP ingress listener.
4. `smtp.host`: SMTP ingress bind host.
5. `smtp.port`: SMTP ingress bind port.
6. All fields are strictly validated at startup; invalid types or out-of-range ports fail fast with explicit errors.

## Outbound Deliverability (Production)

For direct-to-MX outbound delivery, relay domain authentication must be configured:

1. SPF record on `mail.protege.bot` authorizing relay egress IPs.
2. PTR/rDNS for relay egress IPs pointing to `mail.protege.bot` (or your chosen mail host).
3. Optional DKIM can be added later, but SPF + PTR is the baseline for SMTP acceptance.

Without SPF/PTR alignment, providers like Gmail may reject messages as unauthenticated.

## Relay Runtime Logs

Relay emits JSON events to stdout/journal for:

1. `relay.ingress.accepted`
2. `relay.ingress.rejected`
3. `relay.outbound.queued`
4. `relay.outbound.sent`
5. `relay.outbound.failed`
6. `relay.outbound.ignored`

Example:

```json
{
  "host": "127.0.0.1",
  "port": 8080,
  "smtp": {
    "enabled": true,
    "host": "127.0.0.1",
    "port": 2526
  }
}
```

## Production Deployment

Deployment assets for VPS use with Nginx + systemd are in:

1. `relay/deploy/README.md`
2. `relay/deploy/nginx/relay.protege.bot.conf`
3. `relay/deploy/systemd/protege-relay.service`
4. `relay/deploy/scripts/sync-to-server.sh`
5. `relay/deploy/scripts/deploy-remote.sh`
6. `relay/deploy/scripts/deploy-via-ssh.sh`

Recommended workflow:

1. Configure `.env` in repo root (auto-loaded by deploy scripts):
```bash
RELAY_SSH_HOST=187.77.78.12
RELAY_SSH_USER=root
RELAY_REMOTE_DIR=/opt/protege
```
2. Run:
```bash
npm run relay:deploy
```

Common server operations from local:

```bash
npm run relay:server:restart
npm run relay:server:status
npm run relay:server:health
npm run relay:server:logs
```
