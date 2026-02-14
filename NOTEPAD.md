# Manual Tests

Set the persona pubkey as a variable.

```sh
export PERSONA_PUBKEY=5whp2sfr7nigrtfmwer5m7hxufs4mzunqezkcxusge2jj3k2xosq
```

## Send a test email (unknown persona rejection)

```sh
swaks --server 127.0.0.1:2525 \
  --from sender@example.com \
  --to unknown@localhost \
  --header "Subject: Unknown Persona" \
  --body "hello"
```

## Send a test email (plain text)

```sh
swaks \
    --server 127.0.0.1:2525 \
    --from sender@example.com \
    --to "$PERSONA_PUBKEY@relay-protege-mail.com" \
    --header "Subject: Manual Test" \
    --body "hello, my friend!"
```

## Send a test email (with attachment, no MIMETYPE)

```sh
swaks \
    --server 127.0.0.1:2525 \
    --from sender@example.com \
    --to "$PERSONA_PUBKEY@relay-protege-mail.com" \
    --header "Subject: Manual Attachment Test" \
    --body "Testing inbound attachment parsing." \
    --attach @/home/sebscholl/Code/protege/tmp/pic.png
```

## Send a test email (with attachment, MIMETYPE)

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

## Send a test email (without Message-ID)

```sh
swaks \
    --server 127.0.0.1:2525 \
    --from sender@example.com \
    --to "$PERSONA_PUBKEY@relay-protege-mail.com" \
    --header "Subject: Missing Message-ID Test" \
    --suppress-data \
    --data "From: sender@example.com\nTo: $PERSONA_PUBKEY@relay-protege-mail.com\nSubject: Missing Message-ID Test\n\nhello"
```

## Positive inference test (OpenAI)

```sh
swaks --server 127.0.0.1:2525 \
  --from sender@example.com \
  --to "$PERSONA_PUBKEY@localhost" \
  --header "Subject: Manual Harness Test" \
  --body "Reply with exactly: PROTEGE_MANUAL_OK"
```

## Verify persisted artifacts

```sh
find memory/{persona_id}/logs/gateway/inbound -type f | tail -n 5
find memory/{persona_id}/attachments -type f | tail -n 10
```

## Inspect Latest Thread Messages

```sh
sqlite3 memory/{persona_id}/temporal.db \
  "select received_at,direction,message_id,coalesce(in_reply_to,''),subject,substr(text_body,1,160) from messages order by received_at desc limit 10;"
```
