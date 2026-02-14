# Config

Extension Surface: Yes

This directory contains user-editable runtime behavior configuration.

Includes model/provider settings and prompts. It should not contain runtime-generated state.

Current top-level config files:

1. `gateway.json` for SMTP gateway runtime behavior.
2. `inference.json` for harness/provider behavior.

Gateway config includes attachment safety limits:

1. `attachmentLimits.maxAttachmentBytes`
2. `attachmentLimits.maxAttachmentsPerMessage`
3. `attachmentLimits.maxTotalAttachmentBytes`
