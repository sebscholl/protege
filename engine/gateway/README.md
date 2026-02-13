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
3. Raw MIME and attachments are persisted under `memory/`.
4. Outbound replies include deterministic threading headers.
