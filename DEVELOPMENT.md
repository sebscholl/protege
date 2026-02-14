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
