## Send a test email (plain text)

```sh
swaks \
    --server 127.0.0.1:2525 \
    --from sender@example.com \
    --to {persona_pubkey}@relay-protege-mail.com \
    --header "Subject: Manual Test" \
    --body "hello"
```

## Send a test email (with attachment, no MIMETYPE)

```sh
swaks \
    --server 127.0.0.1:2525 \
    --from sender@example.com \
    --to {persona_pubkey}@relay-protege-mail.com \
    --header "Subject: Manual Attachment Test" \
    --body "Testing inbound attachment parsing." \
    --attach @/home/sebscholl/Code/protege/tmp/pic.png
```

## Send a test email (with attachment, MIMETYPE)

```sh
swaks \
    --server 127.0.0.1:2525 \
    --from sender@example.com \
    --to {persona_pubkey}@relay-protege-mail.com \
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
    --to {persona_pubkey}@relay-protege-mail.com \
    --header "Subject: Missing Message-ID Test" \
    --suppress-data \
    --data "From: sender@example.com\nTo: {persona_pubkey}@relay-protege-mail.com\nSubject: Missing Message-ID Test\n\nhello"
```

## Verify persisted artifacts

```sh
find memory/{persona_id}/logs/gateway/inbound -type f | tail -n 5
find memory/{persona_id}/attachments -type f | tail -n 10
```
