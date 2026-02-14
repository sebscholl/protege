# Development Guide

This document tracks local development workflows and manual verification commands.

## Mailpit (Outbound Sink) Setup

Start Mailpit locally:

```sh
docker run --rm -p 1025:1025 -p 8025:8025 axllent/mailpit
```

Mailpit web UI:

```sh
http://127.0.0.1:8025
```

Gateway transport config (`config/gateway.json`):

```json
{
  "mode": "default",
  "host": "127.0.0.1",
  "port": 2525,
  "defaultFromAddress": "protege@localhost",
  "transport": {
    "host": "127.0.0.1",
    "port": 1025,
    "secure": false
  }
}
```

## Manual Email Tests

Important behavior:

1. Outbound delivery is tool-driven.
2. The model must call `send_email` for user-visible replies to be delivered.
3. Threaded replies default to persona sender identity and `Re:` subject normalization.

Set the persona public key:

```sh
export PERSONA_PUBKEY=5whp2sfr7nigrtfmwer5m7hxufs4mzunqezkcxusge2jj3k2xosq
```

Unknown persona rejection:

```sh
swaks --server 127.0.0.1:2525 \
  --from sender@example.com \
  --to unknown@localhost \
  --header "Subject: Unknown Persona" \
  --body "hello"
```

Plain text inbound:

```sh
swaks \
  --server 127.0.0.1:2525 \
  --from sender@example.com \
  --to "$PERSONA_PUBKEY@relay-protege-mail.com" \
  --header "Subject: Manual Test" \
  --body "hello, my friend!"
```

Attachment inbound (no mimetype):

```sh
swaks \
  --server 127.0.0.1:2525 \
  --from sender@example.com \
  --to "$PERSONA_PUBKEY@relay-protege-mail.com" \
  --header "Subject: Manual Attachment Test" \
  --body "Testing inbound attachment parsing." \
  --attach @/home/sebscholl/Code/protege/tmp/pic.png
```

Attachment inbound (explicit mimetype):

```sh
swaks \
  --server 127.0.0.1:2525 \
  --from sender@example.com \
  --to "$PERSONA_PUBKEY@relay-protege-mail.com" \
  --header "Subject: Manual Attachment Test" \
  --body "Testing inbound attachment parsing with MIMETYPE." \
  --attach-type image/png \
  --attach @/home/sebscholl/Code/protege/tmp/pic.png
```

Inbound without `Message-ID`:

```sh
swaks \
  --server 127.0.0.1:2525 \
  --from sender@example.com \
  --to "$PERSONA_PUBKEY@relay-protege-mail.com" \
  --header "Subject: Missing Message-ID Test" \
  --suppress-data \
  --data "From: sender@example.com\nTo: $PERSONA_PUBKEY@relay-protege-mail.com\nSubject: Missing Message-ID Test\n\nhello"
```

Inference + reply path:

```sh
swaks --server 127.0.0.1:2525 \
  --from sender@example.com \
  --to "$PERSONA_PUBKEY@localhost" \
  --header "Subject: Manual Harness Test" \
  --body "Reply with exactly: PROTEGE_MANUAL_OK"
```

## Verify Persisted Artifacts

Latest inbound MIME files:

```sh
find memory/{persona_id}/logs/gateway/inbound -type f | tail -n 5
```

Latest attachments:

```sh
find memory/{persona_id}/attachments -type f | tail -n 10
```

Latest thread messages:

```sh
sqlite3 memory/{persona_id}/temporal.db \
  "select received_at,direction,message_id,coalesce(in_reply_to,''),subject,substr(text_body,1,160) from messages order by received_at desc limit 10;"
```

## Relay Manual Tests

Bootstrap relay mode config and persona:

```sh
tsx engine/cli/index.ts relay bootstrap --relay-ws-url ws://127.0.0.1:8080/ws
```

Start relay:

```sh
npm run relay:start
```

Manual websocket auth smoke:

```sh
npm run relay:test:ws-auth
```

Listen for tunneled SMTP frames:

```sh
npm run relay:listen:ws-inbox
```

Send SMTP into relay ingress:

```sh
swaks \
  --server 127.0.0.1:2526 \
  --from sender@example.com \
  --to <persona_pubkey_base32>@relay-protege-mail.com \
  --header "Subject: Relay SMTP Test" \
  --body "hello from swaks"
```

## Relay Debugging

Enable readable console logs in `config/system.json`:

```json
{
  "logs_dir_path": "./tmp/logs",
  "console_log_format": "pretty"
}
```

Follow relay/gateway/harness activity in one stream:

```sh
tail -f tmp/logs/protege.log
```

Trace one message flow by `correlationId`:

```sh
grep 'correlationId' tmp/logs/protege.log | tail -n 50
```

Key relay lifecycle events to watch:

1. `gateway.relay.client_starting`
2. `gateway.relay.authenticated`
3. `gateway.relay.control_message`
4. `gateway.relay.disconnected`
