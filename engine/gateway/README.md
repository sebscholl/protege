# Gateway

Extension Surface: No

Inbound and outbound email transport implementation.

Responsible for SMTP parsing/sending and relay tunneling behavior.

## Commands

1. `protege gateway start`
2. `protege gateway start --dev`
3. `protege gateway stop`
4. `protege gateway restart`

## Milestone 1 Notes

1. Dev mode runs local SMTP on configured local host/port.
2. Inbound mail is parsed and normalized for harness consumption.
3. Raw MIME and attachments are persisted under persona memory namespaces (`memory/{persona_id}/...`) after recipient routing resolves a persona.
4. Gateway runtime persists inbound thread messages to persona temporal storage before completing SMTP request handling.
5. Harness inference is enqueued asynchronously after inbound persistence to avoid long-running SMTP transactions.
6. If inbound recipient routing does not resolve to a known persona, SMTP ingestion is rejected.
7. Outbound SMTP delivery is tool-driven (`email.send`) rather than implicit fallback replies.
8. Outbound replies include deterministic threading headers when outbound transport is configured.
9. Outbound sender identity is locked to the addressed persona identity for reply consistency.
10. Threaded replies normalize subject to `Re: <inbound-subject>` by default.
