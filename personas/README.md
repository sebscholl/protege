# Personas

Extension Surface: Yes

Each persona has its own configuration and identity material.

Every persona directory should contain persona metadata and a `passport.key` file used for relay identity/auth.

Standard files:

1. `persona.json` with persona id, full public key local-part, and metadata.
2. `passport.key` with raw private key material for signing/auth.

Optional `persona.json` routing field:

1. `aliases`: string array of additional inbound local-parts (or full email addresses) that route to the same persona in local/direct transport mode.
2. Local-part aliases (for example `charlie`) are resolved as `charlie@<gateway.mailDomain>`.
3. Inbound recipient domain must match configured `gateway.mailDomain`; mismatched domains are rejected.
4. Plus-addressed recipients route to the same base alias/root mailbox (for example `charlie+123@...` resolves as `charlie@...`).

Scheduler source files:

1. `responsibilities/` is the file-first scheduler definition directory.
2. Each responsibility is one markdown file: `<responsibility_id>.md`.
3. Required frontmatter keys:
   - `name`
   - `schedule`
   - `enabled`
4. Markdown body is the canonical prompt text used for scheduler runs.
