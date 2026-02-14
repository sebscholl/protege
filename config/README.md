# Config

Extension Surface: Yes

This directory contains user-editable runtime behavior configuration.

Includes model/provider settings and prompts. It should not contain runtime-generated state.

Current top-level config files:

1. `gateway.json` for SMTP gateway runtime behavior.
2. `inference.json` for harness/provider behavior.
3. `system.json` for global runtime behavior (for example unified log path).

Inference config includes provider-specific credentials:

1. `providers.openai.api_key`
2. Future providers follow the same `providers.{provider}.api_key` shape.

Gateway config includes attachment safety limits:

1. `attachmentLimits.maxAttachmentBytes`
2. `attachmentLimits.maxAttachmentsPerMessage`
3. `attachmentLimits.maxTotalAttachmentBytes`

System config includes unified runtime logging path:

1. `logs_dir_path`
2. `console_log_format` (`json` or `pretty`)
