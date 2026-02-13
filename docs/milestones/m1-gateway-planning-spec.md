# Milestone 1 Planning Spec: Gateway (Local Email Roundtrip)

- Status: Draft for sign-off
- Date: 2026-02-13
- Scope owner: Protege team

## 1. Goal

Prove email protocol handling end-to-end before introducing inference logic.

Milestone 1 is successful when Protege can:

1. Receive an inbound SMTP message locally.
2. Parse and normalize it.
3. Persist message artifacts (including attachments).
4. Send a deterministic threaded reply.
5. Pass unit/integration/manual checks.

## 2. Constraints and Inputs

1. User environment may have inbound port 25 blocked by ISP.
2. Gateway dev mode will run on local port `2525`.
3. CLI shape:
   - `protege gateway start`
   - `protege gateway start --dev`
   - `protege gateway stop`
   - `protege gateway restart`
4. If inbound `Message-ID` is missing, generate a synthetic ID and treat it as canonical for threading.
5. Persist inbound attachments in `memory/attachments/`.
6. Enforce configurable attachment limits from `config/gateway.json`:
   - `maxAttachmentBytes`
   - `maxAttachmentsPerMessage`
   - `maxTotalAttachmentBytes`

## 3. Outbound Test Strategy (Given ISP Port Constraint)

Inbound internet SMTP cannot be validated in M1 without relay/public MX. For M1, use one of:

1. Local sink path (primary, deterministic): Mailpit/MailHog-style local capture.
2. Hosted SMTP sandbox (secondary/manual verification).

Hosted sandbox options (for optional manual checks):

1. Mailtrap Email Sandbox (fake SMTP capture, non-delivery).
2. Resend SMTP (SMTP credentials and standard ports; requires domain/API setup).

## 4. Deliverables

1. `engine/gateway/` local SMTP server implementation.
2. Message parser + normalized inbound model.
3. Outbound reply composer/sender.
4. Attachment persistence flow.
5. CLI command entry for gateway start modes.
6. Tests mirrored under `tests/engine/gateway/...`.
7. Operational README for `engine/gateway/` with run/debug steps.

## 5. Proposed Module Design

1. `engine/gateway/types.ts`
   - Inbound normalized message types
   - Outbound reply request types
2. `engine/gateway/inbound.ts`
   - SMTP listener bootstrap
   - Message parse + normalization
   - Attachment persistence
3. `engine/gateway/threading.ts`
   - Message-ID extraction/generation
   - `In-Reply-To` and `References` construction
4. `engine/gateway/outbound.ts`
   - Nodemailer transport factory
   - Reply send function
5. `engine/gateway/index.ts`
   - Runtime wiring for inbound -> temporary hardcoded responder

## 6. Data Contracts (M1)

### 6.1 Inbound Normalized Message

Required fields:

1. `messageId` (actual or synthetic)
2. `threadId` (derived from references/message-id strategy)
3. `from`
4. `to`
5. `cc` (optional)
6. `bcc` (optional, usually unavailable from inbound headers)
7. `subject`
8. `text`
9. `html` (optional)
10. `references` (normalized list)
11. `receivedAt`
12. `rawMimePath`
13. `attachments` (metadata + persisted path)
14. `envelopeRcptTo` (SMTP envelope recipients, separate from header recipients)

Notes:

1. `bcc` is not reliably present in received message headers and may be empty/unknown.
2. When available, envelope recipient metadata from SMTP session should be persisted separately from header fields.

### 6.2 Attachment Metadata

1. `filename`
2. `contentType`
3. `size`
4. `storagePath`
5. `contentId` (optional)
6. `checksum` (optional in M1, recommended)

### 6.3 Outbound Reply Request

1. `to`
2. `from`
3. `cc` (optional)
4. `bcc` (optional)
5. `subject`
6. `text`
7. `html` (optional)
8. `inReplyTo`
9. `references`
10. `headers` (optional extensibility)

## 7. Threading Rules

1. If inbound has valid `Message-ID`, use it as parent.
2. If inbound has no `Message-ID`, generate synthetic ID:
   - format: `<synthetic.{uuid}@protege.local>`
3. Outbound `In-Reply-To` is parent message ID.
4. Outbound `References` appends parent ID to inbound references chain.
5. Subject normalization:
   - if missing `Re:` prefix, prepend `Re: ` for replies.
6. Recipient policy for M1 replies:
   - default reply target is original sender (`from`) only.
   - `cc`/`bcc` forwarding behavior is explicitly controlled by outbound request fields (no implicit reply-all in M1).
7. Internal `threadId` derivation algorithm:
   - if `References` has values, anchor on last reference value.
   - else if `In-Reply-To` exists, anchor on `In-Reply-To`.
   - else anchor on inbound `messageId` (actual or synthetic).
   - `threadId` is `sha256(normalizedAnchorMessageId)`.
8. Normalization for anchor Message-ID values:
   - trim whitespace
   - lowercase
   - ensure bracketed format for consistency before hashing

## 8. Storage and Logging Rules

1. Persist raw MIME under `memory/logs/gateway/inbound/`.
2. Persist attachments under `memory/attachments/{messageId}/`.
3. Log structured events (JSON):
   - `gateway.inbound.received`
   - `gateway.inbound.parsed`
   - `gateway.inbound.attachments_persisted`
   - `gateway.outbound.sending`
   - `gateway.outbound.sent`
   - `gateway.error`
4. Include correlation fields:
   - `messageId`
   - `threadId`
   - `smtpSessionId` when available

## 9. Failure Policy (M1)

1. Inbound parse failure:
   - log error + raw MIME reference
   - do not crash process
2. Attachment write failure:
   - reject inbound message processing and do not dispatch `onMessage`
   - emit error details for operator visibility
3. Attachment limit violation:
   - reject inbound message processing and do not dispatch `onMessage`
   - include reason (`count`, `per-file`, or `total-size`) in error output
4. Outbound send failure:
   - retry up to 3 attempts with exponential backoff
   - emit terminal error event after max retries

## 10. Testing Plan

## 10.1 Unit Tests

1. Message-ID extraction and synthetic fallback.
2. Reference chain construction.
3. Subject reply normalization.
4. Attachment path generation and metadata mapping.
5. Retry policy behavior for outbound sender.

## 10.2 Integration Tests

1. Inbound SMTP message parse from fixture MIME.
2. Outbound payload includes correct threading headers.
3. Attachments persist to expected directory with metadata.
4. End-to-end local inbound -> hardcoded reply path.

## 10.3 Manual Verification

1. Start gateway in dev mode.
2. Send sample message using `swaks` or local mail client to `localhost:2525`.
3. Confirm logs and persisted artifacts.
4. Confirm outbound captured in sink/sandbox with expected headers.
5. Confirm threading in at least one client/sandbox viewer.

## 11. Definition of Done (M1)

1. Local gateway roundtrip is reliable and reproducible.
2. Threading headers are deterministic, including synthetic Message-ID fallback.
3. Attachments are persisted correctly.
4. Tests follow project conventions and pass.
5. Gateway README/runbook is complete enough for a new contributor.

## 12. Sign-Off Checklist

1. CLI shape accepted:
   - `protege gateway start`
   - `protege gateway start --dev`
   - `protege gateway stop`
   - `protege gateway restart`
2. Synthetic Message-ID fallback accepted.
3. Attachment persistence accepted.
4. Primary manual test target accepted: local sink first.
