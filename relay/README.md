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
For websocket clients that support it, relay emits delivery control messages (`relay_delivery_result`) so callers can distinguish queued vs sent/failed outcomes.
If delivery control signaling is delayed, gateway may classify the send as queued/indeterminate rather than hard-failed to avoid duplicate resend behavior.

## Inbound Recipient Semantics

Inbound SMTP recipient handling is per-recipient (`RCPT TO`) with partial acceptance:

1. Valid routable recipient: accepted (`250`).
2. Persona exists but not connected: transient reject (`450`).
3. Invalid/non-routable relay recipient: permanent reject (`550`).
4. Recipient cap exceeded: reject (`452`).
5. If at least one recipient was accepted, relay accepts `DATA` and delivers to accepted recipients only.
6. If no recipients are deliverable at `DATA`, relay rejects the transaction with `451 relay_rejected_no_deliverable_recipients`.

This preserves standard SMTP behavior and prevents open-relay behavior while still allowing multi-recipient fanout for accepted relay-domain recipients.

## Recipient Matrix Verification (VPS)

Run these against relay SMTP ingress (replace host/port/domain as needed):

```bash
# 1) No valid recipients (expect SMTP reject, no tunnel delivery)
swaks \
  --server 127.0.0.1:2526 \
  --from sender@example.com \
  --to missing@mail.protege.bot \
  --header "Subject: relay matrix no-valid" \
  --body "no valid recipients"

# 2) Partial valid recipients (expect accept for connected recipient, reject for missing)
swaks \
  --server 127.0.0.1:2526 \
  --from sender@example.com \
  --to yfmburayk6aopcravxelkivpnaapqtv72waorqc53eiikc36li6a@mail.protege.bot \
  --header "To: yfmburayk6aopcravxelkivpnaapqtv72waorqc53eiikc36li6a@mail.protege.bot" \
  --header "Cc: missing@mail.protege.bot" \
  --header "Subject: relay matrix partial" \
  --body "partial valid recipients"

# 3) All valid recipients (expect fanout delivery to all connected recipients)
swaks \
  --server 127.0.0.1:2526 \
  --from sender@example.com \
  --to <connected_pubkey_a>@mail.protege.bot \
  --header "To: <connected_pubkey_a>@mail.protege.bot" \
  --header "Cc: <connected_pubkey_b>@mail.protege.bot" \
  --header "Subject: relay matrix all-valid" \
  --body "all valid recipients"

# 4) Recipient cap overflow (set smtp.maxRecipients=2; third recipient should reject)
swaks \
  --server 127.0.0.1:2526 \
  --from sender@example.com \
  --to <connected_pubkey_a>@mail.protege.bot \
  --header "To: <connected_pubkey_a>@mail.protege.bot" \
  --header "Cc: <connected_pubkey_b>@mail.protege.bot,<extra>@mail.protege.bot" \
  --header "Subject: relay matrix recipient-cap" \
  --body "recipient cap overflow"
```

Check relay logs for expected events:

1. `relay.ingress.accepted` for accepted recipients.
2. `relay.ingress.rejected` for rejected recipients.
3. `relay.ingress.rejected` includes `stage` (`rcpt` or `data`).
4. rejection reasons include:
   - `recipient_not_connected`
   - `recipient_invalid`
   - `too_many_recipients`

## Relay Service Config

`relay/config.json` fields:

1. `host`: HTTP/WebSocket bind host.
2. `port`: HTTP/WebSocket bind port.
3. `logging.consoleLogFormat`: Console log format (`json` or `pretty`).
4. `logging.prettyLogThemePath`: Pretty-log theme file path (relay-local file; uses `pretty_logs` schema).
5. `smtp.enabled`: Enables relay SMTP ingress listener.
6. `smtp.host`: SMTP ingress bind host.
7. `smtp.port`: SMTP ingress bind port.
8. `smtp.maxMessageBytes`: Max accepted inbound SMTP message size in bytes.
9. `smtp.maxRecipients`: Max recipients per inbound SMTP transaction.
10. `rateLimits.smtpConnectionsPerMinutePerIp`: Per-IP SMTP connection admission rate.
11. `rateLimits.smtpMessagesPerMinutePerIp`: Per-IP SMTP message acceptance rate.
12. `rateLimits.wsAuthAttemptsPerMinutePerIp`: Per-IP websocket auth attempt rate.
13. `rateLimits.denyWindowMs`: Temporary deny-window duration after repeated rate-limit violations.
14. `auth.challengeTtlSeconds`: Websocket auth challenge TTL.
15. `auth.maxChallengeRecords`: Max in-memory challenge records retained.
16. `auth.challengeGcIntervalMs`: Challenge garbage-collection interval.
17. `ws.heartbeatIntervalMs`: Server heartbeat interval for websocket sessions.
18. `ws.idleTimeoutMs`: Idle websocket timeout before connection close.
19. `dkim.enabled`: Enables DKIM signing for relay outbound SMTP.
20. `dkim.domainName`: DKIM signing domain (for example `mail.protege.bot`).
21. `dkim.keySelector`: DKIM DNS selector (for example `default`).
22. `dkim.privateKeyPath`: Path to DKIM private key PEM file (resolved relative to `relay/config.json` when not absolute).
23. `dkim.headerFieldNames`: Header list signed by DKIM.
24. `dkim.skipFields`: Headers excluded from DKIM signing.
25. All fields are strictly validated at startup; invalid types or out-of-range values fail fast with explicit errors.

## Outbound Deliverability (Production)

For direct-to-MX outbound delivery, relay domain authentication must be configured:

1. SPF record on `mail.protege.bot` authorizing relay egress IPs.
2. DKIM DNS record on `<selector>._domainkey.mail.protege.bot` and matching relay private key configured in `relay/config.json`.
3. PTR/rDNS for relay egress IPs pointing to `mail.protege.bot` (or your chosen mail host).

Without SPF/DKIM/PTR alignment, providers like Gmail may reject messages as unauthenticated.

## Relay Runtime Logs

Relay emits JSON events to stdout/journal for:

1. `relay.ingress.accepted`
2. `relay.ingress.rejected`
3. `relay.outbound.queued`
4. `relay.outbound.sent`
5. `relay.outbound.failed`
6. `relay.outbound.ignored`
7. `relay.ws.auth.attempted`
8. `relay.ws.auth.challenged`
9. `relay.ws.auth.accepted`
10. `relay.ws.auth.rejected`

Set `logging.consoleLogFormat` to `pretty` to render multi-line readable logs with color/style from `logging.prettyLogThemePath`.

Example:

```json
{
  "host": "127.0.0.1",
  "port": 8080,
  "logging": {
    "consoleLogFormat": "json",
    "prettyLogThemePath": "relay/theme.json"
  },
  "smtp": {
    "enabled": true,
    "host": "127.0.0.1",
    "port": 2526,
    "maxMessageBytes": 10485760,
    "maxRecipients": 1
  },
  "rateLimits": {
    "smtpConnectionsPerMinutePerIp": 60,
    "smtpMessagesPerMinutePerIp": 30,
    "wsAuthAttemptsPerMinutePerIp": 20,
    "denyWindowMs": 300000
  },
  "auth": {
    "challengeTtlSeconds": 60,
    "maxChallengeRecords": 10000,
    "challengeGcIntervalMs": 60000
  },
  "ws": {
    "heartbeatIntervalMs": 30000,
    "idleTimeoutMs": 120000
  },
  "dkim": {
    "enabled": false,
    "domainName": "mail.protege.bot",
    "keySelector": "default",
    "privateKeyPath": "keys/dkim.private.key",
    "headerFieldNames": "from:sender:reply-to:subject:date:message-id:to:cc:mime-version:content-type:content-transfer-encoding",
    "skipFields": "message-id:date"
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

1. Configure `.relay.env` in repo root (auto-loaded by deploy scripts):
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
