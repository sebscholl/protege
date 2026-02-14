# Relay

Extension Surface: No

This directory contains the open-source implementation of the optional relay service.

## Boundary

1. The relay is external to Protege core runtime.
2. Protege does not depend on relay for local/direct mode.
3. Relay exists as a convenience path for users who cannot receive direct inbound SMTP (for example blocked port 25).
4. Relay code is included here for transparency and self-hosting, not because core Protege requires it.

## Local Run

1. Copy `relay/config.example.json` to `relay/config.json` and edit as needed.
2. Run `npm run relay:start`.
3. Run `npm run relay:test:ws-auth` to perform a manual websocket challenge-response auth check.
4. Run `npm run relay:listen:ws-inbox` in a second terminal and keep it open.
5. Send SMTP into relay ingress:

```bash
swaks \
  --server 127.0.0.1:2526 \
  --from sender@example.com \
  --to <persona_pubkey_base32>@relay-protege-mail.com \
  --header "Subject: Relay SMTP Test" \
  --body "hello from swaks"
```

If the websocket client for that persona is authenticated, the inbox terminal will print `smtp_start`, `smtp_chunk`, and `smtp_end` tunnel frames.

## Relay Service Config

`relay/config.json` fields:

1. `host`: HTTP/WebSocket bind host.
2. `port`: HTTP/WebSocket bind port.
3. `smtp.enabled`: Enables relay SMTP ingress listener.
4. `smtp.host`: SMTP ingress bind host.
5. `smtp.port`: SMTP ingress bind port.

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
